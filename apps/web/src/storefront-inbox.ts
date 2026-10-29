import { Component, OnInit, inject, ChangeDetectorRef } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { SelectComponent } from "./select";
@Component({
  selector: "app-storefront-inbox",
  standalone: true,
  imports: [FormsModule, SelectComponent],
  template: ` <section class="inbox">
    <header>
      <div>
        <h2>Bandeja de pedidos</h2>
        <p>
          Solicitudes guardadas. El envío de WhatsApp se confirma en la
          conversación.
        </p>
      </div>
    </header>
    <div class="filters">
      <label
        >Buscar por número<input
          type="search"
          aria-label="Buscar pedido"
          [(ngModel)]="q"
          (ngModelChange)="page = 1; load()"
          placeholder="GEVA-000001" /></label
      ><label
        >Estado<app-select
          label="Estado del pedido"
          [options]="statuses"
          [(ngModel)]="status"
          (ngModelChange)="page = 1; load()"
      /></label>
    </div>
    @if (error) {
      <p role="alert">
        {{ error }} <button (click)="load()">Reintentar</button>
      </p>
    }
    @if (loading) {
      <p role="status">Cargando pedidos…</p>
    } @else {
      @for (row of rows; track row.id) {
        <article>
          <div>
            <strong>{{ row.snapshot.number }}</strong>
            <p>{{ label(row.status) }} · {{ date(row.created_at) }}</p>
            <small>Sin datos de contacto</small>
          </div>
          <div>
            <strong>ARS {{ row.snapshot.total }}</strong
            ><button (click)="open(row.id)">Ver pedido</button>
          </div>
        </article>
      } @empty {
        <p>No hay pedidos con estos filtros.</p>
      }
      <nav aria-label="Páginas de pedidos">
        <button [disabled]="page === 1" (click)="page = page - 1; load()">
          Anterior</button
        ><span>Página {{ page }} · {{ total }} pedidos</span
        ><button
          [disabled]="page * 25 >= total"
          (click)="page = page + 1; load()"
        >
          Siguiente
        </button>
      </nav>
    }
    @if (detail) {
      <section class="detail" aria-label="Detalle del pedido">
        <header>
          <h3>{{ detail.snapshot.number }} · {{ label(detail.status) }}</h3>
          <button (click)="detail = null">Cerrar detalle</button>
        </header>
        <p>Solicitud original · Sin datos de contacto</p>
        @for (line of detail.snapshot.lines; track $index) {
          <article>
            <div>
              <strong>{{ line.quantity }} × {{ line.title }}</strong>
              @for (label of line.labels; track $index) {
                <p>{{ label }}</p>
              }
            </div>
            <div>
              ARS {{ line.price }}
              <p>Subtotal: ARS {{ line.subtotal }}</p>
            </div>
          </article>
        }
        <p>
          <strong>Total original: ARS {{ detail.snapshot.total }}</strong>
        </p>
        @if (detail.status === "pending") {
          <p>
            Preparar una venta conserva esta solicitud. Elegí cliente y cobro en
            Nueva venta.
          </p>
          <div class="actions">
            <button (click)="prepare()">Preparar Nueva venta</button
            ><button (click)="discardConfirm = true">Descartar pedido</button>
          </div>
          @if (discardConfirm) {
            <p>¿Descartar esta solicitud sin registrar una venta?</p>
            <button [disabled]="busy" (click)="discard()">
              Confirmar descarte</button
            ><button (click)="discardConfirm = false">Cancelar</button>
          }
        }
        @if (detail.sale_id) {
          <p>
            Convertido en venta #{{ detail.sale_id }}. La anulación de la venta
            conserva este vínculo.
          </p>
        }
      </section>
    }
  </section>`,
  styles: [
    `
      .inbox {
        max-width: 1100px;
        margin: auto;
      }
      .inbox header,
      .filters,
      .actions,
      nav {
        display: flex;
        gap: 16px;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
      }
      h2,
      h3,
      p {
        margin: 0 0 10px;
      }
      .filters {
        justify-content: start;
        margin: 24px 0;
      }
      .filters label {
        display: grid;
        gap: 8px;
        min-width: 220px;
      }
      input {
        padding: 12px;
        border: 1px solid #ccd4de;
        border-radius: 8px;
      }
      article {
        display: flex;
        gap: 16px;
        justify-content: space-between;
        padding: 20px 0;
        border-bottom: 1px solid #dbe1e8;
      }
      article > div:last-child {
        text-align: right;
      }
      button {
        min-height: 44px;
        padding: 10px 16px;
        border: 1px solid #ccd4de;
        border-radius: 8px;
        background: white;
        cursor: pointer;
      }
      article button {
        display: block;
        margin: 8px 0 0 auto;
      }
      nav {
        margin: 20px 0;
      }
      .detail {
        padding: 24px;
        background: white;
        border: 1px solid #ccd4de;
        border-radius: 12px;
        margin-top: 24px;
      }
      small {
        color: #637084;
      }
      @media (max-width: 600px) {
        .detail {
          padding: 16px;
        }
        .filters label {
          width: 100%;
        }
        article {
          gap: 10px;
        }
        nav {
          gap: 8px;
          font-size: 13px;
        }
      }
    `,
  ],
})
export class StorefrontInboxComponent implements OnInit {
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  rows: any[] = [];
  detail: any = null;
  q = "";
  status = "pending";
  page = 1;
  total = 0;
  loading = false;
  error = "";
  busy = false;
  discardConfirm = false;
  private revision = 0;
  statuses = [
    { value: "pending", label: "Pendiente" },
    { value: "converted", label: "Convertido en venta" },
    { value: "discarded", label: "Descartado" },
    { value: "all", label: "Todos" },
  ];
  label(s: string) {
    return this.statuses.find((x) => x.value === s)?.label || s;
  }
  date(s: string) {
    return new Date(s).toLocaleString("es-AR");
  }
  ngOnInit() {
    this.load();
  }
  async load() {
    const rev = ++this.revision;
    this.loading = true;
    this.error = "";
    try {
      const r = await firstValueFrom(
        this.http.get<any>("/api/storefront/orders", {
          params: { q: this.q, status: this.status, page: this.page },
        }),
      );
      if (rev !== this.revision) return;
      this.rows = r.rows;
      this.total = r.total;
    } catch (e: any) {
      if (rev === this.revision)
        this.error = e.error?.message || "No se pudieron cargar los pedidos";
    } finally {
      if (rev === this.revision) this.loading = false;
      this.cdr.markForCheck();
    }
  }
  async open(id: number) {
    try {
      this.detail = await firstValueFrom(
        this.http.get<any>("/api/storefront/orders/" + id),
      );
      this.discardConfirm = false;
    } catch (e: any) {
      this.error = e.error?.message || "No se pudo abrir el pedido";
    }
    this.cdr.markForCheck();
  }
  prepare() {
    location.href = "/sales/new?order=" + this.detail.id;
  }
  async discard() {
    if (this.busy) return;
    this.busy = true;
    try {
      await firstValueFrom(
        this.http.post(
          "/api/storefront/orders/" + this.detail.id + "/discard",
          {},
        ),
      );
      await this.open(this.detail.id);
      await this.load();
    } catch (e: any) {
      this.error = e.error?.message || "No se pudo descartar";
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
}
