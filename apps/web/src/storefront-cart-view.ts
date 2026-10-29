import { Component, inject } from "@angular/core";
import Decimal from "decimal.js";
import { StorefrontCart, CartLine } from "./storefront-cart";
@Component({
  selector: "geva-storefront-cart",
  standalone: true,

  styleUrls: ["./storefront-view.css", "./storefront-cart.css"],
  template: ` <header>
      <a href="/" class="wordmark">GEVA<span>FIT</span></a
      ><span>Tu carrito</span>
    </header>
    <div class="delivery">
      Entrega en Córdoba capital · Coordinamos por WhatsApp
    </div>
    <main>
      <a href="/" class="back">← Seguir comprando</a>
      <h1>Tu carrito</h1>
      @if (cart.receipt(); as receipt) {
        <section class="order-receipt" aria-label="Pedido guardado">
          <p class="order-status">Pedido guardado · Pendiente de conversar</p>
          <h2>Pedido {{ receipt.number }}</h2>
          <p>Enviá el mensaje en WhatsApp para coordinar tu compra.</p>
          @for (line of receipt.lines; track $index) {
            <article class="receipt-line">
              @if (line.imageUrl) {
                <img
                  class="cart-photo"
                  [src]="line.imageUrl"
                  [alt]="line.title"
                />
              }
              <strong>{{ line.quantity }} × {{ line.title }}</strong>
              @for (label of line.labels; track $index) {
                <p>{{ label }}</p>
              }
              <p>
                {{ money(line.price) }}
                por unidad ·
                {{ money(line.subtotal) }}
              </p>
            </article>
          }
          <p class="receipt-total">
            Total de productos
            <strong>{{ money(receipt.total) }}</strong>
          </p>
          <p>Envío y entrega a coordinar en Córdoba capital.</p>
          <a
            class="cart-action whatsapp"
            [href]="receipt.whatsappUrl"
            target="_blank"
            rel="noopener noreferrer"
            ><svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M20.52 3.48A11.85 11.85 0 0 0 12.04 0C5.46 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.95L0 24l6.26-1.64a11.9 11.9 0 0 0 5.77 1.47h.01C18.62 23.83 24 18.48 24 11.9c0-3.19-1.24-6.18-3.48-8.42ZM12.04 21.8a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.72.98 1-3.63-.24-.37a9.86 9.86 0 0 1-1.51-5.25C2.17 6.48 6.61 2.04 12.05 2.04c2.64 0 5.12 1.03 6.98 2.9a9.8 9.8 0 0 1 2.89 6.98c0 5.45-4.44 9.88-9.88 9.88Zm5.42-7.4c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.18-.3-.02-.46.13-.61.13-.13.3-.35.45-.53.15-.17.2-.3.3-.49.1-.2.05-.37-.02-.52-.08-.15-.68-1.62-.93-2.22-.24-.58-.49-.5-.67-.51h-.58c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.11 3.22 5.11 4.52.71.31 1.27.49 1.71.63.72.23 1.37.2 1.88.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z"
              /></svg
            >Abrir WhatsApp</a
          >
          <button class="secondary" (click)="cart.copyMessage()">
            Copiar mensaje
          </button>
          @if (cart.copyText()) {
            <label class="copy-label"
              >Mensaje del pedido<textarea
                readonly
                [value]="receipt.message"
              ></textarea>
            </label>
          }
          <button class="secondary" (click)="cart.newPurchase()">
            Nueva compra
          </button>
        </section>
      } @else {
        @if (cart.orderError()) {
          <div role="alert" class="cart-error">{{ cart.orderError() }}</div>
        }
        @if (cart.submission()) {
          <p role="status">
            {{
              cart.submitting()
                ? "Recuperando pedido…"
                : "Tu pedido conserva la misma referencia para reintentar."
            }}
          </p>
        }
        @if (cart.loading()) {
          <p role="status">Actualizando precios…</p>
        }
        @if (cart.error()) {
          <div class="cart-error" role="alert">
            <p>{{ cart.error() }}</p>
            <button (click)="cart.validate()">Volver a intentar</button>
          </div>
        }
        @if (!cart.lines().length && !cart.loading()) {
          <div class="state">
            <p>Tu carrito está vacío.</p>
            <a class="cart-action" href="/">Ver catálogo</a>
          </div>
        }
        @if (cart.lines().length) {
          <div class="cart-layout">
            <section aria-label="Productos del carrito">
              @for (line of cart.lines(); track $index) {
                <article class="cart-line">
                  <div>
                    @if (line.imageUrl) {
                      <img
                        class="cart-photo"
                        [src]="line.imageUrl"
                        [alt]="line.title || 'Producto'"
                      />
                    }
                    <h2>
                      {{
                        line.title ||
                          (line.kind === "promo" ? "Promo" : "Producto")
                      }}
                    </h2>
                    @for (label of line.labels || []; track $index) {
                      <p class="cart-label">{{ label }}</p>
                    }
                    @if (line.price && !cart.submission()) {
                      <p class="cart-unit">
                        {{ money(line.price) }}
                        por unidad
                      </p>
                    }
                  </div>
                  <div class="cart-controls">
                    <label
                      >Cantidad<input
                        type="number"
                        min="1"
                        max="1000000"
                        step="1"
                        inputmode="numeric"
                        [attr.aria-label]="
                          'Cantidad de ' + (line.title || 'producto')
                        "
                        [value]="line.quantity"
                        [disabled]="!!cart.submission()"
                        (change)="changeQuantity(line, $event)" /></label
                    ><button
                      class="remove"
                      [disabled]="!!cart.submission()"
                      (click)="cart.remove(line)"
                      [attr.aria-label]="'Quitar ' + (line.title || 'producto')"
                    >
                      Quitar
                    </button>
                  </div>
                  @if (
                    line.subtotal &&
                    !cart.loading() &&
                    !cart.error() &&
                    !cart.submission()
                  ) {
                    <strong class="cart-subtotal">{{
                      money(line.subtotal)
                    }}</strong>
                  }
                </article>
              }
            </section>
            <aside class="cart-summary">
              <h2>Resumen</h2>
              <div class="cart-total">
                <span>Total de productos</span>
                @if (!cart.loading() && !cart.error() && !cart.submission()) {
                  <strong>{{ money(cart.total()) }}</strong>
                } @else {
                  <span>{{
                    cart.submission() ? "Por recuperar" : "Por revisar"
                  }}</span>
                }
              </div>
              <p>
                Envíos en Córdoba capital. Costo y entrega a coordinar por
                WhatsApp.
              </p>
              <button
                class="cart-action whatsapp"
                (click)="cart.checkout()"
                [disabled]="
                  cart.loading() ||
                  cart.submitting() ||
                  (!!cart.error() && !cart.submission())
                "
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M20.52 3.48A11.85 11.85 0 0 0 12.04 0C5.46 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.95L0 24l6.26-1.64a11.9 11.9 0 0 0 5.77 1.47h.01C18.62 23.83 24 18.48 24 11.9c0-3.19-1.24-6.18-3.48-8.42ZM12.04 21.8a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.72.98 1-3.63-.24-.37a9.86 9.86 0 0 1-1.51-5.25C2.17 6.48 6.61 2.04 12.05 2.04c2.64 0 5.12 1.03 6.98 2.9a9.8 9.8 0 0 1 2.89 6.98c0 5.45-4.44 9.88-9.88 9.88Zm5.42-7.4c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.18-.3-.02-.46.13-.61.13-.13.3-.35.45-.53.15-.17.2-.3.3-.49.1-.2.05-.37-.02-.52-.08-.15-.68-1.62-.93-2.22-.24-.58-.49-.5-.67-.51h-.58c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.11 3.22 5.11 4.52.71.31 1.27.49 1.71.63.72.23 1.37.2 1.88.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z"
                  />
                </svg>
                {{
                  cart.submission()
                    ? "Volver a intentar pedido"
                    : "Continuar por WhatsApp"
                }}
              </button>
            </aside>
          </div>
        }
      }
    </main>
    <footer>GEVAFIT · Córdoba capital</footer>`,
})
export class StorefrontCartView {
  cart = inject(StorefrontCart);
  money(value: string) {
    const n = new Decimal(value),
      [whole, fraction] = n.toFixed(Math.max(2, n.decimalPlaces())).split(".");
    return "$ " + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + fraction;
  }
  changeQuantity(line: CartLine, event: Event) {
    const input = event.target as HTMLInputElement;
    if (!this.cart.quantity(line, input.value))
      input.value = String(line.quantity);
  }
}
