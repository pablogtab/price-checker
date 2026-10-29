import "zone.js";
import { isDevMode, provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient } from "@angular/common/http";
import { AppComponent } from "./app";
import { StorefrontPrototype } from "./storefront-prototype";
bootstrapApplication(
  isDevMode() && location.pathname.startsWith("/prototype/storefront")
    ? StorefrontPrototype
    : AppComponent,
  {
    providers: [provideZoneChangeDetection(), provideHttpClient()],
  },
).catch(console.error);
