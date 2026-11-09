const fecha = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short", year: "numeric" });

export function formatearMonto(monto: number | null | undefined, moneda = "PYG"): string {
  if (monto == null) return "—";
  if (moneda === "PYG") return "Gs. " + new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(monto);
  return new Intl.NumberFormat("es-PY", { style: "currency", currency: moneda }).format(monto);
}

export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : fecha.format(d);
}

/** Montos grandes legibles: "Gs. 8.400 millones", "Gs. 1,2 billones". */
export function formatearCompacto(monto: number | null | undefined): string {
  if (monto == null) return "—";
  const n = (v: number, d = 1) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: d }).format(v);
  if (monto >= 1e12) return `Gs. ${n(monto / 1e12)} billones`;
  if (monto >= 1e6) return `Gs. ${n(monto / 1e6, 0)} millones`;
  return formatearMonto(monto);
}
