import { Component, Input, OnChanges } from "@angular/core";
import { IconComponent } from "./icon";
@Component({
  selector: "pc-product-image",
  standalone: true,
  imports: [IconComponent],
  template: `@if (image && !failed) {
      <img
        [src]="'/api/images/' + image"
        [alt]="alt"
        loading="lazy"
        (error)="failed = true"
      />
    } @else {
      <span
        class="image-placeholder"
        role="img"
        [attr.aria-label]="'Sin imagen de ' + alt"
        ><pc-icon name="products"
      /></span>
    }`,
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
  ngOnChanges() {
    this.failed = false;
  }
}
