import { Component, Input, Output, EventEmitter } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { A11yModule } from "@angular/cdk/a11y";
import { SelectComponent } from "./select";
import { ButtonDirective } from "./ui/button";

@Component({
  selector: "app-sales-promo-picker",
  standalone: true,
  imports: [FormsModule, A11yModule, SelectComponent, ButtonDirective],
  styles: [
    `
      .promo-options {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
        gap: 16px;
        margin: 24px 0;
      }
      .promo-options label {
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      .promo-options app-select {
        min-width: 0;
      }
      .promo-price {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 16px 0;
        border-top: 1px solid var(--border, #e1e7df);
      }
      .promo-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        flex-wrap: wrap;
      }
    `,
  ],
  template: `
    <div
      class="modal-backdrop"
      (click)="cancel.emit()"
      (keydown.escape)="cancel.emit(); $event.stopPropagation()"
    >
      <section
        class="modal sales-review"
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-picker-title"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        (click)="$event.stopPropagation()"
      >
        <h2 id="promo-picker-title">Elegir sabores de la promo</h2>
        <p>{{ name }}</p>
        <div class="promo-options">
          @for (slot of slots; track slot.key) {
            <label
              >{{ slot.label }}
              <app-select
                [label]="slot.label"
                placeholder="Elegir sabor"
                [options]="slot.options"
                [(ngModel)]="slot.product_id"
                (ngModelChange)="changed.emit()"
              />
            </label>
          }
        </div>
        <div class="promo-price">
          <span>Precio de la promo</span><strong>{{ price }}</strong>
        </div>
        <div class="promo-actions">
          <button appButton (click)="cancel.emit()">Cancelar</button
          ><button
            appButton="primary"
            [disabled]="!complete"
            (click)="confirm.emit()"
          >
            Agregar promo
          </button>
        </div>
      </section>
    </div>
  `,
})
export class SalesPromoPickerComponent {
  @Input() name = "";
  @Input() slots: any[] = [];
  @Input() price = "";
  @Output() changed = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();
  get complete() {
    return this.slots.every((s) =>
      s.options.some((o: any) => o.value === Number(s.product_id)),
    );
  }
}
