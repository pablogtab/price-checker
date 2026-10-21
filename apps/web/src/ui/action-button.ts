import { Component, computed, input } from "@angular/core";

const ACTIONS = {
  edit: ["M16 3l5 5-12 12-6 1 1-6z", "M14 5l5 5"],
  deactivate: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M6 6l12 12"],
  activate: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M8 12l3 3 5-6"],
  trash: ["M3 6h18", "M8 6V3h8v3", "M5 6l1 15h12l1-15", "M10 10v7", "M14 10v7"],
  duplicate: ["M8 8h13v13H8z", "M16 8V3H3v13h5"],
  view: [
    "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z",
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  ],
} as const;

/** Compact actions share hit areas, tooltips, focus styles and accessible names. */
@Component({
  selector: "button[appAction]",
  host: {
    type: "button",
    class: "icon-action",
    "[attr.aria-label]": "label()",
    "[attr.title]": "label()",
    "[class.destructive]": "action() === 'trash' || action() === 'deactivate'",
  },
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    @for (path of paths(); track path) {
      <path [attr.d]="path" />
    }
  </svg>`,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        min-height: 36px;
        padding: 0;
        flex-shrink: 0;
        border: 1px solid var(--line, #ddd);
        border-radius: 8px;
        background: transparent;
        color: var(--ink-2, #586173);
        cursor: pointer;
        vertical-align: middle;
      }
      :host:hover {
        background: var(--primary-soft, #eaf2ff);
        color: var(--primary, #2563eb);
      }
      :host.destructive {
        color: #c03939;
      }
      :host.destructive:hover {
        background: #fff0f0;
        border-color: #f3bcbc;
      }
      :host:focus-visible {
        outline: 2px solid var(--primary, #2563eb);
        outline-offset: 2px;
      }
      :host:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      svg {
        display: block;
        width: 18px;
        height: 18px;
        pointer-events: none;
      }
    `,
  ],
})
export class ActionButton {
  readonly action = input.required<keyof typeof ACTIONS>({
    alias: "appAction",
  });
  readonly label = input.required<string>({ alias: "actionLabel" });
  protected readonly paths = computed(() => ACTIONS[this.action()]);
}
