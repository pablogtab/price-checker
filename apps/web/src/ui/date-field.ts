import {
  Component,
  Input,
  ViewChild,
  ElementRef,
  forwardRef,
} from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { A11yModule } from "@angular/cdk/a11y";
import { IconComponent } from "./icon";

/** Date-only value (YYYY-MM-DD), with local display and a keyboard-operable calendar. */
@Component({
  selector: "pc-date-field",
  standalone: true,
  imports: [A11yModule, IconComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DateFieldComponent),
      multi: true,
    },
  ],
  template: `<div class="date-field">
      <input
        type="text"
        [attr.aria-label]="label"
        placeholder="dd/mm/aaaa"
        [value]="text"
        [attr.aria-invalid]="!!text && !value"
        [disabled]="disabled"
        (input)="type($event)"
        (blur)="blur()"
      /><button
        #toggle
        type="button"
        [disabled]="disabled"
        [attr.aria-label]="'Abrir calendario de ' + label"
        [attr.aria-expanded]="open"
        (click)="show()"
      >
        <pc-icon name="calendar" />
      </button>
    </div>
    @if (text && !value) {
      <small class="date-error" role="alert"
        >Ingresá una fecha válida: dd/mm/aaaa.</small
      >
    }
    @if (open) {
      <div class="date-dismiss" (click)="close()"></div>
      <section
        #calendar
        class="calendar"
        role="dialog"
        [attr.aria-label]="'Elegir ' + label"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        (keydown.escape)="close(); $event.stopPropagation()"
        (keydown)="keys($event)"
      >
        <header>
          <button type="button" aria-label="Mes anterior" (click)="move(-1)">
            ‹</button
          ><strong>{{ monthLabel }}</strong
          ><button type="button" aria-label="Mes siguiente" (click)="move(1)">
            ›
          </button>
        </header>
        <div class="calendar-grid">
          @for (d of ["L", "M", "X", "J", "V", "S", "D"]; track $index) {
            <small>{{ d }}</small>
          }
          @for (d of days; track $index) {
            <button
              type="button"
              [disabled]="!d"
              [attr.data-day]="d || null"
              [attr.aria-label]="d ? dayLabel(d) : null"
              [attr.aria-pressed]="iso(d) === value"
              [tabIndex]="d === focusedDay ? 0 : -1"
              [class.selected]="iso(d) === value"
              (click)="pick(iso(d))"
            >
              {{ d || "" }}
            </button>
          }
        </div>
        <footer>
          <button type="button" (click)="pick(today())">Hoy</button
          ><button type="button" (click)="yesterday()">Ayer</button>
        </footer>
      </section>
    }`,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        min-width: 0;
      }
      .date-field {
        display: flex;
        align-items: center;
        border: 1px solid var(--line, #ddd);
        border-radius: 7px;
        background: var(--surface, #fff);
        padding-right: 6px;
        min-height: 42px;
      }
      .date-field:focus-within {
        border-color: var(--accent, #205da7);
        box-shadow: 0 0 0 2px #205da719;
      }
      .date-field input {
        border: 0 !important;
        box-shadow: none !important;
        background: transparent;
        min-width: 0;
        width: 100%;
        padding: 10px 12px;
        font: inherit;
        font-size: 13px;
        color: inherit;
        outline: none;
      }
      .date-field button {
        border: 0;
        background: none;
        color: var(--ink-muted);
        padding: 5px;
        display: flex;
        cursor: pointer;
      }
      .date-dismiss {
        position: fixed;
        inset: 0;
        z-index: 1099;
      }
      .calendar {
        position: absolute;
        right: 0;
        top: calc(100% + 7px);
        z-index: 1100;
        background: var(--surface, #fff);
        width: min(280px, calc(100vw - 40px));
        padding: 14px;
        border: 1px solid var(--line, #ddd);
        border-radius: 10px;
        box-shadow: 0 8px 28px #122a4026;
      }
      .calendar header,
      .calendar footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .calendar header strong {
        font-size: 13px;
      }
      .calendar button {
        border: 0;
        background: none;
        font: inherit;
        color: inherit;
        border-radius: 5px;
        cursor: pointer;
        padding: 7px;
      }
      .calendar button:hover {
        background: var(--accent-soft, #edf4fc);
      }
      .calendar header button {
        font-size: 20px;
        padding: 0 8px;
      }
      .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 3px;
        text-align: center;
        margin: 14px 0;
      }
      .calendar-grid small {
        font-size: 10px;
        color: var(--ink-muted);
        padding: 4px 0;
      }
      .calendar-grid button {
        font-size: 12px;
      }
      .calendar-grid button.selected {
        background: var(--accent, #205da7);
        color: white;
      }
      .calendar button:focus-visible {
        outline: 2px solid var(--accent, #205da7);
        outline-offset: 1px;
      }
      .calendar button:disabled {
        visibility: hidden;
      }
      .calendar footer {
        justify-content: center;
        border-top: 1px solid var(--line, #ddd);
        padding-top: 10px;
      }
      .calendar footer button {
        border: 1px solid var(--line, #ddd);
        font-size: 12px;
        padding: 6px 15px;
      }
    `,
  ],
})
export class DateFieldComponent implements ControlValueAccessor {
  @Input() label = "Fecha de venta";
  @ViewChild("toggle") toggle?: ElementRef<HTMLButtonElement>;
  @ViewChild("calendar") calendar?: ElementRef<HTMLElement>;
  value = "";
  text = "";
  disabled = false;
  open = false;
  month = new Date();
  focusedDay = 1;
  change = (_v: string) => {};
  touched = () => {};
  writeValue(v: string) {
    this.value = v || "";
    this.text = this.value ? this.value.split("-").reverse().join("/") : "";
  }
  registerOnChange(f: (v: string) => void) {
    this.change = f;
  }
  registerOnTouched(f: () => void) {
    this.touched = f;
  }
  setDisabledState(v: boolean) {
    this.disabled = v;
  }
  blur() {
    this.touched();
    if (this.value) this.text = this.value.split("-").reverse().join("/");
  }
  today() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date());
  }
  type(e: Event) {
    this.text = (e.target as HTMLInputElement).value;
    const s = this.text.trim();
    const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(s)
      ? s.split("/").reverse().join("-")
      : s;
    const d = new Date(iso + "T12:00:00");
    this.value =
      /^\d{4}-\d{2}-\d{2}$/.test(iso) &&
      !Number.isNaN(d.getTime()) &&
      [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0"),
      ].join("-") === iso
        ? iso
        : "";
    this.change(this.value);
  }
  show() {
    if (this.open) {
      this.close();
      return;
    }
    const d = new Date((this.value || this.today()) + "T12:00:00");
    this.month = new Date(d.getFullYear(), d.getMonth(), 1);
    this.focusedDay = d.getDate();
    this.open = true;
    setTimeout(() => this.focusDay());
  }
  close() {
    this.open = false;
    this.touched();
    this.toggle?.nativeElement.focus();
  }
  pick(v: string) {
    this.writeValue(v);
    this.change(v);
    this.close();
  }
  yesterday() {
    const d = new Date(this.today() + "T12:00:00");
    d.setDate(d.getDate() - 1);
    this.pick(this.dateString(d));
  }
  dateString(d: Date) {
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  }
  iso(d: number) {
    return this.dateString(
      new Date(this.month.getFullYear(), this.month.getMonth(), d || 1),
    );
  }
  get monthLabel() {
    return this.month.toLocaleDateString("es-AR", {
      month: "long",
      year: "numeric",
    });
  }
  dayLabel(d: number) {
    return new Date(this.iso(d) + "T12:00:00").toLocaleDateString("es-AR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  get days() {
    const offset =
      (new Date(this.month.getFullYear(), this.month.getMonth(), 1).getDay() +
        6) %
      7;
    return [
      ...Array(offset).fill(0),
      ...Array.from(
        {
          length: new Date(
            this.month.getFullYear(),
            this.month.getMonth() + 1,
            0,
          ).getDate(),
        },
        (_, i) => i + 1,
      ),
    ];
  }
  move(n: number) {
    this.month = new Date(
      this.month.getFullYear(),
      this.month.getMonth() + n,
      1,
    );
    this.focusedDay = Math.min(
      this.focusedDay,
      new Date(
        this.month.getFullYear(),
        this.month.getMonth() + 1,
        0,
      ).getDate(),
    );
  }
  focusDay() {
    this.calendar?.nativeElement
      .querySelector<HTMLButtonElement>(`[data-day="${this.focusedDay}"]`)
      ?.focus();
  }
  keys(e: KeyboardEvent) {
    if (!(e.target as HTMLElement).hasAttribute("data-day")) return;
    const delta = (
      { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<
        string,
        number
      >
    )[e.key];
    if (!delta) return;
    e.preventDefault();
    const d = new Date(
      this.month.getFullYear(),
      this.month.getMonth(),
      this.focusedDay + delta,
    );
    this.month = new Date(d.getFullYear(), d.getMonth(), 1);
    this.focusedDay = d.getDate();
    setTimeout(() => this.focusDay());
  }
}
