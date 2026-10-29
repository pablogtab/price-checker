import { Component, OnInit, inject, ChangeDetectorRef } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { registerLocaleData } from "@angular/common";
import esAR from "@angular/common/locales/es-AR";
import { SelectComponent, SelectOption } from "./select";
import { StorefrontViewComponent, StorefrontProduct } from "./storefront-view";
registerLocaleData(esAR);
interface Entry {
  kind?: "promo";
  promoId?: number;
  promoComponents?: { componentId: number; variantIds: number[] }[];
  presentationId?: number;
  title: string;
  description: string;
  imageKey: string | null;
  variantIds: number[];
}
@Component({
  selector: "app-storefront-editor",
  standalone: true,
  imports: [FormsModule, SelectComponent, StorefrontViewComponent],
  template: ` <section class="store-editor">
    <div class="intro">
      <p>Editá el contenido y publicá los cambios.</p>
      <span
        >Revisión {{ revision }} ·
        {{ publishedRevision === revision ? "Publicada" : "Borrador" }}</span
      >
    </div>
    @if (error) {
      <p role="alert" class="error">{{ error }}</p>
    }
    @if (message) {
      <p role="status" class="success">{{ message }}</p>
    }
    @if (loading) {
      <p role="status">Cargando tienda…</p>
    } @else {
      <div class="toolbar">
        <button (click)="save()" [disabled]="busy">Guardar borrador</button
        ><button (click)="preview()" [disabled]="busy || dirty">
          Vista previa</button
        ><button class="publish" (click)="publish()" [disabled]="busy || dirty">
          Publicar cambios
        </button>
      </div>
      @if (dirty) {
        <p class="hint">Guardá el borrador para previsualizar o publicar.</p>
      }
      <div class="editor-layout">
        <aside>
          <h2>Selección web</h2>
          <p class="hint">
            Esta selección es independiente de las listas de precios.
          </p>
          <app-select
            label="Seleccionar presentación"
            placeholder="Seleccionar presentación"
            [options]="options"
            [(ngModel)]="selectedId"
            (ngModelChange)="choose($event)"
          />
          <div class="entries">
            @for (entry of entries; track entryId(entry)) {
              <button
                [class.active]="editing && entryId(editing) === entryId(entry)"
                (click)="choose(entryId(entry))"
              >
                {{ entry.title }}
              </button>
            }
          </div>
        </aside>
        <div class="fields">
          @if (editing) {
            <label
              >Título comercial<input
                aria-label="Título comercial"
                [(ngModel)]="editing.title"
                (ngModelChange)="changed()"
                maxlength="180"
            /></label>
            <label
              >Descripción comercial<textarea
                aria-label="Descripción comercial"
                [(ngModel)]="editing.description"
                (ngModelChange)="changed()"
                rows="4"
                maxlength="10000"
              ></textarea>
            </label>
            @if (editing.kind === "promo") {
              <label class="flavor"
                ><input
                  type="checkbox"
                  aria-label="Permitir ofrecer la promo sin stock propio"
                  [checked]="editingPromo?.price_list_order_allowed"
                  (change)="
                    permission(editingPromo, $any($event.target).checked)
                  "
                />Permitir ofrecer la promo sin stock propio</label
              >
              <p class="hint">
                Permiso compartido con las listas. Los componentes sin stock
                también necesitan permiso y una oferta vigente con stock
                positivo conocido.
              </p>
              @for (
                component of editingPromo?.components || [];
                track component.product_id
              ) {
                <fieldset>
                  <legend>
                    {{ component.name }} · {{ component.quantity }} unidades
                  </legend>
                  @for (
                    product of componentVariants(component);
                    track product.id
                  ) {
                    <label class="flavor"
                      ><input
                        type="checkbox"
                        [attr.aria-label]="product.name"
                        [checked]="
                          selectedComponent(component.product_id, product.id)
                        "
                        (change)="
                          toggleComponent(component.product_id, product.id)
                        "
                      />{{ product.name }}</label
                    >
                    <label class="flavor"
                      ><input
                        type="checkbox"
                        [attr.aria-label]="
                          'Permitir ofrecer sin stock propio: ' + product.name
                        "
                        [checked]="product.price_list_order_allowed"
                        (change)="
                          permission(product, $any($event.target).checked)
                        "
                      />Permitir ofrecer sin stock propio</label
                    >
                  }
                </fieldset>
              }
            } @else {
              <fieldset>
                <legend>Sabores publicados</legend>
                <p class="hint">
                  Elegí expresamente los sabores. Las nuevas variantes no se
                  agregan solas.
                </p>
                @for (product of variants; track product.id) {
                  <label class="flavor"
                    ><input
                      type="checkbox"
                      [attr.aria-label]="product.name"
                      [checked]="editing.variantIds.includes(product.id)"
                      (change)="toggle(product.id)"
                      [disabled]="product.archived"
                    /><span>{{ product.name }}</span
                    ><small>{{
                      product.archived
                        ? "Archivado"
                        : product.own_stock > 0
                          ? "Con stock propio"
                          : "Sin stock propio"
                    }}</small></label
                  >
                  <label class="flavor"
                    ><input
                      type="checkbox"
                      [attr.aria-label]="
                        'Permitir ofrecer sin stock propio: ' + product.name
                      "
                      [checked]="product.price_list_order_allowed"
                      (change)="
                        permission(product, $any($event.target).checked)
                      "
                    />Permitir ofrecer sin stock propio</label
                  >
                }
              </fieldset>
            }
            <fieldset>
              <legend>Imagen existente</legend>
              <div class="images">
                @for (product of images; track product.id) {
                  <button
                    class="image-choice"
                    [class.active]="editing.imageKey === product.image_path"
                    [attr.aria-label]="'Usar imagen de ' + product.name"
                    [attr.aria-pressed]="
                      editing.imageKey === product.image_path
                    "
                    (click)="editing.imageKey = product.image_path; changed()"
                  >
                    <img
                      [src]="'/api/images/' + product.image_path"
                      [alt]="product.name"
                    />
                  </button>
                } @empty {
                  <p class="hint">
                    Esta presentación todavía no tiene imágenes.
                  </p>
                }
              </div>
              @if (editing.imageKey) {
                <button (click)="editing.imageKey = null; changed()">
                  Quitar imagen
                </button>
              }
            </fieldset>
            <button class="remove" (click)="remove()">
              Quitar de la tienda
            </button>
          } @else {
            <p class="hint">
              Seleccioná una presentación para preparar su contenido.
            </p>
          }
        </div>
      </div>
      @if (previewItems !== null) {
        <section aria-label="Vista previa del borrador" class="preview">
          <div class="preview-label">
            <h2>Vista previa del borrador</h2>
            <button (click)="previewItems = null">Cerrar vista previa</button>
          </div>
          @for (issue of previewIssues; track $index) {
            <p class="error" role="alert">{{ issue.message }}</p>
          }
          @for (warning of previewWarnings; track $index) {
            <p role="status" class="hint">{{ warning.message }}</p>
          }
          <geva-storefront-view
            [items]="previewItems"
            [total]="previewItems.length"
            [detail]="previewDetail"
            (open)="previewDetail = $event"
            (back)="previewDetail = null"
          />
        </section>
      }
    }
  </section>`,
  styles: [
    `
      :host {
        display: block;
      }
      .store-editor {
        max-width: 1250px;
      }
      .intro {
        display: flex;
        gap: 16px;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }
      .intro p {
        margin: 0;
        color: var(--muted, #657064);
      }
      .intro span {
        font-size: 12px;
      }
      .toolbar {
        display: flex;
        gap: 10px;
        margin: 20px 0 12px;
      }
      .toolbar button,
      .entries button,
      .fields button,
      .preview-label button {
        padding: 10px 15px;
        border: 1px solid #ccd5ca;
        border-radius: 8px;
        background: white;
        color: #263d2a;
        cursor: pointer;
        font: inherit;
      }
      .toolbar button.publish {
        background: #163d2a;
        color: #fff;
        border-color: #163d2a;
      }
      button:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .editor-layout {
        display: grid;
        grid-template-columns: 300px minmax(0, 1fr);
        gap: 24px;
        margin-top: 24px;
      }
      .editor-layout > aside,
      .fields {
        padding: 24px;
        border: 1px solid #dce2d7;
        border-radius: 12px;
        background: #fff;
      }
      .editor-layout h2 {
        font-size: 17px;
        margin: 0 0 10px;
      }
      .hint {
        font-size: 12px;
        color: #6a7566;
        line-height: 1.6;
        margin: 6px 0 16px;
      }
      .entries {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 18px;
      }
      .entries button {
        text-align: left;
        font-size: 13px;
      }
      .entries button.active {
        border-color: #658d46;
        background: #f1f9e8;
      }
      .fields > label:not(.flavor) {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 20px;
      }
      .fields input:not([type="checkbox"]),
      .fields textarea {
        font: inherit;
        padding: 10px 12px;
        border: 1px solid #cbd5c5;
        border-radius: 7px;
        width: 100%;
        resize: vertical;
        min-width: 0;
      }
      .fields fieldset {
        border: 0;
        padding: 0;
        margin: 22px 0;
      }
      .fields legend {
        font-size: 14px;
        font-weight: 650;
        padding: 0;
        margin-bottom: 8px;
      }
      .flavor {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 0;
        border-bottom: 1px solid #eef1eb;
        font-size: 13px;
      }
      .flavor input {
        width: 17px;
        height: 17px;
        accent-color: #436e2c;
      }
      .flavor small {
        margin-left: auto;
        color: #7c8678;
        font-weight: 400;
      }
      .images {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 12px 0;
      }
      .fields .image-choice {
        width: 100px;
        height: 115px;
        padding: 8px;
      }
      .image-choice img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .fields .image-choice.active {
        border: 2px solid #729a4f;
        background: #f4faee;
      }
      .fields .remove {
        color: #a34237;
        font-size: 12px;
        margin-top: 16px;
      }
      .preview {
        margin-top: 32px;
        border: 1px solid #dce2d7;
        border-radius: 10px;
        overflow: hidden;
      }
      .preview-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
        background: white;
      }
      .preview-label h2 {
        font-size: 15px;
        margin: 0;
      }
      .error,
      .success {
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px;
      }
      .error {
        background: #fff0ee;
        color: #903d34;
      }
      .success {
        background: #eff8e5;
        color: #45652c;
      }
      @media (max-width: 700px) {
        .intro {
          display: block;
        }
        .intro span {
          display: block;
          margin-top: 10px;
        }
        .toolbar {
          flex-wrap: wrap;
        }
        .toolbar button {
          flex: 1;
          min-width: 125px;
          font-size: 12px;
        }
        .editor-layout {
          grid-template-columns: 1fr;
          gap: 16px;
        }
        .editor-layout > aside,
        .fields {
          padding: 18px;
        }
        .flavor {
          flex-wrap: wrap;
        }
        .flavor small {
          width: 100%;
          margin-left: 27px;
        }
        .preview-label {
          gap: 12px;
        }
        .preview-label button {
          font-size: 12px;
        }
      }
    `,
  ],
})
export class StorefrontEditorComponent implements OnInit {
  products: any[] = [];
  options: SelectOption[] = [];
  entries: Entry[] = [];
  revision = 0;
  publishedRevision: number | null = null;
  selectedId: number | string | null = null;
  editing: Entry | null = null;
  loading = true;
  busy = false;
  dirty = false;
  error = "";
  message = "";
  previewItems: StorefrontProduct[] | null = null;
  previewDetail: StorefrontProduct | null = null;
  previewWarnings: { message: string }[] = [];
  previewIssues: { presentationId: number | string; message: string }[] = [];
  private cdr = inject(ChangeDetectorRef);
  ngOnInit() {
    void this.load();
  }
  async api(path: string, body?: unknown, method = "POST") {
    const r = await fetch(
      "/api/" + path,
      body === undefined
        ? {}
        : {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    const v = await r.json();
    if (!r.ok)
      throw Error(
        Array.isArray(v.message)
          ? v.message.join(", ")
          : v.message || "No se pudo completar la acción",
      );
    return v;
  }
  async load() {
    try {
      const [draft, products] = await Promise.all([
        this.api("storefront/draft"),
        this.api("products"),
      ]);
      this.entries = draft.entries;
      this.revision = draft.revision;
      this.publishedRevision = draft.publishedRevision;
      this.products = products;
      const seen = new Set();
      this.options = this.products
        .filter((p: any) => {
          const id = p.kind === "kit" ? `promo-${p.id}` : p.presentation_id;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .map((p: any) => ({
          value: p.kind === "kit" ? `promo-${p.id}` : p.presentation_id,
          label: p.variant_group || p.name,
        }));
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }
  get variants() {
    return this.editing?.kind === "promo"
      ? this.products.filter((p) => p.id === this.editing?.promoId)
      : this.products.filter(
          (p) => p.kind === "product" && p.presentation_id === this.selectedId,
        );
  }
  get images() {
    const seen = new Set();
    return this.variants.filter((p) => {
      if (!p.image_path || seen.has(p.image_path)) return false;
      seen.add(p.image_path);
      return true;
    });
  }
  choose(id: number | string) {
    this.selectedId = id;
    let entry = this.entries.find((e) => this.entryId(e) === id);
    if (!entry) {
      entry = {
        ...(typeof id === "string"
          ? {
              kind: "promo" as const,
              promoId: Number(id.slice(6)),
              promoComponents: [],
            }
          : { presentationId: id }),
        title: this.options.find((o) => o.value === id)?.label || "",
        description: "",
        imageKey: null,
        variantIds: [],
      };
      this.entries.push(entry);
      this.changed();
    }
    this.editing = entry;
  }
  entryId(entry: Entry): number | string {
    return entry.kind === "promo"
      ? `promo-${entry.promoId}`
      : entry.presentationId!;
  }
  get editingPromo() {
    return this.products.find(
      (p) => p.kind === "kit" && p.id === this.editing?.promoId,
    );
  }
  componentVariants(component: any) {
    return this.products.filter(
      (p) =>
        p.kind === "product" &&
        (component.variant_group
          ? p.variant_group === component.variant_group
          : p.id === component.product_id),
    );
  }
  selectedComponent(componentId: number, id: number) {
    return !!this.editing?.promoComponents
      ?.find((c) => c.componentId === componentId)
      ?.variantIds.includes(id);
  }
  toggleComponent(componentId: number, id: number) {
    if (!this.editing) return;
    const all = (this.editing.promoComponents ||= []);
    let row = all.find((c) => c.componentId === componentId);
    if (!row) {
      row = { componentId, variantIds: [] };
      all.push(row);
    }
    row.variantIds = row.variantIds.includes(id)
      ? row.variantIds.filter((v) => v !== id)
      : [...row.variantIds, id];
    this.changed();
  }
  async permission(product: any, allowed: boolean) {
    if (!product) return;
    await this.action(async () => {
      await this.api(
        `storefront/order-permission/${product.id}`,
        { allowed },
        "PUT",
      );
      product.price_list_order_allowed = allowed;
      this.message = "Permiso compartido actualizado.";
    });
  }
  changed() {
    this.dirty = true;
    this.message = "";
    this.previewItems = null;
  }
  toggle(id: number) {
    if (!this.editing) return;
    this.editing.variantIds = this.editing.variantIds.includes(id)
      ? this.editing.variantIds.filter((x) => x !== id)
      : [...this.editing.variantIds, id];
    this.changed();
  }
  remove() {
    this.entries = this.entries.filter((e) => e !== this.editing);
    this.editing = null;
    this.selectedId = null;
    this.changed();
  }
  async action(fn: () => Promise<void>) {
    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      await fn();
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async save() {
    await this.action(async () => {
      const draft = await this.api(
        "storefront/draft",
        { revision: this.revision, entries: this.entries },
        "PUT",
      );
      this.revision = draft.revision;
      this.dirty = false;
      this.message = "Borrador guardado.";
    });
  }
  async preview() {
    await this.action(async () => {
      const result = await this.api("storefront/preview");
      this.previewItems = result.items;
      this.previewIssues = result.issues || [];
      this.previewWarnings = result.warnings || [];
      this.previewDetail = null;
    });
  }
  async publish() {
    await this.action(async () => {
      const result = await this.api("storefront/publish", {
        revision: this.revision,
      });
      this.publishedRevision = result.publishedRevision;
      this.message = "Cambios publicados.";
    });
  }
}
