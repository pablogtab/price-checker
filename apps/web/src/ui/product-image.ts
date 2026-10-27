import {
  Component,
  Input,
  OnChanges,
  ViewChild,
  ElementRef,
} from "@angular/core";
import { IconComponent } from "./icon";
@Component({
  selector: "pc-product-image",
  standalone: true,
  imports: [IconComponent],
  template: `@if (image && !failed) {
      <button
        class="image-open"
        type="button"
        [attr.aria-label]="'Ampliar imagen de ' + alt"
        aria-haspopup="dialog"
        (click)="$event.stopPropagation(); viewer.showModal()"
      >
        <img
          [src]="'/api/images/' + image"
          [alt]="alt"
          loading="lazy"
          (error)="failed = true"
        />
      </button>
    } @else {
      <span
        class="image-placeholder"
        role="img"
        [attr.aria-label]="'Sin imagen de ' + alt"
        ><pc-icon name="products"
      /></span>
    }
    <dialog
      #viewer
      class="image-viewer"
      [attr.aria-label]="'Imagen de ' + alt"
      (click)="closeOutside($event)"
      (cancel)="$event.stopPropagation()"
    >
      <header>
        <strong>{{ alt }}</strong
        ><button
          type="button"
          autofocus
          aria-label="Cerrar imagen"
          (click)="viewer.close()"
        >
          ×
        </button>
      </header>
      @if (image && viewer.open) {
        <img class="preview-image" [src]="'/api/images/' + image" [alt]="alt" />
      }
    </dialog>`,
  styles: [
    `
      :host {
        display: inline-block;
        width: 44px;
        height: 44px;
        flex: none;
      }
      img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .image-open {
        display: block;
        width: 100%;
        height: 100%;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: zoom-in;
        border-radius: 4px;
      }
      .image-open:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 3px;
      }
      .image-viewer {
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 12px;
        max-width: calc(100vw - 24px);
        max-height: calc(100dvh - 24px);
        background: var(--surface, #fff);
        color: var(--ink);
        box-shadow: 0 20px 80px #0005;
      }
      .image-viewer::backdrop {
        background: #000b;
      }
      .image-viewer header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 16px;
      }
      .image-viewer strong {
        font-size: 15px;
        max-width: 70vw;
      }
      .image-viewer header button {
        width: 40px;
        height: 40px;
        flex: none;
        font-size: 28px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: var(--surface);
        cursor: pointer;
      }
      .image-viewer .preview-image {
        width: min(80vw, 850px);
        height: 65dvh;
        max-height: calc(100dvh - 130px);
        object-fit: contain;
        background: white;
      }
      .image-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        color: var(--ink-muted);
        background: var(--surface-2);
        border-radius: 4px;
      }
    `,
  ],
})
export class ProductImageComponent implements OnChanges {
  @Input() image: string | null = null;
  @Input() alt = "Producto";
  failed = false;
  @ViewChild("viewer") viewer?: ElementRef<HTMLDialogElement>;
  ngOnChanges() {
    this.failed = false;
    this.viewer?.nativeElement.close();
  }
  closeOutside(event: MouseEvent) {
    if (event.target !== this.viewer?.nativeElement) return;
    const box = this.viewer.nativeElement.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      this.viewer.nativeElement.close();
  }
}
