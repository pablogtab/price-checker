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
  private request = 0;
  private started = false;
  start() {
    if (this.started) return;
    this.started = true;
    this.restore();
    window.addEventListener("storage", (e) => {
      if (e.key === storageKey) {
        this.restore();
        void this.validate();
      }
    });
    void this.validate();
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
    return !this.error();
  }
  quantity(line: CartLine, value: string) {
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
    this.lines.update((lines) =>
      lines.filter((l) => cartIdentity(l) !== cartIdentity(line)),
    );
    this.persist();
    void this.validate();
  }
  async validate() {
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
}
