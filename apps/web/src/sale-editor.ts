import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  inject,
  ChangeDetectorRef,
} from "@angular/core";
import Decimal from "decimal.js";
import { FormsModule } from "@angular/forms";
import { A11yModule } from "@angular/cdk/a11y";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { SelectComponent } from "./select";
import { ButtonDirective } from "./ui/button";
@Component({
  selector: "app-sale-editor",
  standalone: true,
  imports: [FormsModule, A11yModule, SelectComponent, ButtonDirective],
  styles: [
    `
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 950;
        background: #0006;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .editor {
        background: white;
        border-radius: 16px;
        padding: 24px;
        width: 1000px;
        max-width: 100%;
        max-height: 92dvh;
        overflow: auto;
      }
      .fields,
      .line {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr;
        gap: 16px;
        margin: 20px 0;
      }
      .line {
        padding: 16px;
        background: var(--surface-subtle, #f7f9f5);
        border: 1px solid var(--border, #ddd);
        border-radius: 12px;
      }
      .line label,
      .fields label {
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      .identity {
        grid-column: 1/-1;
      }
      .actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        margin-top: 24px;
        flex-wrap: wrap;
      }
      .preview {
        background: #f0f5ee;
        padding: 16px;
        border-radius: 12px;
      }
      .discount-toggle {
        display: flex;
        gap: 4px;
      }
      .discount-toggle button[aria-pressed="true"] {
        background: var(--surface-subtle, #edf3fa);
        border-color: var(--primary, #2378cf);
      }
      .payment-row {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 16px;
        margin: 16px 0;
      }
      .payment-row label {
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      .payments {
        border-top: 1px solid var(--border, #ddd);
        padding-top: 12px;
      }
      .muted {
        color: var(--muted, #68746b);
      }
      input {
        width: 100%;
        box-sizing: border-box;
      }
      .components {
        grid-column: 1/-1;
        display: grid;
        gap: 12px;
      }
      button {
        max-width: 100%;
      }
      @media (max-width: 650px) {
        .fields,
        .line,
        .payment-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 16px;
        }
        .editor {
          padding: 16px;
        }
        .identity,
        .components {
          grid-column: auto;
        }
      }
    `,
  ],
  template: `<div class="backdrop">
    <section
      class="editor"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-editor-title"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
    >
      <h2 id="sale-editor-title">Editar venta #{{ sale.id }}</h2>
      <p>
        Conservamos precios y costos históricos. Los productos nuevos usan
        valores actuales.
      </p>
      @if (!preview) {
        <div class="fields">
          <label
            >Cliente<app-select
              label="Cliente de la venta"
              [options]="clientOptions"
              [(ngModel)]="customer"
              (ngModelChange)="changed()" /></label
          ><label
            >Fecha<input
              aria-label="Fecha de venta"
              type="date"
              [(ngModel)]="soldOn"
              (ngModelChange)="changed()" /></label
          ><label
            >Nota<input
              aria-label="Nota de venta"
              [(ngModel)]="note"
              (ngModelChange)="changed()"
          /></label>
        </div>
        <h3>Productos de la venta</h3>
        @for (line of lines; track line) {
          <div class="line">
            <div class="identity">
              <strong>{{ line.name }}</strong>
              <button appButton="ghost" (click)="remove(line)">Quitar</button>
            </div>
            <label
              >Cantidad<input
                aria-label="Cantidad editada"
                type="number"
                min="1"
                step="1"
                [(ngModel)]="line.quantity"
                (ngModelChange)="changed()" /></label
            ><label
              >Precio unitario (ARS)<input
                aria-label="Precio editado"
                type="number"
                min="0"
                step=".01"
                [(ngModel)]="line.unit_price"
                (ngModelChange)="line.priceEdited = true; changed()"
            /></label>
            <div class="components">
              @for (part of line.parts; track part) {
                @if (part.options.length > 1) {
                  <label
                    >{{ part.name
                    }}<app-select
                      [label]="'Sabor de ' + part.name"
                      [options]="part.options"
                      [(ngModel)]="part.product_id"
                      (ngModelChange)="flavorChanged(line)"
                  /></label>
                } @else {
                  @if (
                    line.parts.length > 1 || line.product_id !== part.product_id
                  ) {
                    <small
                      >{{ part.name }} · {{ part.quantity }} por unidad</small
                    >
                  }
                }
              }
            </div>
          </div>
        }
        <label
          >Agregar producto o promo<app-select
            label="Agregar producto a la venta"
            placeholder="Buscar producto o promo…"
            [options]="productOptions"
            [(ngModel)]="adding"
            (ngModelChange)="add()"
        /></label>
        <div class="fields">
          <label
            >Descuento
            <div
              class="discount-toggle"
              role="group"
              aria-label="Tipo de descuento"
            >
              <button
                appButton="outline"
                [attr.aria-pressed]="discountMode === 'amount'"
                (click)="discountMode = 'amount'; changed()"
              >
                ARS
              </button>
              <button
                appButton="outline"
                [attr.aria-pressed]="discountMode === 'percent'"
                (click)="discountMode = 'percent'; changed()"
              >
                %
              </button>
            </div></label
          ><label
            >{{ discountMode === "amount" ? "Importe (ARS)" : "Porcentaje (%)"
            }}<input
              aria-label="Descuento editado"
              type="number"
              min="0"
              step=".01"
              [(ngModel)]="discountValue"
              (ngModelChange)="changed()"
          /></label>
        </div>
        @if (payments.length) {
          <section class="payments">
            <h3>Cobros de esta venta</h3>
            <p class="muted">
              Corregí solo lo necesario. Si bajás el total, ajustá también el
              importe cobrado.
            </p>
            @for (payment of payments; track payment.id; let n = $index) {
              <div class="payment-row">
                <label
                  >Importe cobrado (ARS)<input
                    [attr.aria-label]="'Importe del cobro ' + (n + 1)"
                    type="number"
                    min="0"
                    step=".01"
                    [(ngModel)]="payment.amount"
                    (ngModelChange)="changed()"
                /></label>
                <label
                  >Cuenta<app-select
                    [label]="'Cuenta del cobro ' + (n + 1)"
                    [options]="accountOptions"
                    [(ngModel)]="payment.account_id"
                    (ngModelChange)="changed()"
                /></label>
                <label
                  >Fecha<input
                    [attr.aria-label]="'Fecha del cobro ' + (n + 1)"
                    type="date"
                    [(ngModel)]="payment.occurred_on"
                    (ngModelChange)="changed()"
                /></label>
              </div>
            }
          </section>
        }
      }
      @if (error) {
        <p role="alert" class="alert danger">{{ error }}</p>
      }
      @if (preview) {
        <div class="preview">
          <h3>Revisá antes de guardar</h3>
          <p>
            Cliente: {{ clientName(preview.before.customer_id) }} →
            {{ clientName(preview.after.customer_id) }}
          </p>
          <p>
            Fecha: {{ day(preview.before.sold_on) }} →
            {{ day(preview.after.sold_on) }}
          </p>
          @for (item of lines; track item) {
            <p>
              {{ item.name }} · {{ item.quantity }} ×
              {{ money(item.unit_price) }}
            </p>
          }

          <p>
            Total: {{ money(preview.before.total) }} →
            {{ money(preview.after.total) }}
          </p>
          @if (preview.after.paid != null) {
            <p>
              Cobrado: {{ money(preview.before.paid) }} →
              {{ money(preview.after.paid) }} · Pendiente:
              {{ money(preview.after.pending) }}
            </p>
            @for (payment of preview.after.payments; track payment.id) {
              <p>
                Cobro #{{ payment.id }}:
                {{ money(originalPayment(payment.id).amount) }} →
                {{ money(payment.amount) }} ·
                {{ accountName(originalPayment(payment.id).account_id) }} →
                {{ payment.account_name }} ·
                {{ originalPayment(payment.id).occurred_on }} →
                {{ payment.occurred_on }}
              </p>
            }
            @for (account of preview.cash; track account.account_id) {
              <p>
                {{ account.name }} · saldo {{ money(account.before) }} →
                {{ money(account.after) }}
              </p>
            }
          }
          @for (s of preview.stock; track s.product_id) {
            <p>
              {{ s.name }} · stock actual {{ s.before }} → {{ s.after }}
              @if (s.consumed_before != null) {
                <span>
                  · Unidades consumidas: {{ s.consumed_before }} →
                  {{ s.consumed_after }}</span
                >
              }
            </p>
          }
          @for (c of preview.debts; track c.customer_id) {
            <p>
              Deuda de {{ c.name }}: {{ money(c.before) }} →
              {{ money(c.after) }}
            </p>
          }
          @for (w of preview.warnings; track w) {
            <p role="alert">{{ w }}</p>
          }
        </div>
      }
      <div class="actions">
        <button appButton="ghost" [disabled]="busy" (click)="closed.emit()">
          Cancelar
        </button>
        @if (preview) {
          <button
            appButton="outline"
            [disabled]="busy"
            (click)="preview = null"
          >
            Seguir editando
          </button>
          <button appButton="primary" [disabled]="busy" (click)="confirm()">
            Confirmar cambios
          </button>
        } @else {
          <button
            appButton="primary"
            [disabled]="busy || !lines.length"
            (click)="review()"
          >
            Revisar cambios
          </button>
        }
      </div>
    </section>
  </div>`,
})
export class SaleEditorComponent implements OnInit {
  @Input() sale: any;
  @Input() products: any[] = [];
  @Input() clients: any[] = [];
  @Input() accounts: any[] = [];
  payments: any[] = [];
  get accountOptions() {
    return this.accounts
      .filter((a) => a.currency === "ARS" && a.opening_balance != null)
      .map((a) => ({ value: a.id, label: a.name }));
  }
  clientName(id: number) {
    return this.clients.find((c) => c.id === id)?.name || "Consumidor final";
  }
  accountName(id: number) {
    return this.accounts.find((a) => a.id === id)?.name || "Cuenta #" + id;
  }
  originalPayment(id: number) {
    return this.sale.payments.find((p: any) => p.id === id) || {};
  }
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  lines: any[] = [];
  customer: any = "";
  soldOn = "";
  note = "";
  discountMode = "amount";
  discountValue = "0";
  adding: any = "";
  preview: any = null;
  error = "";
  busy = false;
  requestKey = crypto.randomUUID();
  get clientOptions() {
    return [
      { value: "", label: "Consumidor final" },
      ...this.clients.map((c) => ({ value: c.id, label: c.name })),
    ];
  }
  get productOptions() {
    return this.products
      .filter((p) => !p.archived)
      .map((p) => ({ value: p.id, label: p.name, detail: p.code }));
  }
  options(id: number) {
    const p = this.products.find((p) => p.id === id);
    return this.products
      .filter(
        (v) =>
          v.id === id ||
          (p?.variant_group &&
            v.kind !== "kit" &&
            v.variant_group === p.variant_group),
      )
      .map((v) => ({ value: v.id, label: v.name }));
  }
  ngOnInit() {
    this.payments = (this.sale.payments || []).map((p: any) => ({ ...p }));
    this.customer = this.sale.customer_id || "";
    this.soldOn = this.sale.sold_on;
    this.note = this.sale.note || "";
    this.discountMode = this.sale.discount_mode || "amount";
    this.discountValue = this.sale.discount_value || "0";
    this.lines = this.sale.items.map((i: any) => ({
      ...i,
      name: i.product_name,
      parts: i.components.flatMap((p: any) => {
        const units = p.quantity / i.quantity;
        const options =
          i.product_id === p.product_id ? [] : this.options(p.product_id);
        const split = options.length > 1 && units <= 1000;
        return Array.from({ length: split ? units : 1 }, (_, n) => ({
          original_component_id: p.id,
          original_product_id: p.product_id,
          product_id: p.product_id,
          name: p.product_name + (split ? " · unidad " + (n + 1) : ""),
          quantity: split ? 1 : units,
          options: split ? options : [],
        }));
      }),
    }));
  }
  changed() {
    this.preview = null;
    this.error = "";
    this.requestKey = crypto.randomUUID();
  }
  remove(l: any) {
    this.lines = this.lines.filter((i) => i !== l);
    this.changed();
  }
  add() {
    const p = this.products.find((p) => p.id === Number(this.adding));
    if (!p) return;
    const parts: any[] = [];
    if (p.kind === "kit")
      for (const c of p.components || [])
        for (let n = 0; n < c.quantity; n++)
          parts.push({
            component_product_id: c.product_id,
            product_id: c.variant_group ? "" : c.product_id,
            name: c.name || c.product_name,
            quantity: 1,
            options: c.variant_group
              ? c.variants.map((v: any) => ({ value: v.id, label: v.name }))
              : [],
          });
    this.lines.push({
      product_id: p.id,
      name: p.name,
      quantity: 1,
      unit_price: p.selling_price,
      parts,
    });
    this.adding = "";
    this.changed();
  }
  flavorChanged(line: any) {
    const product = this.products.find((p) => p.id === line.product_id);
    if (
      !line.id &&
      !line.priceEdited &&
      product?.kit_pricing_mode === "discount"
    ) {
      const chosen = line.parts.map((part: any) =>
        this.products.find((p) => p.id === Number(part.product_id)),
      );
      if (chosen.every(Boolean)) {
        const base = chosen.reduce(
          (sum: Decimal, p: any, n: number) =>
            sum.plus(new Decimal(p.selling_price).mul(line.parts[n].quantity)),
          new Decimal(0),
        );
        line.unit_price = base
          .mul(
            new Decimal(1).minus(
              new Decimal(product.kit_discount_percent).div(100),
            ),
          )
          .div(100)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          .mul(100)
          .toString();
      }
    }
    this.changed();
  }
  body() {
    return {
      payments: this.payments,
      customer_id: this.customer || null,
      sold_on: this.soldOn,
      note: this.note,
      discount: { mode: this.discountMode, value: String(this.discountValue) },
      items: this.lines.map((l) => ({
        id: l.id,
        product_id: l.product_id,
        quantity: Number(l.quantity),
        unit_price: String(l.unit_price),
        replacements: l.id
          ? l.parts.map((p: any) => ({
              original_component_id: p.original_component_id,
              original_product_id: p.original_product_id,
              product_id: p.product_id,
              quantity: p.quantity,
            }))
          : undefined,
        selections: l.id
          ? undefined
          : l.parts
              .filter((p: any) => p.component_product_id && p.options.length)
              .reduce((out: any[], p: any) => {
                const existing = out.find(
                  (s) =>
                    s.component_product_id === p.component_product_id &&
                    s.product_id === Number(p.product_id),
                );
                if (existing) existing.quantity++;
                else
                  out.push({
                    component_product_id: p.component_product_id,
                    product_id: Number(p.product_id),
                    quantity: 1,
                  });
                return out;
              }, []),
      })),
    };
  }
  day(value: any) {
    return String(value || "")
      .slice(0, 10)
      .split("-")
      .reverse()
      .join("/");
  }
  money(v: any) {
    return Number(v).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });
  }
  async review() {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      this.preview = await firstValueFrom(
        this.http.post(
          "/api/sales/" +
            this.sale.id +
            (this.payments.length ? "/joint-edit/preview" : "/edit/preview"),
          this.body(),
        ),
      );
    } catch (e: any) {
      this.error = e.error?.message || "No se pudo revisar la venta";
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async confirm() {
    if (this.busy || !this.preview) return;
    this.busy = true;
    try {
      await firstValueFrom(
        this.http.post(
          "/api/sales/" +
            this.sale.id +
            (this.payments.length ? "/joint-edits" : "/edits"),
          {
            ...this.body(),
            request_key: this.requestKey,
            preview_token: this.preview.preview_token,
          },
        ),
      );
      this.saved.emit();
    } catch (e: any) {
      this.error =
        e.error?.message ||
        "No se pudo guardar. Podés reintentar sin duplicar.";
      if (e.status === 409) {
        this.preview = null;
        this.requestKey = crypto.randomUUID();
      }
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
}
