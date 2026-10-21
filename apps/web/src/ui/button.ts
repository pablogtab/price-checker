import { Directive, input } from "@angular/core";
/** Same button variants and focus treatment as the Gym backoffice. */
@Directive({
  selector: "button[appButton]",
  standalone: true,
  host: {
    class: "btn",
    "[class.btn-primary]": 'variant() === "primary"',
    "[class.btn-danger]": 'variant() === "danger"',
    "[class.btn-ghost]": 'variant() === "ghost"',
  },
})
export class ButtonDirective {
  readonly variant = input("secondary", { alias: "appButton" });
}
