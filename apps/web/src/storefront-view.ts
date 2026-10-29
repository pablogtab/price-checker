import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CurrencyPipe } from "@angular/common";
export interface StorefrontProduct {
  id: number | string;
  kind?: "promo";
  components?: {
    componentId: number;
    label: string;
    quantity: number;
    variants: { id: number; label: string }[];
  }[];
  title: string;
  description: string;
  price: string;
  currency: "ARS";
  imageUrl: string | null;
  variants: { id: number; label: string }[];
}
@Component({
  selector: "geva-storefront-view",
  standalone: true,
  imports: [CurrencyPipe],
  template: ` <header>
      <a
        href="/"
        (click)="$event.preventDefault(); back.emit()"
        class="wordmark"
        >GEVA<span>FIT</span></a
      ><span>Tienda</span>
    </header>
    <div class="delivery">
      Entrega en Córdoba capital · Coordinamos por WhatsApp
    </div>
    <main>
      @if (detail) {
        <button class="back" (click)="back.emit()">← Volver al catálogo</button>
        <article class="detail">
          <div class="detail-photo">
            @if (detail.imageUrl) {
              <img [src]="detail.imageUrl" [alt]="detail.title" />
            } @else {
              <span>Sin imagen</span>
            }
          </div>
          <div class="detail-info">
            <p class="eyebrow">
              {{ detail.kind === "promo" ? "Promo" : "Producto" }}
            </p>
            <h1>{{ detail.title }}</h1>
            <p class="price">
              {{
                detail.price
                  | currency: "ARS" : "symbol-narrow" : "1.0-2" : "es-AR"
              }}
            </p>
            <p class="description">{{ detail.description }}</p>
            @for (
              component of detail.components || [];
              track component.componentId
            ) {
              @for (unit of units(component.quantity); track unit) {
                <fieldset>
                  <legend>{{ component.label }} · Unidad {{ unit + 1 }}</legend>
                  <div class="flavors">
                    @for (v of component.variants; track v.id) {
                      <button
                        [class.selected]="
                          promoSelected[component.componentId + ':' + unit] ===
                          v.id
                        "
                        [attr.aria-pressed]="
                          promoSelected[component.componentId + ':' + unit] ===
                          v.id
                        "
                        (click)="
                          promoSelected[component.componentId + ':' + unit] =
                            v.id
                        "
                      >
                        {{ v.label }}
                      </button>
                    }
                  </div>
                </fieldset>
              }
            }
            @if (detail.variants.length > 1) {
              <fieldset>
                <legend>Elegí un sabor</legend>
                <div class="flavors">
                  @for (v of detail.variants; track v.id) {
                    <button
                      [class.selected]="selected === v.id"
                      [attr.aria-pressed]="selected === v.id"
                      (click)="selected = v.id"
                    >
                      {{ v.label }}
                    </button>
                  }
                </div>
              </fieldset>
            } @else if (detail.variants.length) {
              <p class="variant">{{ detail.variants[0].label }}</p>
            }
          </div>
        </article>
      } @else {
        <div class="catalog-heading">
          <div>
            <p class="eyebrow">Tienda</p>
            <h1>Catálogo</h1>
          </div>
          <span>{{ total }} {{ total === 1 ? "producto" : "productos" }}</span>
        </div>
        @if (loading) {
          <p class="state" role="status">Cargando productos…</p>
        } @else if (error) {
          <div class="state" role="alert">
            <p>{{ error }}</p>
            <button (click)="retry.emit()">Volver a intentar</button>
          </div>
        } @else if (!items.length) {
          <p class="state">Todavía no hay productos publicados.</p>
        } @else {
          <div class="grid">
            @for (item of items; track item.id) {
              <a
                class="card"
                [href]="
                  item.kind === 'promo'
                    ? '/promos/' + $any(item.id).slice(6)
                    : '/products/' + item.id
                "
                (click)="$event.preventDefault(); open.emit(item)"
                ><div class="photo">
                  @if (item.imageUrl) {
                    <img
                      [src]="item.imageUrl"
                      [alt]="item.title"
                      loading="lazy"
                    />
                  } @else {
                    <span>Sin imagen</span>
                  }
                </div>
                <div class="card-info">
                  <h2>{{ item.title }}</h2>
                  <p>
                    {{ item.variants.length }}
                    {{ item.variants.length === 1 ? "opción" : "opciones" }}
                  </p>
                  <strong>{{
                    item.price
                      | currency: "ARS" : "symbol-narrow" : "1.0-2" : "es-AR"
                  }}</strong
                  ><span class="view">Ver producto <span>↗</span></span>
                </div></a
              >
            }
          </div>
        }
      }
    </main>
    <footer>GEVAFIT · Córdoba capital</footer>`,
  styleUrl: "./storefront-view.css",
})
export class StorefrontViewComponent {
  @Input() items: StorefrontProduct[] = [];
  @Input() detail: StorefrontProduct | null = null;
  @Input() total = 0;
  @Input() loading = false;
  @Input() error = "";
  @Output() open = new EventEmitter<StorefrontProduct>();
  @Output() back = new EventEmitter<void>();
  @Output() retry = new EventEmitter<void>();
  selected: number | null = null;
  promoSelected: Record<string, number> = {};
  units(quantity: number) {
    return Array.from({ length: quantity }, (_, i) => i);
  }
}
