import { PriceListOrdersComponent } from "./price-list-orders";
import { Component, inject, OnInit, ChangeDetectorRef } from "@angular/core";
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
    <app-price-list-orders (changed)="invalidate()" />
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
            />
            <div class="list-options">
              @for (p of filtered; track p.id) {
                <label class="list-product"
                  ><input
                    type="checkbox"
                    [checked]="selected.product_ids.includes(p.id)"
                    (change)="toggle(p.id)"
                  /><span
                    ><strong>{{ p.name }}</strong
                    ><small>{{ p.code || "Sin código" }}</small></span
                  ></label
                >
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
              [disabled]="
                !preview.items.length ||
                (preview.requires_confirmation && !confirmed)
              "
              (click)="copy()"
            >
              Copiar texto
            </button>
          </div>
          @for (provider of preview.providers; track provider.id) {
            <p>
              {{ provider.name }} · Última actualización:
              {{ provider.last_success_at | date: "short" }}
              @if (provider.warning) {
                <strong
                  >Datos desactualizados o última actualización fallida</strong
                >
              }
            </p>
          }
          @if (preview.requires_confirmation) {
            <label
              ><input type="checkbox" [(ngModel)]="confirmed" />Confirmo incluir
              encargos con datos desactualizados en esta vista previa</label
            >
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
export class PriceListsComponent implements OnInit {
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  lists: any[] = [];
  products: any[] = [];
  selected: any = null;
  query = "";
  preview: any = null;
  confirmed = false;
  error = "";
  message = "";
  copyStatus = "";
  loading = true;
  busy = false;
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
    this.selected = { title: "Nueva lista", product_ids: [] };
    this.invalidate();
  }
  open(list: any) {
    this.selected = { ...list, product_ids: [...list.product_ids] };
    this.invalidate();
  }
  invalidate() {
    this.preview = null;
    this.confirmed = false;
    this.message = "";
    this.copyStatus = "";
  }
  get filtered() {
    const q = this.query.toLocaleLowerCase();
    return this.products.filter(
      (p) =>
        p.kind !== "kit" &&
        [p.name, p.code, p.barcode].join(" ").toLocaleLowerCase().includes(q),
    );
  }
  toggle(id: number) {
    this.selected.product_ids = this.selected.product_ids.includes(id)
      ? this.selected.product_ids.filter((x: number) => x !== id)
      : [...this.selected.product_ids, id];
    this.invalidate();
  }
  async save() {
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
    if (!(await this.save())) return;
    this.busy = true;
    try {
      this.preview = await this.request(
        "POST",
        `price-lists/${this.selected.id}/preview`,
        {},
      );
      this.copyStatus = "";
      this.confirmed = false;
    } catch {
      this.error = "No pudimos generar la vista previa. Intentá nuevamente.";
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }
  async copy() {
    if (this.preview.requires_confirmation && !this.confirmed) return;
    try {
      await navigator.clipboard.writeText(this.preview.text);
      this.copyStatus = "Texto copiado";
    } catch {
      this.copyStatus =
        "No se pudo copiar. Seleccioná el texto y copialo manualmente.";
    }
    this.cdr.detectChanges();
  }
}
