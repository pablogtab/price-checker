import { Component, Input } from "@angular/core";
import { ICONS } from "./icons";
const EXTRA = {
  plus: ["M12 5v14", "M5 12h14"],
  refresh: [
    "M20 7v5h-5",
    "M4 17v-5h5",
    "M6 7a7 7 0 0 1 12-1l2 3",
    "M18 17a7 7 0 0 1-12 1l-2-3",
  ],
  settings: ["M4 7h16", "M4 17h16", "M8 4v6", "M16 14v6"],
  chevron: ["M6 9l6 6 6-6"],
  close: ["M6 6l12 12", "M6 18L18 6"],
  edit: ["M16 3l5 5-12 12-6 1 1-6z", "M14 5l5 5"],
  link: [
    "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2",
    "M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  ],
} as const;
@Component({
  selector: "pc-icon",
  standalone: true,
  template: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    @for (path of paths; track path) {
      <path [attr.d]="path" />
    }
  </svg>`,
  styles: [
    `
      :host {
        display: inline-flex;
        width: 18px;
        height: 18px;
        flex: none;
        vertical-align: middle;
      }
      svg {
        display: block;
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.7;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    `,
  ],
})
export class IconComponent {
  @Input() name = "products";
  get paths(): readonly string[] {
    return (
      ({ ...ICONS, ...EXTRA } as Record<string, readonly string[]>)[
        this.name
      ] || ICONS.products
    );
  }
}
