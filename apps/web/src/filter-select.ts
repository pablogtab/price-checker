import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { OverlayModule } from "@angular/cdk/overlay";
import { A11yModule } from "@angular/cdk/a11y";

export interface FilterOption {
  value: string;
  label: string;
}
let nextId = 0;

@Component({
  selector: "app-filter-select",
  standalone: true,
  imports: [FormsModule, OverlayModule, A11yModule],
  template: `
    <button
      class="filter-trigger"
      type="button"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      [attr.aria-label]="label + ': ' + summary"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open"
      [attr.aria-controls]="open ? id : null"
      [class.has-selection]="value.length > 0"
      (click)="open = !open; search = ''"
    >
      <span
        ><small>{{ label }}</small
        ><span class="filter-summary">{{ summary }}</span></span
      >
      <span aria-hidden="true">⌄</span>
    </button>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      [cdkConnectedOverlayViewportMargin]="12"
      [cdkConnectedOverlayPush]="true"
      (backdropClick)="open = false"
      (overlayKeydown)="onKey($event)"
    >
      <section
        class="filter-panel"
        role="dialog"
        [id]="id"
        [attr.aria-label]="label"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
      >
        @if(options.length > 6){<input
          class="filter-option-search"
          cdkFocusInitial
          type="search"
          [attr.aria-label]="'Buscar en ' + label"
          placeholder="Buscar opciones…"
          [(ngModel)]="search"
        />}
        <div class="filter-panel-actions">
          <span aria-live="polite">{{ value.length }} seleccionados</span>
          <button
            type="button"
            (click)="valueChange.emit([])"
            [disabled]="!value.length"
          >
            Limpiar
          </button>
        </div>
        <div class="filter-options">
          @for (option of visibleOptions; track option.value) {
            <label class="filter-option">
              <input
                type="checkbox"
                [checked]="value.includes(option.value)"
                (change)="toggle(option.value)"
              />
              <span>{{ option.label }}</span>
            </label>
          } @empty {
            <p class="filter-empty">No hay opciones para esta búsqueda.</p>
          }
        </div>
        <div class="filter-panel-footer">
          <small>Podés elegir varias opciones.</small>
          <button type="button" (click)="open = false">Listo</button>
        </div>
      </section>
    </ng-template>
  `,
})
export class FilterSelectComponent {
  @Input() label = "";
  @Input() placeholder = "Todos";
  @Input() options: FilterOption[] = [];
  @Input() value: string[] = [];
  @Output() valueChange = new EventEmitter<string[]>();
  id = `filter-panel-${++nextId}`;
  open = false;
  search = "";
  get summary() {
    if (!this.value.length) return this.placeholder;
    const labels = this.options
      .filter((o) => this.value.includes(o.value))
      .map((o) => o.label);
    return labels.length <= 2
      ? labels.join(", ")
      : `${labels[0]} + ${labels.length - 1}`;
  }
  get visibleOptions() {
    const normalize = (s: string) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const terms = normalize(this.search).trim().split(/\s+/).filter(Boolean);
    return this.options.filter((o) =>
      terms.every((t) => normalize(o.label).includes(t)),
    );
  }
  toggle(value: string) {
    this.valueChange.emit(
      this.value.includes(value)
        ? this.value.filter((v) => v !== value)
        : [...this.value, value],
    );
  }
  onKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.open = false;
    }
  }
}
