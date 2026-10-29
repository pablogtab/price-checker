import { Component, inject } from "@angular/core";
import { CurrencyPipe } from "@angular/common";
import { StorefrontCart, CartLine } from "./storefront-cart";
@Component({
  selector: "geva-storefront-cart",
  standalone: true,
  imports: [CurrencyPipe],
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
                  <h2>
                    {{
                      line.title ||
                        (line.kind === "promo" ? "Promo" : "Producto")
                    }}
                  </h2>
                  @for (label of line.labels || []; track $index) {
                    <p class="cart-label">{{ label }}</p>
                  }
                  @if (line.price) {
                    <p class="cart-unit">
                      {{
                        line.price
                          | currency
                            : "ARS"
                            : "symbol-narrow"
                            : "1.0-2"
                            : "es-AR"
                      }}
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
                      (change)="changeQuantity(line, $event)" /></label
                  ><button
                    class="remove"
                    (click)="cart.remove(line)"
                    [attr.aria-label]="'Quitar ' + (line.title || 'producto')"
                  >
                    Quitar
                  </button>
                </div>
                @if (line.subtotal && !cart.loading() && !cart.error()) {
                  <strong class="cart-subtotal">{{
                    line.subtotal
                      | currency: "ARS" : "symbol-narrow" : "1.0-2" : "es-AR"
                  }}</strong>
                }
              </article>
            }
          </section>
          <aside class="cart-summary">
            <h2>Resumen</h2>
            <div class="cart-total">
              <span>Total de productos</span>
              @if (!cart.loading() && !cart.error()) {
                <strong>{{
                  cart.total()
                    | currency: "ARS" : "symbol-narrow" : "1.0-2" : "es-AR"
                }}</strong>
              } @else {
                <span>Por revisar</span>
              }
            </div>
            <p>
              Envíos en Córdoba capital. Costo y entrega a coordinar por
              WhatsApp.
            </p>
            <button
              class="cart-action"
              (click)="cart.validate()"
              [disabled]="cart.loading()"
            >
              Actualizar importes
            </button>
          </aside>
        </div>
      }
    </main>
    <footer>GEVAFIT · Córdoba capital</footer>`,
})
export class StorefrontCartView {
  cart = inject(StorefrontCart);
  changeQuantity(line: CartLine, event: Event) {
    const input = event.target as HTMLInputElement;
    if (!this.cart.quantity(line, input.value))
      input.value = String(line.quantity);
  }
}
