/**
 * Ingesta DNCP → Supabase. Idempotente (upsert): se puede repetir sin duplicar.
 *
 *   node ingesta/ingestar.ts                 # incremental (desde la última corrida ok)
 *   DESDE=2026-01-01 node ingesta/ingestar.ts  # carga histórica día por día
 *
 * Variables: DNCP_REQUEST_TOKEN (o KEY+SECRET), DNCP_TOKEN_URL,
 *            SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { existsSync } from "node:fs";
import { extraerReleases, mapear, totalPaginas, type Fila } from "./ocds.ts";

if (existsSync(".env")) process.loadEnvFile(".env");

const env = (k: string) => {
  const v = process.env[k];
  if (!v) { console.error(`Falta ${k}`); process.exit(1); }
  return v;
};
const BASE = process.env.DNCP_BASE ?? "https://contrataciones.gov.py/datos/api/v3/doc";
const TOKEN_URL = process.env.DNCP_TOKEN_URL ?? "https://contrataciones.gov.py/datos/api/oauth/token";
const requestToken = process.env.DNCP_REQUEST_TOKEN ||
  Buffer.from(`${env("DNCP_CUSTOMER_KEY")}:${env("DNCP_CUSTOMER_SECRET")}`).toString("base64");
const SB = env("SUPABASE_URL").replace(/\/$/, "") + "/rest/v1";
const SB_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- DNCP ----------
let token = "", tokenAt = 0;
async function obtenerToken() {
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { Authorization: `Basic ${requestToken}` } });
  const txt = await res.text();
  if (!res.ok) throw new Error(`DNCP token: HTTP ${res.status}`);
  try { const j = JSON.parse(txt); token = j.access_token ?? j.token ?? txt.trim(); } catch { token = txt.trim(); }
  tokenAt = Date.now();
}
async function dncp(ruta: string, intento = 0): Promise<any> {
  if (!token || Date.now() - tokenAt > 12 * 60_000) await obtenerToken();
  const res = await fetch(BASE + ruta, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (res.status === 429 || res.status >= 500) {
    if (intento >= 5) throw new Error(`DNCP ${ruta}: HTTP ${res.status}`);
    await sleep(2 ** intento * 4000);
    return dncp(ruta, intento + 1);
  }
  if (res.status === 401 && intento < 2) { token = ""; return dncp(ruta, intento + 1); }
  if (!res.ok) throw new Error(`DNCP ${ruta}: HTTP ${res.status}`);
  return res.json();
}

// ---------- Supabase ----------
async function sb(ruta: string, init: RequestInit & { prefer?: string } = {}) {
  const res = await fetch(`${SB}/${ruta}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: init.prefer ?? "", ...init.headers },
  });
  if (!res.ok) throw new Error(`Supabase ${ruta}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}
async function upsert(tabla: string, filas: Fila[], clave: string) {
  const claves = clave.split(",");
  const unicas = [...new Map(filas.map((f) => [claves.map((c) => f[c]).join("|"), f])).values()];
  for (let i = 0; i < unicas.length; i += 500) {
    await sb(`${tabla}?on_conflict=${clave}`, { method: "POST", body: JSON.stringify(unicas.slice(i, i + 500)), prefer: "resolution=merge-duplicates,return=minimal" });
  }
  return unicas.length;
}

// ---------- Proceso ----------
const dia = (d: Date) => d.toISOString().slice(0, 10);

async function ingestarDia(desde: string, hasta: string): Promise<number> {
  let total = 0;
  for (let pagina = 1; ; pagina++) {
    const q = new URLSearchParams({ fecha_desde: desde, fecha_hasta: hasta, tipo_fecha: "fecha_release", page: String(pagina), items_per_page: "100" });
    const resp = await dncp(`/search/processes?${q}`);
    const releases = extraerReleases(resp);
    if (releases.length === 0) break;
    const m = mapear(releases);
    // orden por dependencias (claves foráneas)
    await upsert("entidades", m.entidades, "id");
    await upsert("proveedores", m.proveedores, "ruc");
    await upsert("procesos", m.procesos, "ocid");
    await upsert("adjudicaciones", m.adjudicaciones, "id");
    await upsert("versiones_proceso", m.versiones, "ocid,release_id");
    total += m.procesos.length;
    const tp = totalPaginas(resp);
    if (tp != null && pagina >= tp) break;
    await sleep(1200);
  }
  return total;
}

const [{ id }] = await sb("ingestas", { method: "POST", body: JSON.stringify({}), prefer: "return=representation" });
let registros = 0;
try {
  let desde: Date;
  if (process.env.DESDE) desde = new Date(process.env.DESDE);
  else {
    const ult = await sb("ingestas?estado=eq.ok&order=inicio.desc&limit=1&select=inicio");
    desde = ult?.[0] ? new Date(new Date(ult[0].inicio).getTime() - 24 * 3600_000) : new Date(Date.now() - 2 * 24 * 3600_000);
  }
  const fin = new Date();
  for (let d = new Date(dia(desde)); d <= fin; d = new Date(d.getTime() + 24 * 3600_000)) {
    const s = dia(d);
    const n = await ingestarDia(s, s);
    registros += n;
    console.log(s, n, "procesos");
  }
  await sb(`ingestas?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ estado: "ok", fin: new Date().toISOString(), registros }) });
  console.log("Listo:", registros);
} catch (e) {
  await sb(`ingestas?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ estado: "error", fin: new Date().toISOString(), registros, detalle: (e as Error).message.slice(0, 500) }) }).catch(() => {});
  console.error((e as Error).message);
  process.exit(1);
}
