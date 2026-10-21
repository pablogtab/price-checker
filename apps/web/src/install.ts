import { ButtonDirective } from "./ui/button";
import { Component, HostListener } from "@angular/core";
@Component({
  selector: "app-install",
  standalone: true,
  imports: [ButtonDirective],
  template: ` <section class="card">
    <h2>Instalar app</h2>
    <p>Abrí la app desde un icono en tu teléfono o computadora.</p>
    @if (installed) {
      <p>La app está abierta en modo instalado.</p>
    } @else if (promptEvent) {
      <button appButton="primary" (click)="install()">Instalar app</button>
    } @else {
      <p>
        En Android o Chrome: menú → Instalar app. En iPhone: Compartir → Agregar
        a inicio. En Safari para Mac: Archivo → Agregar al Dock.
      </p>
    }
    <small
      >Necesitás conexión para consultar datos y registrar operaciones.</small
    >
  </section>`,
})
export class InstallComponent {
  promptEvent: any = null;
  installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    !!(navigator as any).standalone;
  @HostListener("window:beforeinstallprompt", ["$event"]) onPrompt(event: any) {
    event.preventDefault();
    this.promptEvent = event;
  }
  @HostListener("window:appinstalled") onInstalled() {
    this.installed = true;
    this.promptEvent = null;
  }
  async install() {
    const event = this.promptEvent;
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    this.promptEvent = null;
  }
}
