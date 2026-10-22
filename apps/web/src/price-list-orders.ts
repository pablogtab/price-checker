import {
  Component,
  EventEmitter,
  Output,
  inject,
  OnInit,
  ChangeDetectorRef,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { ButtonDirective } from "./ui/button";
@Component({
  selector: "app-price-list-orders",
  standalone: true,
  imports: [FormsModule, ButtonDirective],
  template: ` <section class="order-settings">
    <button
      appButton="secondary"
      (click)="expanded = !expanded"
      [attr.aria-expanded]="expanded"
    >
      Configurar encargos
    </button>
    @if (expanded) {
      <h3>Encargos · configuración compartida</h3>
      <p>
        Se aplica a todas las listas. Solo ofrecemos encargos con stock positivo
        conocido en el proveedor.
      </p>
      <label
        >Entrega estimada (días)<input
          type="number"
          min="1"
          max="365"
          [(ngModel)]="days"
          (ngModelChange)="changed.emit()"
      /></label>
      <input
        aria-label="Buscar permisos de encargo"
        placeholder="Buscar producto o promo…"
        [(ngModel)]="query"
      />
      <div class="order-products">
        @for (p of filtered; track p.id) {
          <label
            ><input
              type="checkbox"
              [(ngModel)]="p.allowed"
              (ngModelChange)="changed.emit()"
            />{{ p.name }}</label
          >
        }
      </div>
      <button appButton="primary" [disabled]="busy" (click)="save()">
        Guardar configuración de encargos
      </button>
      @if (message) {
        <p role="status">{{ message }}</p>
      }
    }
  </section>`,
  styles: [
    `
      .order-settings {
        margin: 1rem 0;
      }
      .order-settings > label {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .order-settings > label input {
        width: 6rem;
      }
      .order-products {
        max-height: 16rem;
        overflow: auto;
        margin: 1rem 0;
      }
      .order-products label {
        display: flex;
        gap: 0.6rem;
        padding: 0.6rem;
      }
      .order-products input {
        width: 1rem;
        flex-shrink: 0;
      }
    `,
  ],
})
export class PriceListOrdersComponent implements OnInit {
  @Output() changed = new EventEmitter<void>();
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  days = 7;
  products: any[] = [];
  query = "";
  expanded = false;
  busy = false;
  message = "";
  async ngOnInit() {
    try {
      const p: any = await firstValueFrom(
        this.http.get("/api/price-list-order-policy"),
      );
      this.days = p.days;
      this.products = p.products;
    } catch {
      this.message = "No se pudieron cargar los permisos.";
    }
    this.cdr.detectChanges();
  }
  get filtered() {
    return this.products.filter((p) =>
      p.name.toLowerCase().includes(this.query.toLowerCase()),
    );
  }
  async save() {
    this.busy = true;
    try {
      await firstValueFrom(
        this.http.put("/api/price-list-order-policy", {
          days: this.days,
          allowed_product_ids: this.products
            .filter((p) => p.allowed)
            .map((p) => p.id),
        }),
      );
      this.changed.emit();
      this.message = "Configuración guardada en todas las listas";
    } catch {
      this.message = "No se pudo guardar. Revisá el plazo e intentá de nuevo.";
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }
}
