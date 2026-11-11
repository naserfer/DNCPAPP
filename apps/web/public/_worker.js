// Vista previa por ficha (título y descripción para WhatsApp, X, Facebook).
// Todo lo demás se sirve tal cual desde los archivos estáticos.
const SB = "https://egvcqupndjmuybiteioj.supabase.co/rest/v1/";
const KEY = "sb_publishable_eTEUJ7PXtDxPUBfIYCEcaQ_4EXctSzn"; // clave pública, protegida por RLS

const corto = (m) => {
  const n = (v, d) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: d }).format(v);
  if (m >= 1e12) return `Gs. ${n(m / 1e12, 1)} billones`;
  if (m >= 1e9) return `Gs. ${n(m / 1e9, 1)} mil millones`;
  if (m >= 1e6) return `Gs. ${n(m / 1e6, 0)} millones`;
  return `Gs. ${n(m, 0)}`;
};

async function datos(ruta, init) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch(SB + ruta, { ...init, signal: ctrl.signal, headers: { apikey: KEY, "Content-Type": "application/json" } });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

const fecha = (iso) => new Intl.DateTimeFormat("es-PY", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Asuncion" }).format(new Date(iso));
const rpc = (fn, args) => datos("rpc/" + fn, { method: "POST", body: JSON.stringify(args) });

const exacto = (m) => `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(m))}`;
async function metaProducto(codigo) {
  const p = await rpc("producto", { p_codigo: codigo, dias: 90 });
  if (!p || !p.nombre || !p.instituciones?.length) return null;
  const u = (p.unidad || "unidad").toLowerCase().replace(/(?<=[oa])s(?=\s|$)/g, ""), n = p.instituciones.length;
  return {
    titulo: `${p.nombre}: cuánto pagó cada institución · Contratos Abiertos`,
    desc: n > 1
      ? `${n} instituciones públicas lo compraron y pagaron entre ${exacto(p.precio_min)} y ${exacto(p.precio_max)} por ${u}. Mirá quién pagó cuánto.`
      : `El Estado paraguayo lo compró a ${exacto(p.precio_max)} por ${u}.`,
  };
}

async function meta(tipo, id) {
  if (tipo === "producto") return metaProducto(id);
  const f = tipo === "proveedor" ? await rpc("ficha_proveedor", { p_ruc: id }) : await rpc("ficha_entidad", { p_id: id });
  if (!f || !f.nombre) return null;
  const n = f.adjudicaciones;
  const nombre = f.nombre === f.nombre.toUpperCase()
    ? f.nombre.toLowerCase().replace(/(^|[\s(+])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(S\.?a\.?|S\.?r\.?l\.?|S\.?a\.?e\.?c\.?a\.?|E\.?a\.?s\.?)(?=\s|$)/g, (m) => m.toUpperCase())
    : f.nombre;
  return {
    titulo: `${nombre} · Contratos Abiertos`,
    desc: n > 0
      ? (tipo === "proveedor"
          ? `Ganó ${corto(Number(f.monto_total))} en ${n} ${n === 1 ? "adjudicación" : "adjudicaciones"} del Estado paraguayo desde el ${fecha(f.desde)}.`
          : `Adjudicó ${corto(Number(f.monto_total))} en ${n} ${n === 1 ? "compra" : "compras"} a ${f.proveedores} ${f.proveedores === 1 ? "proveedor" : "proveedores"} desde el ${fecha(f.desde)}.`)
      : "Mirá sus compras públicas con datos abiertos de la DNCP.",
  };
}

// Imagen de vista previa por ficha: se generan a diario (ver .github/workflows/vistas-previas.yml).
// Si una ficha todavía no tiene la suya, se usa la imagen general.
const IMAGENES = "https://github.com/naserfer/DNCPAPP/releases/download/og/";
async function imagen(tipo, id, url, request, env) {
  const general = () => env.ASSETS.fetch(new Request(new URL("/og.png", url), request));
  try {
    const r = await fetch(`${IMAGENES}${tipo}-${id.replace(/[^A-Za-z0-9_-]/g, "_")}.jpg`, { cf: { cacheTtl: 21600, cacheEverything: true } });
    if (!r.ok) return general();
    return new Response(r.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=21600", "X-Content-Type-Options": "nosniff" } });
  } catch { return general(); }
}

// Caché de consultas públicas: segundos que se guarda cada respuesta.
const API = { resumen_semanal: 300, ranking: 300, rubros: 600, rubro: 600, producto: 600, comparables: 900, ficha_entidad: 300, ficha_proveedor: 300, estado_datos: 120, buscar: 600, buscar_productos: 600 };
async function api(fn, url, ctx) {
  const json = (cuerpo, estado, cache) => new Response(cuerpo, { status: estado, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" } });
  const a = url.searchParams.get("a") ?? "{}";
  if (!(fn in API) || a.length > 300) return json('{"error":"no encontrado"}', 404, "no-store");
  try { if (typeof JSON.parse(a) !== "object") throw 0; } catch { return json('{"error":"consulta inválida"}', 400, "no-store"); }
  const clave = new Request(`${url.origin}/api/${fn}?a=${encodeURIComponent(a)}`);
  const guardada = await caches.default.match(clave);
  if (guardada) return guardada;
  const r = await fetch(SB + "rpc/" + fn, { method: "POST", body: a, headers: { apikey: KEY, "Content-Type": "application/json" } });
  if (!r.ok) return json('{"error":"sin datos"}', 502, "no-store");
  const resp = json(await r.text(), 200, `public, max-age=60, s-maxage=${API[fn]}`);
  ctx.waitUntil(caches.default.put(clave, resp.clone()));
  return resp;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ap = url.pathname.match(/^\/api\/([a-z_]+)$/);
    if (ap && request.method === "GET") return api(ap[1], url, ctx);
    const og = url.pathname.match(/^\/og\/(proveedor|entidad|producto)\/([^/]+)\.jpg$/);
    if (og && request.method === "GET") return imagen(og[1], decodeURIComponent(og[2]), url, request, env);
    const m = url.pathname.match(/^\/(proveedor|entidad|producto)\/([^/]+)\/?$/);
    if (!m || request.method !== "GET") return env.ASSETS.fetch(request);

    const pagina = await env.ASSETS.fetch(new Request(new URL("/", url), request));
    let info = null;
    try { info = await meta(m[1], decodeURIComponent(m[2])); } catch { /* se sirve la página sin personalizar */ }
    if (!info) return pagina;

    const poner = (valor) => ({ element(e) { e.setAttribute("content", valor); } });
    return new HTMLRewriter()
      .on("title", { element(e) { e.setInnerContent(info.titulo); } })
      .on('meta[property="og:title"]', poner(info.titulo))
      .on('meta[property="og:description"]', poner(info.desc))
      .on('meta[name="description"]', poner(info.desc))
      .on('meta[property="og:image"]', poner(`${url.origin}/og/${m[1]}/${m[2]}.jpg`))
      .on('meta[name="twitter:image"]', poner(`${url.origin}/og/${m[1]}/${m[2]}.jpg`))
      .transform(pagina);
  },
};
