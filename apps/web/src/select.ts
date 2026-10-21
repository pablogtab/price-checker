import { IconComponent } from "./ui/icon";
import {
  Component,
  Input,
  forwardRef,
  ViewChild,
  ElementRef,
} from "@angular/core";
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  FormsModule,
} from "@angular/forms";
import { OverlayModule } from "@angular/cdk/overlay";
import { A11yModule } from "@angular/cdk/a11y";

export interface SelectOption {
  value: any;
  label: string;
  detail?: string;
  search?: string;
}
let nextSelectId = 0;
@Component({
  selector: "app-select",
  standalone: true,
  imports: [FormsModule, OverlayModule, A11yModule, IconComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectComponent),
      multi: true,
    },
  ],
  template: ` <button
      #trigger
      type="button"
      class="select-trigger"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      [disabled]="disabled"
      [attr.aria-label]="label + ': ' + summary"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open"
      [attr.aria-controls]="open ? id : null"
      [class.select-placeholder]="!selected && !value"
      (click)="show()"
      (keydown.ArrowDown)="$event.preventDefault(); show()"
    >
      <span>{{ summary }}</span
      ><pc-icon class="select-chevron" name="chevron" />
    </button>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      [cdkConnectedOverlayWidth]="panelWidth"
      [cdkConnectedOverlayViewportMargin]="12"
      [cdkConnectedOverlayPush]="true"
      (backdropClick)="close()"
      (overlayKeydown)="key($event)"
    >
      <section
        class="select-panel"
        [class.select-panel-compact]="!showSearch"
        role="dialog"
        [id]="id"
        [attr.aria-label]="label"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
      >
        @if (showSearch) {
          <div class="select-search">
            <span aria-hidden="true"><pc-icon name="search" /></span
            ><input
              type="search"
              cdkFocusInitial
              [attr.aria-label]="'Buscar en ' + label"
              placeholder="Buscar…"
              [(ngModel)]="search"
              (ngModelChange)="active = 0"
              [ngModelOptions]="{ standalone: true }"
            />
          </div>
        }
        <div class="select-options">
          @for (option of visible; track option.value; let i = $index) {
            <button
              type="button"
              class="select-option"
              [class.select-active]="active === i"
              [class.select-selected]="same(option.value, value)"
              [attr.aria-pressed]="same(option.value, value)"
              (click)="choose(option.value)"
              (mouseenter)="active = i"
            >
              <span
                ><span class="select-option-name">{{ option.label }}</span>
                @if (option.detail) {
                  <small>{{ option.detail }}</small>
                }
              </span>
              @if (same(option.value, value)) {
                <span aria-hidden="true">✓</span>
              }
            </button>
          } @empty {
            <p class="select-empty">No hay coincidencias.</p>
          }
          @if (allowCustom && search.trim() && !exactMatch) {
            <button
              type="button"
              class="select-option select-create"
              (click)="choose(search.trim())"
            >
              Usar «{{ search.trim() }}»
            </button>
          }
        </div>
        @if (showSearch || clearable) {
          <div class="select-footer">
            <small>{{ visible.length }} opciones</small>
            @if (clearable && value) {
              <button type="button" (click)="choose('')">Limpiar</button>
            }
            <button type="button" (click)="close()">Cerrar</button>
          </div>
        }
      </section>
    </ng-template>`,
})
export class SelectComponent implements ControlValueAccessor {
  @Input() label = "Opciones";
  @Input() placeholder = "Seleccionar";
  @Input() options: SelectOption[] = [];
  @Input() allowCustom = false;
  @Input() clearable = false;
  @Input() disabled = false;
  @ViewChild("trigger") trigger?: ElementRef<HTMLButtonElement>;
  value: any = "";
  open = false;
  search = "";
  active = 0;
  panelWidth = 320;
  id = `select-panel-${++nextSelectId}`;
  change: (value: any) => void = () => {};
  touch: () => void = () => {};
  same(a: any, b: any) {
    return a != null && b != null && String(a) === String(b);
  }
  get showSearch() {
    return this.allowCustom || this.options.length > 6;
  }
  get selected() {
    return this.options.find((o) => this.same(o.value, this.value));
  }
  get summary() {
    return (
      this.selected?.label ||
      (this.allowCustom && this.value ? String(this.value) : this.placeholder)
    );
  }
  normalize(s: string) {
    return s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }
  get visible() {
    const terms = this.normalize(this.search)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return this.options.filter((o) =>
      terms.every((t) =>
        this.normalize(
          o.label + " " + (o.search || "") + " " + (o.detail || ""),
        ).includes(t),
      ),
    );
  }
  get exactMatch() {
    return this.options.some(
      (o) => this.normalize(o.label) === this.normalize(this.search.trim()),
    );
  }
  show() {
    if (this.disabled) return;
    if (this.open) {
      this.close();
      return;
    }
    this.search = "";
    this.active = 0;
    this.panelWidth = Math.min(
      Math.max(
        this.trigger?.nativeElement.clientWidth || 320,
        this.showSearch ? 280 : 160,
      ),
      window.innerWidth - 24,
    );
    this.open = true;
  }
  close() {
    this.open = false;
    this.touch();
    this.trigger?.nativeElement.focus();
  }
  choose(value: any) {
    this.value = value;
    this.change(value);
    this.close();
  }
  key(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.active = Math.max(
        0,
        Math.min(
          this.visible.length - 1,
          this.active + (event.key === "ArrowDown" ? 1 : -1),
        ),
      );
      const option = document
        .getElementById(this.id)
        ?.querySelectorAll<HTMLButtonElement>(".select-option")[this.active];
      option?.scrollIntoView({ block: "nearest" });
      if (!this.showSearch) option?.focus();
    }
    if (
      event.key === "Enter" &&
      (event.target as HTMLElement).tagName === "INPUT"
    ) {
      event.preventDefault();
      if (this.visible[this.active])
        this.choose(this.visible[this.active].value);
      else if (this.allowCustom && this.search.trim())
        this.choose(this.search.trim());
    }
  }
  writeValue(value: any) {
    this.value = value;
  }
  registerOnChange(fn: (value: any) => void) {
    this.change = fn;
  }
  registerOnTouched(fn: () => void) {
    this.touch = fn;
  }
  setDisabledState(value: boolean) {
    this.disabled = value;
    if (value) this.open = false;
  }
}
