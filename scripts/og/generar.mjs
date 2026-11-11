// Genera una imagen de vista previa (1200×630) por ficha, para WhatsApp y redes.
// Uso: node scripts/og/generar.mjs <carpeta de salida> [--demo]
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const SB = "https://egvcqupndjmuybiteioj.supabase.co/rest/v1/rpc/";
const KEY = "sb_publishable_eTEUJ7PXtDxPUBfIYCEcaQ_4EXctSzn"; // clave pública, protegida por RLS
const [salida = "og", modo] = process.argv.slice(2);
const POR_TIPO = 70;

const rpc = async (fn, args) => {
  const r = await fetch(SB + fn, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${fn}: ${r.status}`);
  return r.json();
};
const n = (v, d) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: d }).format(v);
const corto = (m) => (m >= 1e12 ? `Gs. ${n(m / 1e12, 1)} billones` : m >= 1e9 ? `Gs. ${n(m / 1e9, 1)} mil millones` : m >= 1e6 ? `Gs. ${n(m / 1e6, 0)} millones` : `Gs. ${n(m, 0)}`);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const lindo = (s) => {
  const base = s.includes(" / ") ? s.split(" / ").pop() : s;
  return base !== base.toUpperCase() ? base : base.toLowerCase()
    .replace(/(^|[\s(+.-])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|El|Y|E|En)\b/g, (m, w, i) => (i === 0 ? m : m.toLowerCase()))
    .replace(/\b(S\.?a\.?|S\.?r\.?l\.?|S\.?a\.?e\.?c\.?a\.?|E\.?a\.?s\.?)(?=\s|$)/g, (m) => m.toUpperCase());
};
export const archivo = (tipo, id) => `${tipo}-${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}.jpg`;

const fuente = readFileSync(new URL("../../apps/web/public/fonts/fraunces-600.woff2", import.meta.url)).toString("base64");
const exacto = (m) => `Gs. ${n(Math.round(m), 0)}`;
const tarjeta = ({ tipo, nombre, monto, cantidad, unidad, precio_min, precio_max, instituciones }) => {
  const nom = tipo === "producto" ? nombre.trim() : lindo(nombre);
  const tam = nom.length > 70 ? 50 : nom.length > 44 ? 60 : nom.length > 26 ? 72 : 88;
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:F;src:url(data:font/woff2;base64,${fuente}) format("woff2");font-weight:600}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#faf9f5;color:#111110;font-family:system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;padding:64px 72px;display:flex;flex-direction:column}
.e{font-size:24px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6b6a63}
h1{font-family:F,Georgia,serif;font-weight:600;font-size:${tam}px;line-height:1.04;letter-spacing:-.03em;margin-top:22px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;padding-bottom:.08em}
.m{margin-top:auto;font-size:36px;line-height:1.35}
.m b{font-family:F,Georgia,serif;font-size:60px;letter-spacing:-.02em;background:linear-gradient(transparent 55%,#ffd60a 55%,#ffd60a 94%,transparent 94%);padding:0 .12em;margin-left:-.12em}
.p{display:flex;justify-content:space-between;align-items:center;margin-top:36px;padding-top:26px;border-top:2px solid #111110;font-size:26px}
.l{display:flex;align-items:center;gap:14px;font-weight:700}
.l i{width:38px;height:38px;border-radius:9px;background:#111110;display:grid;place-items:center}
.l i::after{content:"";width:20px;height:7px;background:#ffd60a;border-radius:2px;box-shadow:0 -10px 0 #faf9f5}
.p span{color:#6b6a63}
.m.r b{font-size:${`${exacto(precio_min ?? 0)}${exacto(precio_max ?? 0)}`.length > 26 ? 44 : 56}px}
</style>${tipo === "producto" ? `<p class="e">¿Quién paga más por lo mismo?</p>
<h1>${esc(nom)}</h1>
<p class="m r">De ${exacto(precio_min)} a <b>${exacto(precio_max)}</b><br>por ${esc((unidad ?? "unidad").toLowerCase().replace(/(?<=[oa])s(?=\s|$)/g, ""))} · ${n(instituciones, 0)} instituciones · últimos 90 días</p>
<div class="p"><div class="l"><i></i>Contratos Abiertos</div><span>Datos abiertos de la DNCP</span></div>` : `<p class="e">${tipo === "proveedor" ? "Proveedor del Estado" : "Institución pública"}</p>
<h1>${esc(nom)}</h1>
<p class="m">${tipo === "proveedor" ? "Ganó" : "Adjudicó"} <b>${corto(Number(monto))}</b><br>en ${n(cantidad, 0)} ${tipo === "proveedor" ? (cantidad === 1 ? "adjudicación" : "adjudicaciones") : (cantidad === 1 ? "compra" : "compras")} · últimos 90 días</p>
<div class="p"><div class="l"><i></i>Contratos Abiertos</div><span>Datos abiertos de la DNCP</span></div>`}`;
};

const lista = modo === "--demo"
  ? [{ tipo: "entidad", id: "demo-1", nombre: "MINISTERIO DE SALUD PÚBLICA Y BIENESTAR SOCIAL", monto: 131.7e9, cantidad: 212 },
     { tipo: "proveedor", id: "80012345-6", nombre: "CONSTRUCTORA DEL ESTE S.A.", monto: 8.4e9, cantidad: 1 },
     { tipo: "producto", id: "50111510-001", nombre: "Carne vacuna en Res", unidad: "Kilogramos", precio_min: 31000, precio_max: 73170, instituciones: 3 },
     { tipo: "producto", id: "43211503-001", nombre: "Computadoras portátiles - Intermedia", unidad: "Unidad", precio_min: 4736055, precio_max: 8700000, instituciones: 4 },
     { tipo: "entidad", id: "demo-3", nombre: "Gobierno Departamental de Ñeembucú / Secretaría de Obras Públicas, Comunicaciones y Servicios Departamentales del Sur", monto: 43e6, cantidad: 7 }]
  : (await Promise.all(["entidad", "proveedor"].map(async (tipo) => (await rpc("ranking", { tipo, dias: 90, limite: POR_TIPO })).map((p) => ({ ...p, tipo }))))).flat()
      .concat((await rpc("comparables", { dias: 90, limite: 50 })).map((c) => ({ ...c, tipo: "producto", id: c.codigo })));

mkdirSync(salida, { recursive: true });
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 630 } });
for (const f of lista) {
  await pag.setContent(tarjeta(f));
  await pag.evaluate(() => document.fonts.ready);
  await pag.screenshot({ path: `${salida}/${archivo(f.tipo, f.id)}`, type: "jpeg", quality: 86 });
}
await nav.close();
console.log(`${lista.length} imágenes en ${salida}/`);
