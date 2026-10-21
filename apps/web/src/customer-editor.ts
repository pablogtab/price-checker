import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  ChangeDetectorRef,
  OnInit,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { A11yModule } from "@angular/cdk/a11y";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { ButtonDirective } from "./ui/button";
@Component({
  selector: "app-customer-editor",
  standalone: true,
  imports: [FormsModule, A11yModule, ButtonDirective],
  template: `
    <div
      class="modal-backdrop"
      (click)="!clientBusy && cancelClient()"
      (keydown.escape)="!clientBusy && cancelClient(); $event.stopPropagation()"
    >
      <section
        class="modal customer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-dialog-title"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        (click)="$event.stopPropagation()"
      >
        <button
          type="button"
          class="modal-close"
          aria-label="Cerrar cliente"
          [disabled]="clientBusy"
          (click)="cancelClient()"
        >
          ×
        </button>
        <div class="purchase-heading">
          <div>
            <h2 id="customer-dialog-title">
              {{ editingClient ? "Editar cliente" : "Nuevo cliente" }}
            </h2>
            <p>Solo los datos que necesitás para identificarlo.</p>
          </div>
        </div>
        <form (ngSubmit)="saveClient()" class="cash-form">
          <label
            >Nombre<input
              cdkFocusInitial
              name="clientName"
              maxlength="100"
              required
              [(ngModel)]="clientName"
              placeholder="Nombre y apellido"
          /></label>
          <label
            >Teléfono <span class="optional">opcional</span
            ><input
              name="clientPhone"
              maxlength="100"
              [(ngModel)]="clientPhone"
              type="tel"
          /></label>
          <label class="cash-wide"
            >Instagram <span class="optional">opcional</span
            ><input
              name="clientInstagram"
              maxlength="100"
              [(ngModel)]="clientInstagram"
              placeholder="@usuario"
              autocomplete="off"
          /></label>
          <label class="cash-wide"
            >Nota <span class="optional">opcional</span
            ><input name="clientNote" maxlength="500" [(ngModel)]="clientNote"
          /></label>
          <div class="sales-actions cash-wide">
            <button
              class="purchase-save"
              appButton="primary"
              [disabled]="clientBusy || !clientName.trim()"
            >
              {{
                clientBusy
                  ? "Guardando…"
                  : editingClient
                    ? "Guardar cliente"
                    : "Crear cliente"
              }}
            </button>
            <button
              type="button"
              class="text-button"
              [disabled]="clientBusy"
              (click)="cancelClient()"
            >
              Cancelar
            </button>
          </div>
        </form>
        @if (clientError) {
          <p class="alert danger" role="alert">{{ clientError }}</p>
        }
      </section>
    </div>
  `,
})
export class CustomerEditorComponent implements OnInit {
  @Input() customer: any = null;
  @Output() saved = new EventEmitter<any>();
  @Output() closed = new EventEmitter<void>();
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  editingClient: any = null;
  clientName = "";
  clientPhone = "";
  clientInstagram = "";
  clientNote = "";
  clientBusy = false;
  clientError = "";
  ngOnInit() {
    this.editingClient = this.customer;
    this.clientName = this.customer?.name || "";
    this.clientPhone = this.customer?.phone || "";
    this.clientInstagram = this.customer?.instagram || "";
    this.clientNote = this.customer?.note || "";
  }
  cancelClient() {
    if (!this.clientBusy) this.closed.emit();
  }
  async saveClient() {
    if (this.clientBusy || !this.clientName.trim()) return;
    this.clientBusy = true;
    this.clientError = "";
    try {
      const c: any = await firstValueFrom(
        this.http.request(
          this.editingClient ? "PUT" : "POST",
          "/api/customers" +
            (this.editingClient ? "/" + this.editingClient.id : ""),
          {
            body: {
              name: this.clientName,
              phone: this.clientPhone,
              instagram: this.clientInstagram,
              note: this.clientNote,
            },
          },
        ),
      );
      this.saved.emit(c);
    } catch (e: any) {
      this.clientError = e?.error?.message || "No se pudo guardar el cliente";
    } finally {
      this.clientBusy = false;
      this.cdr.markForCheck();
    }
  }
}
