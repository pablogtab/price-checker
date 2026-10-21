/**
 * Íconos del backoffice, como trazos SVG de 24×24.
 *
 * Van inline y no como dependencia: son un puñado de glifos y una librería de iconos
 * entera para eso no se justifica. Se dibujan con `currentColor`, así que
 * heredan el color del estado (normal, hover, activo).
 */
export type Icon = readonly string[];

export const ICONS = {
  branches: [
    "M3 21h18",
    "M5 21V3h14v18",
    "M9 7h1",
    "M14 7h1",
    "M9 11h1",
    "M14 11h1",
    "M10 21v-6h4v6",
  ],
  /** Dashboard: grilla de tarjetas. */
  dashboard: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],

  /** Check-in: socio validado. */
  checkIn: [
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M2 21a7 7 0 0 1 14 0",
    "M16 11l2.2 2.2L22 9",
  ],

  /** Caja: billete. */
  cash: [
    "M3 6.5h18v11H3z",
    "M12 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z",
    "M6.5 12h.01",
    "M17.5 12h.01",
  ],

  /** Cobros: tarjeta de pago. */
  payments: ["M2.5 5.5h19v13h-19z", "M2.5 9.5h19", "M6 14.5h4"],

  /** Buscar: lupa. */
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M21 21l-4.8-4.8"],

  /** Socios: varias personas. */
  members: [
    "M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M1.5 21a7 7 0 0 1 14 0",
    "M17 3.6a4 4 0 0 1 0 7.8",
    "M22.5 21a6 6 0 0 0-3.8-5.6",
  ],

  /** Planes: etiqueta con precio. */
  plans: [
    "M20.6 12.9 12.9 20.6a2 2 0 0 1-2.8 0L3.4 13.9a2 2 0 0 1-.6-1.6l.5-6.4a2 2 0 0 1 1.8-1.8l6.4-.5a2 2 0 0 1 1.6.6l6.7 6.7a2 2 0 0 1 0 2.8z",
    "M8 8h.01",
  ],

  /** Productos: caja. */
  products: [
    "M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z",
    "M3.5 7.5 12 12l8.5-4.5",
    "M12 12v9",
  ],

  /** Rutinas: planilla con renglones. */
  routines: ["M6 3.5h12v17H6z", "M9 8h6", "M9 12h6", "M9 16h3"],

  /** Ejercicios: mancuerna. */
  exercises: [
    "M6.5 7v10",
    "M17.5 7v10",
    "M3.5 9.5v5",
    "M20.5 9.5v5",
    "M6.5 12h11",
  ],

  /** Equipamiento: llave. */
  equipment: [
    "M14.7 6.3a4 4 0 0 0-5.4 5.1L3.5 17.2a1.8 1.8 0 0 0 2.5 2.6l5.9-5.8a4 4 0 0 0 5.1-5.4l-2.5 2.5-2.1-.6-.6-2.1z",
  ],

  /** Consumo de IA: medidor. */
  aiUsage: ["M4 18a8 8 0 1 1 16 0", "M12 18l4-6", "M12 18h.01"],

  /** Empleados: credencial. */
  staff: [
    "M3 5.5h18v13H3z",
    "M9 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    "M6 16a3.4 3.4 0 0 1 6 0",
    "M15 10h4",
    "M15 13.5h4",
  ],

  /** Salir. */
  logout: [
    "M10 21H5.5A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3H10",
    "M16.5 16.5 21 12l-4.5-4.5",
    "M21 12H9.5",
  ],

  /** Sucursal. */
  branch: [
    "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z",
    "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  ],
};
