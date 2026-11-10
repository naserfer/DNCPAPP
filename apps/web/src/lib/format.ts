const fFecha = new Intl.DateTimeFormat("es-PY", { day: "numeric", month: "short", year: "numeric" });
const num = (v: number, d = 0) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: d }).format(v);

/** Salario mínimo legal vigente desde el 1 de julio de 2026 (Decreto N.º 6225/2026). */
export const SALARIO_MINIMO = 3_044_000;

export const entero = (v: number) => num(v);

export function formatearMonto(monto: number | null | undefined, moneda = "PYG"): string {
  if (monto == null) return "—";
  if (moneda === "PYG") return "Gs. " + num(monto);
  return new Intl.NumberFormat("es-PY", { style: "currency", currency: moneda }).format(monto);
}

/** Montos legibles: "Gs. 365 millones", "Gs. 18,5 mil millones", "Gs. 1,2 billones". */
export function montoCorto(monto: number | null | undefined): string {
  if (monto == null) return "—";
  if (monto >= 1e12) return `Gs. ${num(monto / 1e12, 1)} billones`;
  if (monto >= 1e9) return `Gs. ${num(monto / 1e9, 1)} mil millones`;
  if (monto >= 1e6) return `Gs. ${num(monto / 1e6, monto < 1e7 ? 1 : 0)} millones`;
  return formatearMonto(monto);
}

export function enSalarios(monto: number): string | null {
  const n = Math.round(monto / SALARIO_MINIMO);
  return n >= 2 ? `${num(n)} salarios mínimos` : null;
}

export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : fFecha.format(d);
}

const MINUS = new Set(["de", "del", "la", "las", "los", "y", "e", "en", "para", "por", "a", "el"]);
const SIGLA = /^(s\.?a\.?|s\.?r\.?l\.?|s\.?a\.?e\.?c\.?a\.?|s\.?a\.?c\.?i\.?|e\.?a\.?s\.?|e\.?i\.?r\.?l\.?|ltda\.?|py|ii|iii|iv)$/i;

/** "CONSULTORA ALTO PARAGUAY SOCIEDAD ANONIMA" → "Consultora Alto Paraguay Sociedad Anonima". Solo toca nombres en mayúsculas. */
export function nombreLindo(s: string | null | undefined): string {
  if (!s) return "";
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().split(/(\s+|\+|\(|\))/).map((w, i) =>
    SIGLA.test(w) ? w.toUpperCase() : i > 0 && MINUS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join("");
}
