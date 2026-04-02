import "zone.js";
import { provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient } from "@angular/common/http";
import { AppComponent } from "./app";
bootstrapApplication(AppComponent, {
  providers: [provideZoneChangeDetection(), provideHttpClient()],
}).catch(console.error);
