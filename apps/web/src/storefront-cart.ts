import { Injectable, signal } from "@angular/core";
export type CartInput =
  | {
      kind: "product";
      presentationId: number;
      variantId: number;
      quantity: number;
    }
  | {
      kind: "promo";
      promoId: number;
      selections: {
        componentId: number;
        unitIndex: number;
        variantId: number;
      }[];
      quantity: number;
    };
export type CartLine = CartInput & {
  title?: string;
  labels?: string[];
  price?: string;
  subtotal?: string;
  imageUrl?: string | null;
};
const storageKey = "gevafit-public-cart-v1";
export function cartIdentity(line: CartInput) {
  return JSON.stringify(
    line.kind === "product"
      ? ["product", line.presentationId, line.variantId]
      : [
          "promo",
          line.promoId,
          [...line.selections]
            .sort(
              (a, b) =>
                a.componentId - b.componentId || a.unitIndex - b.unitIndex,
            )
            .map((s) => [s.componentId, s.unitIndex, s.variantId]),
        ],
  );
}
function identity(line: CartInput): CartInput {
  return line.kind === "product"
    ? {
        kind: "product",
        presentationId: line.presentationId,
        variantId: line.variantId,
        quantity: line.quantity,
      }
    : {
        kind: "promo",
        promoId: line.promoId,
        selections: line.selections.map((s) => ({
          componentId: s.componentId,
          unitIndex: s.unitIndex,
          variantId: s.variantId,
        })),
        quantity: line.quantity,
      };
}
@Injectable({ providedIn: "root" })
export class StorefrontCart {
  lines = signal<CartLine[]>([]);
  total = signal("0");
  loading = signal(false);
  error = signal("");
  receipt = signal<any>(null);
  submitting = signal(false);
  submission = signal<{ requestKey: string; lines: CartInput[] } | null>(null);
  orderError = signal("");
  copyText = signal(false);
  private request = 0;
  private started = false;
  start() {
    if (this.started) return;
    this.started = true;
    this.restore();
    this.restoreSubmission();
    window.addEventListener("storage", (e) => {
      if (e.key === "gevafit-public-submission-v1") {
        this.restoreSubmission();
      }
      if (e.key === storageKey) {
        this.restore();
        void this.validate();
      }
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        this.restore();
        void this.validate();
      }
    });
    if (this.lines().length && !this.submission()) void this.validate();
  }
  private restore() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (!Array.isArray(data) || data.length > 100) throw Error();
      this.lines.set(
        data
          .filter(
            (l) =>
              l &&
              Number.isSafeInteger(l.quantity) &&
              l.quantity > 0 &&
              l.quantity <= 1000000 &&
              ((l.kind === "product" &&
                Number.isSafeInteger(l.presentationId) &&
                l.presentationId > 0 &&
                Number.isSafeInteger(l.variantId) &&
                l.variantId > 0) ||
                (l.kind === "promo" &&
                  Number.isSafeInteger(l.promoId) &&
                  l.promoId > 0 &&
                  Array.isArray(l.selections) &&
                  l.selections.length > 0 &&
                  l.selections.length <= 100 &&
                  l.selections.every(
                    (s: any) =>
                      s &&
                      Number.isSafeInteger(s.componentId) &&
                      s.componentId > 0 &&
                      Number.isSafeInteger(s.variantId) &&
                      s.variantId > 0 &&
                      Number.isSafeInteger(s.unitIndex) &&
                      s.unitIndex >= 0,
                  ))),
          )
          .map((l) => ({
            ...identity(l),
            ...(typeof l.title === "string"
              ? { title: l.title.slice(0, 300) }
              : {}),
            ...(Array.isArray(l.labels)
              ? {
                  labels: l.labels
                    .filter((v: unknown) => typeof v === "string")
                    .slice(0, 100)
                    .map((v: string) => v.slice(0, 300)),
                }
              : {}),
          })),
      );
    } catch {
      this.lines.set([]);
    }
  }
  private persist() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(
          this.lines().map((l) => ({
            ...identity(l),
            ...(l.title ? { title: l.title } : {}),
            ...(l.labels ? { labels: l.labels } : {}),
          })),
        ),
      );
    } catch {
      this.error.set("No se pudo guardar el carrito en este navegador.");
    }
  }
  get count() {
    return this.lines().reduce((n, l) => n + l.quantity, 0);
  }
  async add(line: CartInput) {
    if (this.submission()) {
      this.error.set(
        "Abrí tu carrito para recuperar el pedido o comenzar una nueva compra.",
      );
      return false;
    }
    const key = cartIdentity(line),
      existing = this.lines().find((l) => cartIdentity(l) === key);
    if (
      (existing?.quantity || 0) + line.quantity > 1000000 ||
      (!existing && this.lines().length >= 100)
    ) {
      this.error.set("Se alcanzó el límite de cantidad del carrito.");
      return false;
    }
    this.lines.update((lines) =>
      existing
        ? lines.map((l) =>
            l === existing ? { ...l, quantity: l.quantity + line.quantity } : l,
          )
        : [...lines, identity(line)],
    );
    this.persist();
    await this.validate();
    return !this.error() && this.lines().some((l) => cartIdentity(l) === key);
  }
  quantity(line: CartLine, value: string) {
    if (this.submission()) return false;
    const quantity = Number(value);
    if (
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      quantity > 1000000
    ) {
      this.error.set("Ingresá una cantidad entera entre 1 y 1.000.000.");
      return false;
    }
    this.lines.update((lines) =>
      lines.map((l) =>
        cartIdentity(l) === cartIdentity(line) ? { ...l, quantity } : l,
      ),
    );
    this.persist();
    void this.validate();
    return true;
  }
  remove(line: CartLine) {
    if (this.submission()) return;
    this.lines.update((lines) =>
      lines.filter((l) => cartIdentity(l) !== cartIdentity(line)),
    );
    this.persist();
    void this.validate();
  }
  async validate() {
    if (this.submission()) return;
    const request = ++this.request;
    this.loading.set(true);
    this.error.set("");
    try {
      const r = await fetch("/api/public/storefront/cart/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines: this.lines().map(identity) }),
      });
      if (!r.ok) throw Error();
      const data = await r.json();
      if (request !== this.request) return;
      this.lines.set(data.lines);
      this.total.set(data.total);
      this.persist();
    } catch {
      if (request === this.request)
        this.error.set(
          "No se pudo revisar el carrito. Tus productos siguen guardados.",
        );
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
  private restoreSubmission() {
    try {
      const saved = JSON.parse(
        localStorage.getItem("gevafit-public-submission-v1") || "null",
      );
      if (
        saved &&
        typeof saved.requestKey === "string" &&
        Array.isArray(saved.lines)
      ) {
        this.submission.set(saved);
        void this.recover();
      } else {
        this.submission.set(null);
        this.receipt.set(null);
      }
    } catch {
      this.orderError.set("No se pudo recuperar el pedido en este navegador.");
    }
  }
  private async recover() {
    const saved = this.submission();
    if (!saved) return;
    this.submitting.set(true);
    this.orderError.set("");
    try {
      const r = await fetch(
        "/api/public/storefront/orders/requests/" + saved.requestKey,
      );
      if (r.status === 404) return;
      if (!r.ok) throw Error();
      const receipt = await r.json();
      if (this.submission()?.requestKey === saved.requestKey)
        this.receipt.set(receipt);
    } catch {
      this.orderError.set(
        "No se pudo recuperar el pedido. Volvé a intentar con la misma referencia.",
      );
    } finally {
      this.submitting.set(false);
    }
  }
  async checkout() {
    if (this.submitting()) return;
    this.orderError.set("");
    try {
      // Read the shared slot immediately before creating a key so another tab's
      // pending submission is reused. Persist the immutable payload BEFORE fetch.
      this.submitting.set(true);
      if (!navigator.locks)
        throw Error("No se pudo guardar una referencia segura");
      await navigator.locks.request("gevafit-public-order", () => {
        const existing = JSON.parse(
          localStorage.getItem("gevafit-public-submission-v1") || "null",
        );
        if (existing) this.submission.set(existing);
        if (!this.submission()) {
          const saved = {
            requestKey: crypto.randomUUID(),
            lines: this.lines().map(identity),
          };
          localStorage.setItem(
            "gevafit-public-submission-v1",
            JSON.stringify(saved),
          );
          this.submission.set(saved);
        }
      });
      this.submitting.set(true);
      const submitted = this.submission()!;
      const r = await fetch("/api/public/storefront/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(submitted),
      });
      if (!r.ok) {
        const v = await r.json();
        if (r.status === 400) {
          localStorage.removeItem("gevafit-public-submission-v1");
          this.submission.set(null);
          await this.validate();
        }
        throw Error(v.message || "No se pudo crear el pedido");
      }
      const receipt = await r.json();
      if (this.submission()?.requestKey !== submitted.requestKey) return;
      this.receipt.set(receipt);
      window.open(this.receipt().whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      this.orderError.set(
        this.submission()
          ? "No se pudo recuperar el pedido. Volvé a intentar con la misma referencia."
          : "No se pudo crear el pedido. Revisá el carrito y volvé a intentar.",
      );
    } finally {
      this.submitting.set(false);
    }
  }
  async copyMessage() {
    this.copyText.set(true);
    try {
      await navigator.clipboard.writeText(this.receipt().message);
    } catch {
      /* Text area remains available for manual copy. */
    }
  }
  newPurchase() {
    if (!this.receipt()) return;
    localStorage.removeItem("gevafit-public-submission-v1");
    this.submission.set(null);
    this.receipt.set(null);
    this.lines.set([]);
    this.total.set("0");
    this.persist();
    this.orderError.set("");
    this.copyText.set(false);
  }
}
