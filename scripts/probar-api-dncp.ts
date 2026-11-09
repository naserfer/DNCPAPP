/**
 * Fase 0 · Descubrimiento de la API v3 de la DNCP.
 *
 * Uso (Node >= 22.18, sin dependencias):
 *   node scripts/probar-api-dncp.ts
 *
 * Lee credenciales de .env, pide el access token (vence en 15 min), prueba
 * rutas candidatas, guarda muestras crudas en data/raw/ (ignorado por git)
 * y genera docs/campos-api.md con los campos hallados.
 * No imprime secretos.
 *
 * Rutas extra: DNCP_PROBE_PATHS="/datos/api/v3/doc/xxx,/datos/api/v3/doc/yyy"
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

const BASE = "https://contrataciones.gov.py";
const TOKEN_URL =
  process.env.DNCP_TOKEN_URL ?? `${BASE}/datos/api/oauth/token`;
const REQUEST_TOKEN = process.env.DNCP_REQUEST_TOKEN;
const KEY = process.env.DNCP_CUSTOMER_KEY;
const SECRET = process.env.DNCP_CUSTOMER_SECRET;

const requestToken =
  REQUEST_TOKEN ||
  (KEY && SECRET ? Buffer.from(`${KEY}:${SECRET}`).toString("base64") : "");
if (!requestToken) {
  console.error("Falta DNCP_REQUEST_TOKEN (o KEY y SECRET) en .env");
  process.exit(1);
}

const desde = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

// Rutas candidatas: la doc pública no las lista, hay que descubrirlas.
const CANDIDATAS = [
  "/datos/api/v3/doc/swagger.json",
  "/datos/api/v3/doc/",
  `/datos/api/v3/doc/search/processes?fecha_desde=${desde}`,
  `/datos/api/v3/doc/search/processes?fecha_release_desde=${desde}`,
  `/datos/api/v3/doc/ocds/releases?fecha_desde=${desde}`,
  `/datos/api/v3/doc/search/awards?fecha_desde=${desde}`,
  `/datos/api/v3/doc/search/suppliers`,
  ...(process.env.DNCP_PROBE_PATHS?.split(",").map((s) => s.trim()) ?? []),
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let token = "";
let tokenAt = 0;

async function obtenerToken() {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${requestToken}` },
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Token: HTTP ${res.status} ${txt.slice(0, 200)}`);
  let j: any;
  try { j = JSON.parse(txt); } catch { j = {}; }
  token = j.access_token ?? j.token ?? txt.trim();
  tokenAt = Date.now();
}

async function get(path: string) {
  if (!token || Date.now() - tokenAt > 12 * 60_000) await obtenerToken();
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const txt = await res.text();
  return { status: res.status, txt, ct: res.headers.get("content-type") ?? "" };
}

// Aplana un JSON a rutas de campos con un ejemplo de valor.
function aplanar(v: any, ruta = "", out = new Map<string, string>(), d = 0) {
  if (d > 8) return out;
  if (Array.isArray(v)) {
    for (const x of v.slice(0, 3)) aplanar(x, `${ruta}[]`, out, d + 1);
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) aplanar(x, ruta ? `${ruta}.${k}` : k, out, d + 1);
  } else if (!out.has(ruta)) {
    out.set(ruta, String(v).slice(0, 60));
  }
  return out;
}

mkdirSync("data/raw", { recursive: true });
mkdirSync("docs", { recursive: true });

const filas: string[] = [];
const campos: string[] = [];
let i = 0;

for (const p of CANDIDATAS) {
  i++;
  try {
    const t0 = Date.now();
    const r = await get(p);
    const ms = Date.now() - t0;
    filas.push(`| \`${p}\` | ${r.status} | ${r.ct.split(";")[0]} | ${r.txt.length} B | ${ms} ms |`);
    console.log(r.status, p);
    if (r.status === 200) {
      const archivo = `data/raw/${String(i).padStart(2, "0")}.json`;
      writeFileSync(archivo, r.txt);
      try {
        const m = aplanar(JSON.parse(r.txt));
        campos.push(`### \`${p}\`\n\nMuestra cruda: \`${archivo}\` (${m.size} campos)\n\n| Campo | Ejemplo |\n|---|---|\n` +
          [...m].slice(0, 150).map(([k, v]) => `| \`${k}\` | ${v.replace(/\|/g, "/")} |`).join("\n"));
      } catch { /* no era JSON */ }
    }
  } catch (e) {
    filas.push(`| \`${p}\` | error | ${(e as Error).message.slice(0, 80)} | | |`);
    console.log("error", p, (e as Error).message);
  }
  await sleep(4500); // < 15 llamadas/min
}

const md = `# Campos de la API v3 de la DNCP

Generado por \`scripts/probar-api-dncp.ts\` el ${new Date().toISOString()}.

## Rutas probadas

| Ruta | HTTP | Tipo | Tamaño | Latencia |
|---|---|---|---|---|
${filas.join("\n")}

## Campos encontrados

${campos.join("\n\n") || "_Ninguna ruta devolvió 200. Revisar Swagger en el portal y pasar rutas con DNCP_PROBE_PATHS._"}

## A completar a mano tras revisar las muestras

| Dato necesario | ¿Existe? Campo | Columna actual |
|---|---|---|
| Monto adjudicado | | adjudicaciones.monto |
| RUC del proveedor | | adjudicaciones.proveedor_ruc |
| Entidad convocante | | procesos.entidad_id |
| Número de oferentes | | adjudicaciones.num_oferentes |
| URL del llamado | | procesos.url_dncp |

## Estimación de almacenamiento (12 meses)

Completar con: nº de procesos/año × tamaño medio por fila (procesos ≈ 0,5 KB, adjudicaciones ≈ 0,3 KB, más índices ≈ ×2). Límite Supabase free: 500 MB.
`;
writeFileSync("docs/campos-api.md", md);
console.log("Listo: docs/campos-api.md");
