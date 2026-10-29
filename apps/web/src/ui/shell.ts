import { Component, Input, Output, EventEmitter } from "@angular/core";
import { IconComponent } from "./icon";
const GROUPS = [
  {
    title: "",
    items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" },{id:"new-sale",label:"Nueva venta",icon:"plus"}],
  },
  {
    title: "Catálogo",
    items: [
      { id: "store", label: "Tienda", icon: "products" },
      { id: "orders", label: "Pedidos de tienda", icon: "sales" },
      { id: "media", label: "Imágenes", icon: "products" },
      { id: "price-lists", label: "Listas de precios", icon: "products" },
      { id: "products", label: "Mis productos", icon: "products" },
      { id: "catalog", label: "Proveedores", icon: "branches" },
    ],
  },
  {
    title: "Operación",
    items: [
      { id: "sales", label: "Ventas", icon: "payments" },
      { id: "purchases", label: "Compras", icon: "routines" },
      { id: "customers", label: "Clientes", icon: "members" },
      { id: "cash", label: "Caja y cuentas", icon: "cash" },
    ],
  },
  {
    title: "Sistema",
    items: [{ id: "settings", label: "Configuración", icon: "settings" }],
  },
];
/** Presentation-only adaptation of Gym's shell; navigation stays in the app. */
@Component({
  selector: "pc-shell",
  standalone: true,
  imports: [IconComponent],
  template: ` <div class="gym-shell">
    <aside class="gym-sidebar">
      <a class="gym-brand" href="/" (click)="go($event, 'dashboard')"
        ><pc-icon name="products" />Precios</a
      >
      <nav aria-label="Navegación principal">
        @for (group of groups; track group.title) {
          <div class="gym-group">
            @if (group.title) {
              <p class="gym-group-title">{{ group.title }}</p>
            }
            @for (item of group.items; track item.id) {
              <a
                [href]="item.id==='new-sale'?'/sales/new':'/'+item.id"
                [class.active]="view === item.id"
                [attr.aria-current]="view === item.id ? 'page' : null"
                (click)="go($event, item.id)"
                ><pc-icon [name]="item.icon" /><span>{{ item.label }}</span>
                @if (item.id === "products") {
                  <small>{{ productCount }}</small>
                }
              </a>
            }
          </div>
        }
      </nav>
    </aside>
    <main class="gym-main"><ng-content /></main>
  </div>`,
  styles: [
    `
      :host {
        display: block;
      }
      .gym-shell {
        display: grid;
        grid-template-columns: 228px minmax(0, 1fr);
        min-height: 100dvh;
      }
      .gym-sidebar {
        position: sticky;
        top: 0;
        align-self: start;
        height: 100dvh;
        display: flex;
        flex-direction: column;
        gap: 20px;
        overflow: auto;
        background: var(--surface);
        border-right: 1px solid var(--line);
        padding: 20px 12px;
      }
      .gym-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0;
        padding: 0 10px 20px;
        border-bottom: 1px solid var(--line);
        font-size: 18px;
        font-weight: 650;
        color: var(--ink);
        letter-spacing: -0.01em;
      }
      .gym-brand pc-icon {
        color: var(--accent);
      }
      nav {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .gym-group + .gym-group {
        padding-top: 16px;
        border-top: 1px solid var(--line);
      }
      .gym-group-title {
        margin: 0 0 6px;
        padding: 0 12px;
        color: var(--ink-muted);
        font-size: 10px;
        font-weight: 650;
        text-transform: uppercase;
        letter-spacing: 0.07em;
      }
      nav a {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: var(--radius-sm);
        border-left: 3px solid transparent;
        color: var(--ink-2);
        font-size: 13px;
        font-weight: 550;
        text-decoration: none;
        white-space: nowrap;
      }
      nav a:hover {
        background: var(--surface-2);
        color: var(--ink);
      }
      nav a.active {
        background: var(--accent-soft);
        border-left-color: var(--accent);
        color: var(--accent-ink);
      }
      nav a small {
        margin-left: auto;
        border-radius: 4px;
        background: var(--surface-2);
        padding: 1px 6px;
        font-size: 11px;
        color: inherit;
      }
      .gym-main {
        display: block;
        min-width: 0;
        margin: 0;
        width: 100%;
        background: var(--page);
      }
      @media (max-width: 760px) {
        .gym-shell {
          grid-template-columns: minmax(0, 1fr);
        }
        .gym-sidebar {
          position: static;
          height: auto;
          gap: 10px;
          padding: 12px 16px;
          border-right: 0;
          border-bottom: 1px solid var(--line);
          overflow: hidden;
        }
        .gym-brand {
          padding: 0 0 10px;
          font-size: 16px;
        }
        nav {
          flex-direction: row;
          overflow-x: auto;
          gap: 4px;
          padding-bottom: 4px;
        }
        .gym-group {
          display: flex;
          gap: 4px;
        }
        .gym-group + .gym-group {
          padding: 0;
          border: 0;
        }
        .gym-group-title {
          display: none;
        }
        nav a {
          padding: 9px 11px;
          font-size: 12px;
          min-height: 40px;
        }
        nav a small {
          display: none;
        }
      }
    `,
  ],
})
export class ShellComponent {
  @Input() view = "dashboard";
  @Input() productCount = 0;
  @Output() viewChange = new EventEmitter<string>();
  groups = GROUPS;
  go(event: MouseEvent, id: string) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    this.viewChange.emit(id);
  }
}
