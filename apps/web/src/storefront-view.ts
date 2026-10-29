import { StorefrontCart, CartInput } from "./storefront-cart";
import { Component, Input, Output, EventEmitter, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { SelectComponent, SelectOption } from "./select";
import { CurrencyPipe } from "@angular/common";
export interface StorefrontProduct {
  brand?: { id: string; name: string } | null;
  categoryIds?: string[];
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
  gallery?: { url: string; srcset: string }[];
  imageSrcset?: string;
  variants: {
    id: number;
    label: string;
    imageUrl?: string | null;
    imageSrcset?: string;
  }[];
}
@Component({
  selector: "geva-storefront-view",
  standalone: true,
  imports: [CurrencyPipe, FormsModule, SelectComponent],
  template: ` <header>
      <a
        href="/"
        (click)="$event.preventDefault(); back.emit()"
        class="wordmark"
        >GEVA<span>FIT</span></a
      >
      @if (cartActive) {
        <a class="cart-link" href="/cart">Ver carrito ({{ cart.count }})</a>
      } @else {
        <span>Tienda</span>
      }
    </header>
    <div class="delivery">
      Entrega en Córdoba capital · Coordinamos por WhatsApp
    </div>
    <main>
      @if (detail) {
        <button class="back" (click)="back.emit()">← Volver al catálogo</button>
        <article class="detail">
          <div class="detail-photo">
            @if (currentImage.url) {
              <img
                [src]="currentImage.url"
                [attr.srcset]="currentImage.srcset || null"
                sizes="(max-width: 700px) 90vw, 560px"
                [alt]="detail.title"
              />
            } @else {
              <span>Sin imagen</span>
            }
          </div>
          <div class="gallery-thumbs" aria-label="Fotos de la presentación">
            @for (
              photo of detail.gallery || [];
              track photo.url;
              let i = $index
            ) {
              <button
                [attr.aria-label]="'Ver foto ' + (i + 1)"
                [attr.aria-pressed]="currentImage.url === photo.url"
                (click)="photoOverride = photo"
              >
                <img
                  [src]="photo.url"
                  [attr.srcset]="photo.srcset"
                  sizes="80px"
                  [alt]="'Foto ' + (i + 1)"
                />
              </button>
            }
          </div>
          <div class="detail-info">
            <p class="eyebrow">
              {{
                detail.brand?.name ||
                  (detail.kind === "promo" ? "Promo" : "Producto")
              }}
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
                      (click)="selected = v.id; photoOverride = null"
                    >
                      {{ v.label }}
                    </button>
                  }
                </div>
              </fieldset>
            } @else if (detail.variants.length) {
              <p class="variant">{{ detail.variants[0].label }}</p>
            }
            @if (cartActive) {
              <button
                class="cart-action add-cart"
                [disabled]="!cartSelection || cart.loading()"
                (click)="addToCart()"
              >
                Agregar al carrito
              </button>
              @if (!cartSelection) {
                <p class="cart-label">Elegí los sabores para agregar.</p>
              }
              @if (added) {
                <a class="added" href="/cart" aria-live="polite"
                  >Agregado · Ver carrito</a
                >
              }
              @if (cart.error()) {
                <p role="alert">{{ cart.error() }}</p>
              }
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
        <form
          class="search"
          (submit)="$event.preventDefault(); update({ q: search })"
        >
          <input
            aria-label="Buscar productos"
            placeholder="Buscar productos o sabores"
            [(ngModel)]="search"
            name="search"
          /><button type="submit">Buscar</button>
        </form>
        <nav class="categories" aria-label="Categorías">
          <button
            [class.selected]="!category"
            [attr.aria-pressed]="!category"
            (click)="update({ category: '' })"
          >
            Todos
          </button>
          @for (c of categories; track c.id) {
            <button
              [class.selected]="category === c.id"
              [attr.aria-pressed]="category === c.id"
              (click)="update({ category: c.id })"
            >
              {{ c.name }}
            </button>
          }
        </nav>
        <div class="filters">
          <app-select
            label="Marca"
            [options]="brandOptions"
            [ngModel]="brand"
            (ngModelChange)="update({ brand: $event })"
          /><app-select
            label="Orden"
            [options]="orderOptions"
            [ngModel]="order"
            (ngModelChange)="update({ order: $event })"
          />
        </div>
        @if (loading) {
          <p class="state" role="status">Cargando productos…</p>
        } @else if (error) {
          <div class="state" role="alert">
            <p>{{ error }}</p>
            <button (click)="retry.emit()">Volver a intentar</button>
          </div>
        } @else if (!items.length) {
          <p class="state">
            {{
              q || category || brand
                ? "No encontramos productos con estos filtros."
                : "Todavía no hay productos publicados."
            }}
          </p>
        } @else {
          <div class="grid">
            @for (item of items; track item.id) {
              <a
                class="card"
                [href]="
                  (item.kind === 'promo'
                    ? '/promos/' + $any(item.id).slice(6)
                    : '/products/' + item.id) + contextQuery
                "
                (click)="$event.preventDefault(); open.emit(item)"
                ><div class="photo">
                  @if (item.imageUrl) {
                    <img
                      [src]="item.imageUrl"
                      [attr.srcset]="item.imageSrcset || null"
                      sizes="(max-width: 700px) 45vw, 300px"
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
                    {{ item.brand?.name ? item.brand?.name + " · " : "" }}
                    @if (item.kind === "promo") {
                      Elegí los sabores por unidad
                    } @else {
                      {{ item.variants.length }}
                      {{ item.variants.length === 1 ? "opción" : "opciones" }}
                    }
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
        @if (total > pageSize) {
          <nav class="pagination" aria-label="Páginas del catálogo">
            <button
              [disabled]="page <= 1 || loading"
              (click)="update({ page: page - 1 }, false)"
            >
              Anterior</button
            ><span>Página {{ page }} de {{ pages }}</span
            ><button
              [disabled]="page >= pages || loading"
              (click)="update({ page: page + 1 }, false)"
            >
              Siguiente
            </button>
          </nav>
        }
      }
    </main>
    <footer>GEVAFIT · Córdoba capital</footer>`,
  styleUrls: ["./storefront-view.css", "./storefront-cart.css"],
})
export class StorefrontViewComponent {
  @Input() cartActive = false;
  cart = inject(StorefrontCart);
  added = false;
  get cartSelection(): CartInput | null {
    const item = this.detail;
    if (!item) return null;
    if (item.kind === "promo") {
      const selections = (item.components || []).flatMap((c) =>
        this.units(c.quantity).map((unitIndex) => ({
          componentId: c.componentId,
          unitIndex,
          variantId:
            this.promoSelected[c.componentId + ":" + unitIndex] ||
            (c.variants.length === 1 ? c.variants[0].id : 0),
        })),
      );
      return selections.length && selections.every((s) => s.variantId)
        ? {
            kind: "promo",
            promoId: Number(String(item.id).slice(6)),
            selections,
            quantity: 1,
          }
        : null;
    }
    const variantId =
      this.selected || (item.variants.length === 1 ? item.variants[0].id : 0);
    return variantId
      ? {
          kind: "product",
          presentationId: Number(item.id),
          variantId,
          quantity: 1,
        }
      : null;
  }
  async addToCart() {
    const line = this.cartSelection;
    if (line) this.added = await this.cart.add(line);
  }

  @Input() contextQuery = "";
  @Input() categories: { id: string; name: string }[] = [];
  @Input() brands: { id: string; name: string }[] = [];
  @Input() q = "";
  @Input() category = "";
  @Input() brand = "";
  @Input() order = "manual";
  @Input() page = 1;
  @Input() pageSize = 24;
  @Output() filterChange = new EventEmitter<Record<string, string | number>>();
  search = "";
  get pages() {
    return Math.ceil(this.total / this.pageSize);
  }
  get brandOptions(): SelectOption[] {
    return [
      { value: "", label: "Todas las marcas" },
      ...this.brands.map((b) => ({ value: b.id, label: b.name })),
    ];
  }
  orderOptions: SelectOption[] = [
    { value: "manual", label: "Orden de la tienda" },
    { value: "price-asc", label: "Menor precio" },
    { value: "price-desc", label: "Mayor precio" },
  ];
  update(change: Record<string, string | number>, reset = true) {
    this.filterChange.emit({ ...change, ...(reset ? { page: 1 } : {}) });
  }
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
  photoOverride: { url: string; srcset?: string } | null = null;
  ngOnChanges(changes: any) {
    this.search = this.q;
    if (changes.detail) {
      this.added = false;
      this.selected = null;
      this.promoSelected = {};
      this.photoOverride = null;
    }
  }
  get currentImage() {
    const variant = this.detail?.variants.find((v) => v.id === this.selected);
    return (
      this.photoOverride || {
        url: variant?.imageUrl || this.detail?.imageUrl,
        srcset: variant?.imageSrcset || this.detail?.imageSrcset,
      }
    );
  }
}
