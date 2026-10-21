import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  inject,
  ChangeDetectorRef,
} from "@angular/core";
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
        .line {
          grid-template-columns: 1fr;
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
              (ngModelChange)="changed()"
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
                    (ngModelChange)="changed()"
                /></label>
              } @else {
                <small>{{ part.name }} · {{ part.quantity }} por unidad</small>
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
          >Descuento<app-select
            label="Tipo de descuento"
            [options]="discountOptions"
            [(ngModel)]="discountMode"
            (ngModelChange)="changed()" /></label
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
      @if (error) {
        <p role="alert" class="alert danger">{{ error }}</p>
      }
      @if (preview) {
        <div class="preview">
          <h3>Revisá antes de guardar</h3>
          <p>
            Total: {{ money(preview.before.total) }} →
            {{ money(preview.after.total) }}
          </p>
          @for (s of preview.stock; track s.product_id) {
            <p>{{ s.name }} · stock actual {{ s.before }} → {{ s.after }}</p>
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
  discountOptions = [
    { value: "amount", label: "Importe (ARS)" },
    { value: "percent", label: "Porcentaje (%)" },
  ];
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
    this.customer = this.sale.customer_id || "";
    this.soldOn = this.sale.sold_on;
    this.note = this.sale.note || "";
    this.discountMode = this.sale.discount_mode || "amount";
    this.discountValue = this.sale.discount_value || "0";
    this.lines = this.sale.items.map((i: any) => ({
      ...i,
      name: i.product_name,
      parts: i.components.map((p: any) => ({
        original_component_id: p.id,
        original_product_id: p.product_id,
        product_id: p.product_id,
        name: p.product_name,
        quantity: p.quantity / i.quantity,
        options: this.options(p.product_id),
      })),
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
  body() {
    return {
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
          "/api/sales/" + this.sale.id + "/edit/preview",
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
        this.http.post("/api/sales/" + this.sale.id + "/edits", {
          ...this.body(),
          request_key: this.requestKey,
          preview_token: this.preview.preview_token,
        }),
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
