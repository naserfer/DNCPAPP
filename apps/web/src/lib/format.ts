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

const fDia = new Intl.DateTimeFormat("es-PY", { day: "numeric", month: "short" });
export const diaCorto = (iso: string) => fDia.format(new Date(iso.length === 10 ? iso + "T12:00:00" : iso));

/** "Rectorado / Universidad Nacional del Este" → "Universidad Nacional del Este (Rectorado)". */
export function nombreEntidad(s: string | null | undefined): string {
  if (!s) return "";
  const partes = s.split(" / ").map((x) => x.trim()).filter(Boolean);
  if (partes.length !== 2) return s;
  if (partes[0].toLowerCase() === partes[1].toLowerCase()) return partes[1];
  return `${partes[1]} (${nombreLindo(partes[0].toUpperCase())})`;
}

const RUIDO = /^(plurianual|ad referendum.*|\d+\s*[°ºª]?\s*llamado|segundo llamado|tercer llamado|sbe|con id.*)$/i;
const CODIGO = /^(LPN|LPI|LCO|CD|CVE|MCN|SBEN|SBE|CO|LP|CE)\s*(SBE\s*)?(N[°ºro.]*\s*)?[\d/.-]+\s*[-–:.]?\s*/i;

/** Quita jerga administrativa y mayúsculas sostenidas del título de un llamado. */
const SIGLAS_COMUNES = ["IPS", "ANDE", "MEC", "MOPC", "MSPBS", "UNA", "PGN", "DNCP", "MITIC", "MADES", "SEDECO", "SENATUR", "ONAMP", "DNIT", "INC", "ESSAP", "COPACO", "PETROPAR", "BCP", "BNF", "MDI", "MJ", "MRE", "MAG", "MIC", "INDERT", "SENAD", "SEN", "DINAC", "CONATEL", "LPN", "SBE", "TIER", "III", "II", "IV", "MG", "ML", "KG", "UOC", "N°"];

export function tituloLimpio(t: string | null | undefined, contexto?: string | null): string {
  if (!t) return "Compra sin descripción";
  let s = t.replace(/^Compra por convenio marco:\s*/i, "").replace(CODIGO, "").replace(/["“”]/g, "").trim();
  s = s.split(/\s+[-–]\s+/).filter((seg, i) => i === 0 || !RUIDO.test(seg.trim())).join(" – ");
  s = s.replace(/\s+/g, " ").replace(/[.\s]+$/, "");
  if (s.length > 12 && s === s.toUpperCase()) {
    const siglas = new Set([...SIGLAS_COMUNES, ...(contexto?.match(/\(([A-ZÁÉÍÓÚÑ.]{2,12})\)/g) ?? []).map((x) => x.slice(1, -1))]);
    s = s.toLowerCase().replace(/[a-záéíóúñ.]+/g, (w) => (siglas.has(w.toUpperCase()) ? w.toUpperCase() : w));
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }
  return s || "Compra sin descripción";
}

export function haceCuanto(desde: number): string {
  const h = Math.round((Date.now() - desde) / 36e5);
  if (h < 24) return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}
