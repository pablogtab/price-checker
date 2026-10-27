import { Component, Input, ChangeDetectorRef, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import Decimal from "decimal.js";
import { ButtonDirective } from "./ui/button";
import { ProductImageComponent } from "./ui/product-image";

export interface SupplierQuoteItem {
  id: number;
  name: string;
  price: string;
  currency: string;
  stock: string | null;
  is_pack: boolean;
  image_path: string | null;
  provider_name: string;
  source_updated_at: string | null;
}
export interface CatalogQuoteState {
  items: SupplierQuoteItem[];
  markup: string;
  prices: Record<number, string>;
}

@Component({
  selector: "app-catalog-quote",
  standalone: true,
  imports: [FormsModule, ButtonDirective, ProductImageComponent],
  styleUrl: "./catalog-quote.css",
  template: `
    <section
      class="supplier-quote"
      aria-label="Cotización aproximada del proveedor"
    >
      <div class="quote-heading">
        <div>
          <h2>Cotización aproximada</h2>
          <p>
            Seleccioná productos del proveedor para pasar un precio por encargo,
            sin agregarlos a tu stock.
          </p>
        </div>
        <strong>{{ state.items.length }} seleccionados</strong>
      </div>
      @if (state.items.length) {
        <div class="quote-controls">
          <label
            >Recargo sobre el precio del proveedor (%)
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Ingresá tu recargo"
              [ngModel]="state.markup"
              (ngModelChange)="applyMarkup($event)"
            />
          </label>
          <button appButton type="button" (click)="clear()">
            Vaciar selección
          </button>
        </div>
        <p>
          Precios en ARS, redondeados a $100. Podés ajustarlos individualmente.
          Cambiar el recargo recalcula todos los precios. Los packs se cotizan
          completos.
        </p>
        @if (needsRate) {
          <p class="quote-warning" role="status">
            Hay productos en USD: configurá el tipo de cambio en Configuración
            para calcular sus precios.
          </p>
        }
        <ul class="quote-items">
          @for (item of state.items; track item.id) {
            <li>
              <pc-product-image [image]="item.image_path" [alt]="item.name" />
              <div class="quote-product">
                <strong>{{ item.name }}</strong
                ><small
                  >{{ item.provider_name }} ·
                  {{
                    item.is_pack
                      ? "Pack completo"
                      : "Presentación del proveedor"
                  }}
                  · {{ availability(item) }}</small
                >
              </div>
              <label
                >Precio aproximado (ARS)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  [attr.aria-label]="'Precio aproximado de ' + item.name"
                  [ngModel]="price(item)"
                  (ngModelChange)="setPrice(item.id, $event)"
                  placeholder="Ingresá el precio"
                />
              </label>
              <button
                appButton
                type="button"
                [attr.aria-label]="'Quitar de la cotización: ' + item.name"
                (click)="remove(item.id)"
              >
                Quitar
              </button>
            </li>
          }
        </ul>
        @if (canShare) {
          <label class="quote-preview"
            >Mensaje para el cliente<textarea
              readonly
              rows="8"
              [value]="message"
              aria-label="Mensaje de cotización aproximada"
            ></textarea>
          </label>
        } @else {
          <p role="status">
            Ingresá un recargo o completá los precios individuales para preparar
            el mensaje.
          </p>
        }
        <div class="quote-actions">
          <button
            appButton="primary"
            type="button"
            [disabled]="!canShare"
            (click)="copy()"
          >
            Copiar cotización
          </button>
          @if (canShare) {
            <a
              class="quote-whatsapp"
              [href]="whatsappUrl"
              target="_blank"
              rel="noopener noreferrer"
              >Abrir en WhatsApp</a
            >
          }
        </div>
        @if (copyStatus && lastCopyMessage === message) {
          <p role="status">{{ copyStatus }}</p>
        }
      } @else {
        <p>
          Marcá las casillas «Cotizar» del catálogo. La selección se conserva al
          buscar, filtrar o cambiar de página.
        </p>
      }
    </section>
  `,
})
export class CatalogQuoteComponent {
  @Input({ required: true }) state!: CatalogQuoteState;
  @Input() usdArs: string | null = null;
  private cdr = inject(ChangeDetectorRef);
  copyStatus = "";
  lastCopyMessage = "";

  private nonNegative(value: unknown): Decimal | null {
    if (
      value === null ||
      value === undefined ||
      String(value).trim() === "" ||
      !Number.isFinite(Number(value))
    )
      return null;
    try {
      const amount = new Decimal(String(value));
      return amount.isFinite() && amount.gte(0) ? amount : null;
    } catch {
      return null;
    }
  }
  private basePrice(item: SupplierQuoteItem): Decimal | null {
    const cost = this.nonNegative(item.price);
    if (!cost) return null;
    if (item.currency === "ARS") return cost;
    const rate = this.nonNegative(this.usdArs);
    return item.currency === "USD" && rate?.gt(0) ? cost.mul(rate) : null;
  }
  get needsRate() {
    return this.state.items.some(
      (item) => item.currency === "USD" && this.basePrice(item) === null,
    );
  }
  price(item: SupplierQuoteItem): string | null {
    if (Object.hasOwn(this.state.prices, item.id)) {
      const amount = this.nonNegative(this.state.prices[item.id]);
      return amount?.gt(0) && amount.decimalPlaces() <= 2
        ? amount.toString()
        : null;
    }
    const base = this.basePrice(item),
      markup = this.nonNegative(this.state.markup);
    if (!base || !markup) return null;
    return base
      .mul(markup.div(100).plus(1))
      .div(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .mul(100)
      .toString();
  }
  setPrice(id: number, value: unknown) {
    this.state.prices[id] = value === null ? "" : String(value);
    this.copyStatus = "";
  }
  applyMarkup(value: unknown) {
    this.state.markup = value === null ? "" : String(value);
    this.state.prices = {};
    this.copyStatus = "";
  }
  remove(id: number) {
    this.state.items = this.state.items.filter((item) => item.id !== id);
    delete this.state.prices[id];
    this.copyStatus = "";
  }
  clear() {
    this.state.items = [];
    this.state.prices = {};
    this.copyStatus = "";
  }
  availability(item: SupplierQuoteItem) {
    if (
      item.stock === null ||
      item.stock === undefined ||
      !Number.isFinite(Number(item.stock))
    )
      return "Disponibilidad a confirmar";
    return Number(item.stock) > 0
      ? "Por encargo"
      : "Sin stock del proveedor · consultar reposición";
  }
  get canShare() {
    return (
      this.state.items.length > 0 &&
      !this.needsRate &&
      this.state.items.every((item) => {
        const price = this.nonNegative(this.price(item));
        return price !== null && price.gt(0);
      })
    );
  }
  get message() {
    if (!this.canShare) return "";
    const money = new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 2,
    });
    const lines = this.state.items.map(
      (item) =>
        `• ${item.name}${item.is_pack ? " (pack completo)" : ""}: ${money.format(Number(this.price(item)))}\n  ${this.availability(item)}`,
    );
    return [
      "Cotización aproximada",
      "",
      ...lines,
      "",
      "Precios estimados en ARS, sujetos a confirmación de precio y disponibilidad del proveedor. Consultá antes de encargar.",
    ].join("\n");
  }
  get whatsappUrl() {
    return "https://wa.me/?text=" + encodeURIComponent(this.message);
  }
  async copy() {
    if (!this.canShare) return;
    const text = this.message;
    this.lastCopyMessage = text;
    try {
      await navigator.clipboard.writeText(text);
      this.copyStatus =
        this.message === text
          ? "Cotización copiada."
          : "La selección cambió. Copiá nuevamente la cotización.";
    } catch {
      this.copyStatus =
        "No se pudo copiar automáticamente. Seleccioná el mensaje y copialo manualmente.";
    }
    this.cdr.markForCheck();
  }
}
