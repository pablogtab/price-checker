import { Component, Input, Output, EventEmitter } from "@angular/core";
import { MediaLibraryComponent } from "./media-library";
export interface GalleryEntry {
  gallery?: number[];
  coverMediaId?: number | null;
  variantImages?: { variantId: number; mediaId: number }[];
  variantIds?: number[];
}
@Component({
  selector: "app-storefront-gallery-editor",
  standalone: true,
  imports: [MediaLibraryComponent],
  template: ` <section aria-label="Galería de la presentación">
    <h3>Galería de la presentación</h3>
    <p>
      Arrastrá las fotos o usá los botones para ordenarlas. La portada se elige
      por separado.
    </p>
    <div class="gallery-list">
      @for (id of entry.gallery || []; track id; let i = $index) {
        <div
          class="gallery-item"
          draggable="true"
          (dragstart)="dragged = i"
          (dragover)="$event.preventDefault()"
          (drop)="drop($event, i)"
        >
          <img
            [src]="'/api/media/' + id + '/file/mobile'"
            [alt]="'Foto ' + (i + 1)"
          /><strong
            >Foto {{ i + 1 }}
            {{ entry.coverMediaId === id ? "· Portada" : "" }}</strong
          >
          <div class="actions">
            <button
              [attr.aria-label]="'Elegir foto ' + (i + 1) + ' como portada'"
              [attr.aria-pressed]="entry.coverMediaId === id"
              (click)="entry.coverMediaId = id; changed.emit()"
            >
              Portada</button
            ><button
              [disabled]="i === 0"
              [attr.aria-label]="'Mover foto ' + (i + 1) + ' arriba'"
              (click)="move(i, i - 1)"
            >
              ↑</button
            ><button
              [disabled]="i === (entry.gallery?.length || 0) - 1"
              [attr.aria-label]="'Mover foto ' + (i + 1) + ' abajo'"
              (click)="move(i, i + 1)"
            >
              ↓</button
            ><button
              [attr.aria-label]="'Quitar foto ' + (i + 1)"
              (click)="remove(id)"
            >
              Quitar
            </button>
          </div>
        </div>
      } @empty {
        <p>Sin fotos en la galería.</p>
      }
    </div>
    <button (click)="target = null; library = true">
      Agregar desde biblioteca
    </button>
    @if (entry.variantIds?.length) {
      <h4>Imagen por sabor</h4>
      <p>Sin imagen específica, se muestra la portada común.</p>
      @for (v of variants; track v.id) {
        @if (entry.variantIds?.includes(v.id)) {
          <div class="variant-image">
            <span>{{ v.name }}</span>
            @if (variantImage(v.id); as id) {
              <img
                [src]="'/api/media/' + id + '/file/mobile'"
                [alt]="v.name"
              /><button
                [attr.aria-label]="'Quitar imagen de ' + v.name"
                (click)="clearVariant(v.id)"
              >
                Usar portada
              </button>
            }
            <button
              [attr.aria-label]="'Imagen para ' + v.name"
              (click)="target = v.id; library = true"
            >
              Elegir imagen
            </button>
          </div>
        }
      }
    }
    @if (library) {
      <div class="picker">
        <button (click)="library = false">Cerrar biblioteca</button
        ><app-media-library
          [selectionMode]="true"
          (assetSelected)="select($event)"
        />
      </div>
    }
  </section>`,
  styles: [
    `
      :host {
        display: block;
        margin: 24px 0;
      }
      h3 {
        font-size: 15px;
      }
      p {
        font-size: 12px;
        color: #637160;
        line-height: 1.6;
      }
      .gallery-list {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 16px 0;
      }
      .gallery-item {
        border: 1px solid #d6dfcf;
        border-radius: 10px;
        padding: 10px;
        width: 180px;
        background: #fff;
        cursor: grab;
      }
      .gallery-item > img {
        width: 100%;
        height: 145px;
        object-fit: contain;
      }
      .gallery-item strong {
        display: block;
        font-size: 12px;
        margin: 8px 0;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      button {
        padding: 8px;
        border: 1px solid #cbd6c5;
        border-radius: 6px;
        background: white;
        color: #25422b;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
      }
      button:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .variant-image {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        padding: 10px 0;
        border-bottom: 1px solid #e5ebdf;
      }
      .variant-image span {
        flex: 1;
        font-size: 13px;
      }
      .variant-image img {
        width: 45px;
        height: 60px;
        object-fit: contain;
      }
      .picker {
        margin-top: 20px;
        border: 1px solid #cdd8c6;
        border-radius: 10px;
        padding: 14px;
        min-width: 0;
      }
      button[aria-pressed="true"] {
        background: #e8f8db;
        border-color: #719950;
      }
      @media (max-width: 600px) {
        .gallery-item {
          width: 100%;
        }
        .gallery-item > img {
          height: 180px;
        }
        .picker {
          padding: 8px;
        }
      }
    `,
  ],
})
export class StorefrontGalleryEditorComponent {
  @Input({ required: true }) entry!: GalleryEntry;
  @Input() variants: any[] = [];
  @Output() changed = new EventEmitter<void>();
  library = false;
  target: number | null = null;
  dragged: number | null = null;
  variantImage(id: number) {
    return this.entry.variantImages?.find((v) => v.variantId === id)?.mediaId;
  }
  select(asset: any) {
    if (this.target === null) {
      this.entry.gallery = [
        ...new Set([...(this.entry.gallery || []), asset.id]),
      ];
      this.entry.coverMediaId ??= asset.id;
    } else {
      this.entry.variantImages = [
        ...(this.entry.variantImages || []).filter(
          (v) => v.variantId !== this.target,
        ),
        { variantId: this.target, mediaId: asset.id },
      ];
    }
    this.library = false;
    this.changed.emit();
  }
  clearVariant(id: number) {
    this.entry.variantImages = (this.entry.variantImages || []).filter(
      (v) => v.variantId !== id,
    );
    this.changed.emit();
  }
  remove(id: number) {
    this.entry.gallery = (this.entry.gallery || []).filter((x) => x !== id);
    if (this.entry.coverMediaId === id)
      this.entry.coverMediaId = this.entry.gallery[0] ?? null;
    this.changed.emit();
  }
  move(from: number, to: number) {
    const values = [...(this.entry.gallery || [])];
    if (from < 0 || to < 0 || from >= values.length || to >= values.length)
      return;
    values.splice(to, 0, ...values.splice(from, 1));
    this.entry.gallery = values;
    this.changed.emit();
  }
  drop(event: DragEvent, to: number) {
    event.preventDefault();
    if (this.dragged !== null) this.move(this.dragged, to);
    this.dragged = null;
  }
}
