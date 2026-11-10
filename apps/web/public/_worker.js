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

async function meta(tipo, id) {
  const f = tipo === "proveedor" ? await rpc("ficha_proveedor", { p_ruc: id }) : await rpc("ficha_entidad", { p_id: id });
  if (!f || !f.nombre) return null;
  const verbo = tipo === "proveedor" ? "Ganó" : "Adjudicó";
  return {
    titulo: `${f.nombre} · Contratos Abiertos`,
    desc: f.adjudicaciones > 0
      ? `${verbo} ${corto(Number(f.monto_total))} en ${f.adjudicaciones} ${f.adjudicaciones === 1 ? "adjudicación" : "adjudicaciones"} con el Estado paraguayo desde el ${fecha(f.desde)}.`
      : "Mirá sus compras públicas con datos abiertos de la DNCP.",
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/(proveedor|entidad)\/([^/]+)\/?$/);
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
      .transform(pagina);
  },
};
