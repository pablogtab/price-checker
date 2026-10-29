import { Component, Input, Output, EventEmitter } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { SelectComponent, SelectOption } from "./select";
import { CurrencyPipe } from "@angular/common";
export interface StorefrontProduct {
  brand?: { id: string; name: string } | null;
  categoryIds?: string[];
  id: number;
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
  imports: [CurrencyPipe, FormsModule, SelectComponent],
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
            <p class="eyebrow">{{ detail.brand?.name || "Producto" }}</p>
            <h1>{{ detail.title }}</h1>
            <p class="price">
              {{
                detail.price
                  | currency: "ARS" : "symbol-narrow" : "1.0-2" : "es-AR"
              }}
            </p>
            <p class="description">{{ detail.description }}</p>
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
        @if(showHome && home?.banners?.length && !loading && !error){
          <section class="home-banners" aria-label="Selecciones de la tienda">
          @for(b of home.banners;track b.id){<a class="home-banner" [href]="b.href" (click)="$event.preventDefault();destination.emit(b.destination)"><div><p class="eyebrow">{{b.destination.type==='category'?'Categoría':'Producto'}}</p><h2>{{b.title}}</h2><span>Ver selección →</span></div><img [src]="b.imageUrl" [srcset]="b.imageSrcset" sizes="(max-width:700px) 130px, 260px" [alt]="b.title"/></a>}
          </section>
        }
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
        @if(showHome && home?.featured?.length && !loading && !error){<section class="featured" aria-label="Productos destacados"><div class="featured-heading"><h2>Destacados</h2><a href="#catalogo">Ver catálogo ↓</a></div><div class="featured-grid">@for(item of home.featured;track item.id){<a class="featured-card" [href]="'/products/'+item.id+contextQuery" (click)="$event.preventDefault();open.emit(item)">@if(item.imageUrl){<img [src]="item.imageUrl" [alt]="item.title"/>}<div><h3>{{item.title}}</h3><strong>{{item.price|currency:'ARS':'symbol-narrow':'1.0-2':'es-AR'}}</strong></div></a>}</div></section>}
        <div class="filters" id="catalogo">
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
                [href]="'/products/' + item.id + contextQuery"
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
                    {{ item.brand?.name ? item.brand?.name + " · " : ""
                    }}{{ item.variants.length }}
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
  styleUrl: "./storefront-view.css",
})
export class StorefrontViewComponent {
  @Input() home:any={featured:[],banners:[]};
  @Output() destination=new EventEmitter<any>();
  get showHome(){return !this.q&&!this.category&&!this.brand&&this.page===1;}
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
  ngOnChanges() {
    this.search = this.q;
  }
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
}
