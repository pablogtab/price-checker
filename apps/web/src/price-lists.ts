import { FilterSelectComponent, FilterOption } from "./filter-select";
import { PriceListOrdersComponent } from "./price-list-orders";
import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { ButtonDirective } from "./ui/button";
@Component({
  selector: "app-price-lists",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonDirective,
    PriceListOrdersComponent,
    FilterSelectComponent,
  ],
  styleUrl: "./price-lists.css",
  template: `
    <div class="lists-heading">
      <div>
        <h2>Tus listas</h2>
        <p>Elegí qué ofrecer y compartí tus precios por WhatsApp.</p>
      </div>
      <button appButton="primary" (click)="create()">+ Nueva lista</button>
    </div>
    <app-price-list-orders #orders (changed)="invalidate()" />
    @if (warningToast) {
      <div class="toast list-warning-toast" role="status">
        ⚠ {{ warningToast }}
        <button
          type="button"
          aria-label="Cerrar advertencia"
          (click)="warningToast = null; cdr.markForCheck()"
        >
          ×
        </button>
      </div>
    }
    @if (error) {
      <div role="alert" class="list-error">
        {{ error }} <button (click)="load()">Reintentar</button>
      </div>
    }
    @if (loading) {
      <p role="status">Cargando listas…</p>
    } @else {
      <div class="lists-layout">
        <aside class="lists-index">
          @for (list of lists; track list.id) {
            <button
              [class.active]="list.id === selected?.id"
              (click)="open(list)"
            >
              <strong>{{ list.title }}</strong
              ><span>{{ list.product_ids.length }} seleccionados</span>
            </button>
          } @empty {
            <p>Todavía no hay listas. Creá la primera.</p>
          }
        </aside>
        @if (selected) {
          <section class="list-editor">
            <label
              >Título del mensaje<input
                [(ngModel)]="selected.title"
                maxlength="120"
                (ngModelChange)="invalidate()"
            /></label>
            <div class="selection-heading">
              <h3>Productos</h3>
              <span>{{ selected.product_ids.length }} seleccionados</span>
            </div>
            <input
              aria-label="Buscar productos"
              placeholder="Buscar nombre, código o sabor…"
              [(ngModel)]="query"
              (ngModelChange)="cdr.markForCheck()"
            />
            <div class="list-filters">
              <app-filter-select
                label="Marca"
                placeholder="Todas las marcas"
                [options]="brandOptions"
                [(value)]="brands"
                (valueChange)="cdr.markForCheck()"
              />
              <app-filter-select
                label="Stock propio"
                placeholder="Todo el stock"
                [options]="stockOptions"
                [(value)]="stocks"
                (valueChange)="cdr.markForCheck()"
              />
              <app-filter-select
                label="Tipo"
                placeholder="Productos y promos"
                [options]="typeOptions"
                [(value)]="types"
                (valueChange)="cdr.markForCheck()"
              />
              <button appButton="ghost" (click)="clearFilters()">
                Limpiar filtros
              </button>
            </div>
            <div class="list-options">
              @for (group of presentationGroups; track group.key) {
                <section class="presentation-group">
                  @if (group.presentation) {
                    <div class="presentation-summary">
                      <label class="presentation-heading">
                        <input
                          type="checkbox"
                          [checked]="groupSelected(group)"
                          [indeterminate]="groupPartial(group)"
                          (change)="toggleGroup(group)"
                        />
                        <span
                          ><strong>{{ group.presentation }}</strong
                          ><small
                            >Seleccionar todos los sabores actuales</small
                          ></span
                        >
                      </label>
                      <button
                        type="button"
                        class="order-toggle"
                        [class.enabled]="orders.allAllowed(groupIds(group))"
                        [attr.aria-pressed]="orders.allAllowed(groupIds(group))"
                        [attr.aria-label]="'Por encargo: ' + group.presentation"
                        [disabled]="!orders.ready || orders.busy"
                        (click)="orders.toggleProducts(groupIds(group))"
                      >
                        {{
                          orders.allAllowed(groupIds(group)) ? "✓ " : "+ "
                        }}Por encargo
                      </button>
                      <button
                        class="flavor-toggle"
                        type="button"
                        [attr.aria-expanded]="expandedGroups.has(group.key)"
                        (click)="toggleExpanded(group.key)"
                      >
                        {{
                          expandedGroups.has(group.key)
                            ? "Ocultar sabores"
                            : "Ver sabores"
                        }}
                        ({{ group.visibleProducts.length }})
                      </button>
                    </div>
                  }
                  @if (!group.presentation || expandedGroups.has(group.key)) {
                    @for (p of group.visibleProducts; track p.id) {
                      <div class="list-product-row">
                        <label class="list-product"
                          ><input
                            type="checkbox"
                            [checked]="selected.product_ids.includes(p.id)"
                            (change)="toggle(p.id)"
                          /><span
                            ><strong>{{ p.name }}</strong
                            ><small
                              >{{ p.code || "Sin código" }}
                              @if (
                                group.presentation &&
                                !selected.product_ids.includes(p.id)
                              ) {
                                · No seleccionado
                              }
                            </small></span
                          ></label
                        ><button
                          type="button"
                          class="order-toggle"
                          [class.enabled]="orders.allowed(p.id)"
                          [attr.aria-pressed]="orders.allowed(p.id)"
                          [attr.aria-label]="'Por encargo: ' + p.name"
                          [disabled]="!orders.ready || orders.busy"
                          (click)="orders.toggleProducts([p.id])"
                        >
                          {{ orders.allowed(p.id) ? "✓ " : "+ " }}Por encargo
                        </button>
                      </div>
                    }
                  }
                </section>
              } @empty {
                <p>No se encontraron productos individuales.</p>
              }
            </div>
            <div class="list-actions">
              <button
                appButton="primary"
                [disabled]="busy || !selected.title.trim()"
                (click)="save()"
              >
                Guardar lista</button
              ><button
                appButton="secondary"
                [disabled]="busy || !selected.title.trim()"
                (click)="generate()"
              >
                Vista previa
              </button>
            </div>
            @if (message) {
              <p role="status">{{ message }}</p>
            }
          </section>
        }
      </div>
      @if (preview) {
        <section class="list-preview">
          <div class="preview-heading">
            <div>
              <h3>Mensaje para WhatsApp</h3>
              <p>Solo precios de venta y disponibilidad.</p>
            </div>
            <button
              appButton="primary"
              [disabled]="busy || !preview.items.length"
              (click)="copy()"
            >
              Copiar texto
            </button>
          </div>
          @for (provider of preview.providers; track provider.id) {
            <p>
              {{ provider.name }} · Última actualización:
              {{ supplierDate(provider.last_success_at) }}
            </p>
          }
          <textarea
            aria-label="Texto para WhatsApp"
            readonly
            [value]="preview.text"
            rows="12"
          ></textarea>
          @if (copyStatus) {
            <p role="status">{{ copyStatus }}</p>
          }
          @if (!preview.items.length) {
            <p>No hay productos disponibles para publicar.</p>
          }
          @if (preview.omissions.length) {
            <h4>No incluidos</h4>
            <ul>
              @for (o of preview.omissions; track o.product_id) {
                <li>{{ o.name || "Producto" }}: {{ o.reason }}</li>
              }
            </ul>
          }
        </section>
      }
    }
  `,
})
export class PriceListsComponent implements OnInit, OnDestroy {
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  lists: any[] = [];
  products: any[] = [];
  selected: any = null;
  query = "";
  preview: any = null;
  warningToast: string | null = null;
  private warningTimer: ReturnType<typeof setTimeout> | undefined;
  ngOnDestroy() {
    clearTimeout(this.warningTimer);
  }
  private warnStale() {
    clearTimeout(this.warningTimer);
    this.warningToast =
      "Los datos del proveedor están desactualizados. Revisá disponibilidad y precios.";
    this.warningTimer = setTimeout(() => {
      this.warningToast = null;
      this.cdr.markForCheck();
    }, 6000);
    this.cdr.markForCheck();
  }
  groupIds(group: any): number[] {
    return group.products.map((p: any) => p.id);
  }

  error = "";
  message = "";
  copyStatus = "";
  loading = true;
  busy = false;
  expandedGroups = new Set<string>();
  brands: string[] = [];
  stocks: string[] = [];
  types: string[] = [];
  stockOptions: FilterOption[] = [
    { value: "positive", label: "Con stock propio" },
    { value: "empty", label: "Sin stock propio" },
  ];
  typeOptions: FilterOption[] = [
    { value: "product", label: "Productos" },
    { value: "kit", label: "Promos" },
  ];
  productBrand(p: any): string {
    return p.selected?.individual?.brand || p.selected?.kit?.brand || "";
  }
  get brandOptions(): FilterOption[] {
    return [...new Set<string>(this.products.map((p) => this.productBrand(p)))]
      .sort((a, b) => a.localeCompare(b, "es"))
      .map((b) => ({ value: b || "__unbranded", label: b || "Sin marca" }));
  }
  toggleExpanded(key: string) {
    if (this.expandedGroups.has(key)) this.expandedGroups.delete(key);
    else this.expandedGroups.add(key);
    this.cdr.markForCheck();
  }
  clearFilters() {
    this.query = "";
    this.brands = [];
    this.stocks = [];
    this.types = [];
    this.cdr.markForCheck();
  }

  ngOnInit() {
    void this.load();
  }
  async request(method: string, path: string, body?: any) {
    return firstValueFrom(
      this.http.request<any>(method, "/api/" + path, { body }),
    );
  }
  async load() {
    this.loading = true;
    this.error = "";
    try {
      [this.lists, this.products] = await Promise.all([
        this.request("GET", "price-lists"),
        this.request("GET", "products"),
      ]);
    } catch {
      this.error = "No pudimos cargar las listas.";
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
  create() {
    this.expandedGroups.clear();
    this.selected = { title: "Nueva lista", product_ids: [] };
    this.invalidate();
  }
  open(list: any) {
    this.expandedGroups.clear();
    this.selected = { ...list, product_ids: [...list.product_ids] };
    this.invalidate();
  }
  invalidate() {
    this.preview = null;

    this.message = "";
    this.copyStatus = "";
    this.cdr.markForCheck();
  }
  get filtered() {
    const q = this.query.toLocaleLowerCase();
    return this.products.filter(
      (p) =>
        [p.name, p.code, p.barcode, p.variant_group]
          .join(" ")
          .toLocaleLowerCase()
          .includes(q) &&
        (!this.brands.length ||
          this.brands.includes(this.productBrand(p) || "__unbranded")) &&
        (!this.stocks.length ||
          this.stocks.includes(p.own_stock > 0 ? "positive" : "empty")) &&
        (!this.types.length || this.types.includes(p.kind)),
    );
  }
  get presentationGroups(): any[] {
    const groups = new Map<string, any>();
    // Build complete presentations first: a search never changes what selecting
    // a presentation means or silently limits the selected flavor set.
    for (const p of this.products) {
      const key = p.variant_group
        ? "group:" + p.variant_group
        : "product:" + p.id;
      if (!groups.has(key))
        groups.set(key, { key, presentation: p.variant_group, products: [] });
      groups.get(key).products.push(p);
    }
    const visible = new Set(this.filtered.map((p) => p.id));
    return [...groups.values()]
      .map((g) => ({
        ...g,
        visibleProducts: g.products.filter((p: any) => visible.has(p.id)),
      }))
      .filter((g) => g.products.some((p: any) => visible.has(p.id)))
      .sort((a, b) =>
        (a.presentation || a.products[0].name).localeCompare(
          b.presentation || b.products[0].name,
          "es",
        ),
      );
  }
  groupSelected(group: any) {
    return group.products.every((p: any) =>
      this.selected.product_ids.includes(p.id),
    );
  }
  groupPartial(group: any) {
    return (
      !this.groupSelected(group) &&
      group.products.some((p: any) => this.selected.product_ids.includes(p.id))
    );
  }
  toggleGroup(group: any) {
    const ids = new Set<number>(this.selected.product_ids);
    const remove = this.groupSelected(group);
    for (const p of group.products) {
      if (remove) ids.delete(p.id);
      else ids.add(p.id);
    }
    this.selected.product_ids = [...ids];
    this.invalidate();
  }
  toggle(id: number) {
    this.selected.product_ids = this.selected.product_ids.includes(id)
      ? this.selected.product_ids.filter((x: number) => x !== id)
      : [...this.selected.product_ids, id];
    this.invalidate();
  }
  async save() {
    this.invalidate();
    this.busy = true;
    this.error = "";
    try {
      const saved = await this.request(
        this.selected.id ? "PUT" : "POST",
        "price-lists" + (this.selected.id ? "/" + this.selected.id : ""),
        this.selected,
      );
      this.selected = saved;
      this.lists = await this.request("GET", "price-lists");
      this.message = "Lista guardada";
      return true;
    } catch (e: any) {
      this.error = e.error?.message || "No pudimos guardar la lista.";
      return false;
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }
  async generate() {
    this.invalidate();
    if (!(await this.save())) return;
    this.busy = true;
    try {
      this.preview = await this.request(
        "POST",
        `price-lists/${this.selected.id}/preview`,
        {},
      );
      this.copyStatus = "";
      if (this.preview.has_warnings) this.warnStale();
    } catch {
      this.error = "No pudimos generar la vista previa. Intentá nuevamente.";
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }
  supplierDate(value: string) {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }
  async copy() {
    if (this.busy || !this.preview) return;
    const preview = this.preview;
    this.busy = true;
    try {
      const accepted = await this.request(
        "POST",
        `price-lists/${this.selected.id}/confirm`,
        { preview_id: preview.preview_id },
      );
      if (this.preview !== preview) return;
      try {
        await navigator.clipboard.writeText(accepted.text);
        this.copyStatus = "Texto copiado";
      } catch {
        this.copyStatus =
          "No se pudo copiar. Seleccioná el texto y copialo manualmente.";
      }
    } catch (e: any) {
      this.invalidate();
      this.error =
        e.error?.message ||
        "No pudimos confirmar la vista previa. Generala nuevamente.";
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }
}
