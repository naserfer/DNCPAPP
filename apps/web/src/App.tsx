import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, modoDemo, type Adjudicacion, type Compra, type FichaEntidad, type Opcion, type Periodo, type Resultado, type Resumen } from "./lib/api";
import { enSalarios, entero, formatearFecha, formatearMonto, montoCorto, nombreLindo } from "./lib/format";

// ---------- Rutas (History API) ----------
const SITIO = "https://contratos-abiertos.pages.dev";
const ruta = {
  buscar: (q: string) => `/buscar/${encodeURIComponent(q)}`,
  proveedor: (ruc: string) => `/proveedor/${encodeURIComponent(ruc)}`,
  entidad: (id: string) => `/entidad/${encodeURIComponent(id)}`,
};

function ir(destino: string) {
  history.pushState(null, "", destino);
  dispatchEvent(new PopStateEvent("popstate"));
  scrollTo(0, 0);
}

function useRuta() {
  const [r, setR] = useState(() => {
    // enlaces viejos con #/ siguen funcionando
    if (location.hash.startsWith("#/")) history.replaceState(null, "", location.hash.slice(1));
    return location.pathname;
  });
  useEffect(() => {
    const cambio = () => setR(location.pathname);
    const clic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a");
      if (!a || a.target || a.origin !== location.origin || !a.getAttribute("href")?.startsWith("/")) return;
      e.preventDefault();
      if (a.pathname !== location.pathname) ir(a.pathname);
    };
    addEventListener("popstate", cambio);
    document.addEventListener("click", clic);
    return () => { removeEventListener("popstate", cambio); document.removeEventListener("click", clic); };
  }, []);
  return r;
}

function useCarga<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [estado, setEstado] = useState<{ cargando: boolean; datos?: T; error?: boolean }>({ cargando: true });
  useEffect(() => {
    let vivo = true;
    setEstado({ cargando: true });
    fn().then((datos) => vivo && setEstado({ cargando: false, datos }))
        .catch(() => vivo && setEstado({ cargando: false, error: true }));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return estado;
}

function useTitulo(t?: string | null) {
  useEffect(() => { document.title = t ? `${t} · Contratos Abiertos` : "Contratos Abiertos · En qué gasta el Estado paraguayo"; }, [t]);
}

// ---------- Preferencias locales ----------
const guardado = {
  leer<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } },
  poner(k: string, v: unknown) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin storage */ } },
};

function useFijada() {
  const [f, setF] = useState<Opcion | null>(() => guardado.leer<Opcion>("fijada"));
  return [f, (v: Opcion | null) => { guardado.poner("fijada", v); setF(v); }] as const;
}

// ---------- Piezas ----------
function Estado({ cargando, error, vacio, textoVacio, children }: { cargando: boolean; error?: boolean; vacio?: boolean; textoVacio?: string; children: ReactNode }) {
  if (cargando) return <div className="esqueleto" role="status" aria-label="Cargando"><span /><span /><span /></div>;
  if (error) return <p className="aviso" role="alert">No pudimos cargar los datos. Probá de nuevo en un momento.</p>;
  if (vacio) return <p className="aviso">{textoVacio ?? "Todavía no hay datos para mostrar acá."}</p>;
  return <>{children}</>;
}

const SUGERENCIAS = ["IPS", "ANDE", "Petropar", "Ministerio de Salud", "Municipalidad de Asunción", "Obras Públicas", "Educación", "Policía"];

function Buscador({ inicial = "", grande = false }: { inicial?: string; grande?: boolean }) {
  const [q, setQ] = useState(inicial);
  useEffect(() => setQ(inicial), [inicial]);
  const enviar = (e: FormEvent) => { e.preventDefault(); if (q.trim()) ir(ruta.buscar(q.trim())); };
  return (
    <form onSubmit={enviar} role="search" className={"buscador" + (grande ? " grande" : "")}>
      <label htmlFor="q" className="sr-only">Buscar institución, empresa o RUC</label>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscá una institución, empresa o RUC" autoComplete="off" enterKeyHint="search" />
      <button type="submit" className="btn primario">Buscar</button>
    </form>
  );
}

// En el celular wa.me abre la app con el selector de contactos. En computadora la app de
// escritorio ignora el texto si no hay número, así que se usa WhatsApp Web.
function enlaceWhatsApp(mensaje: string) {
  const movil = matchMedia("(pointer: coarse)").matches && innerWidth < 900;
  const t = encodeURIComponent(mensaje);
  return movil ? `https://wa.me/?text=${t}` : `https://web.whatsapp.com/send?text=${t}`;
}

function Compartir({ texto, camino }: { texto: string; camino: string }) {
  const [copiado, setCopiado] = useState(false);
  const enlace = SITIO + camino;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(enlace); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* sin permiso */ }
  };
  return (
    <div className="compartir">
      <a className="btn whatsapp" href={enlaceWhatsApp(`${texto}\n${enlace}`)} target="_blank" rel="noopener noreferrer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.7-5.1A8.5 8.5 0 1 1 21 11.5Z" /></svg>
        Compartir por WhatsApp
      </a>
      <button type="button" className="btn" onClick={copiar}>{copiado ? "¡Copiado!" : "Copiar enlace"}</button>
    </div>
  );
}

function Oferentes({ c }: { c: Pick<Compra, "num_oferentes" | "convenio_marco"> }) {
  if (c.convenio_marco) return <span className="pastilla suave">Convenio marco</span>;
  if (c.num_oferentes == null) return null;
  if (c.num_oferentes === 1) return <span className="pastilla alerta">1 solo oferente</span>;
  return <span className="pastilla suave">{c.num_oferentes} oferentes</span>;
}

function TarjetaCompra({ c, destacada = false }: { c: Compra; destacada?: boolean }) {
  return (
    <article className={"tarjeta" + (destacada ? " destacada" : "")}>
      <p className="monto">{destacada ? montoCorto(c.monto) : formatearMonto(c.monto)}</p>
      {destacada && c.monto != null && enSalarios(c.monto) && <p className="equivale">Equivale a {enSalarios(c.monto)}.</p>}
      <h3>{c.titulo ?? "Compra sin descripción"}</h3>
      <p className="quien">
        {c.entidad_id && <a href={ruta.entidad(c.entidad_id)}>{c.entidad_nombre}</a>}
        {c.entidad_id && c.proveedor_ruc !== undefined && <span aria-hidden="true"> → </span>}
        {c.proveedor_ruc ? <a href={ruta.proveedor(c.proveedor_ruc)}>{nombreLindo(c.proveedor_nombre)}</a> : c.proveedor_ruc === null ? "Proveedor sin dato" : null}
      </p>
      <p className="pie-tarjeta">
        <span>{formatearFecha(c.fecha)}</span>
        <Oferentes c={c} />
        {c.url_dncp && <a className="externo" href={c.url_dncp} target="_blank" rel="noopener noreferrer">Ver en la DNCP ↗</a>}
      </p>
    </article>
  );
}

type ItemRanking = { k: string; href: string; nombre: string; monto: number; detalle: string };

function Ranking({ titulo, items }: { titulo: string; items: ItemRanking[] }) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.monto), 1);
  return (
    <div className="ranking">
      <h3 className="sub">{titulo}</h3>
      <ol>
        {items.map((i, n) => (
          <li key={i.k}>
            <a href={i.href}>
              <span className="puesto">{n + 1}</span>
              <span className="cuerpo">
                <span className="nombre">{i.nombre}</span>
                <span className="barra" aria-hidden="true"><span style={{ width: `${Math.max((i.monto / max) * 100, 2)}%` }} /></span>
                <span className="meta">{i.detalle}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

const veces = (n: number, uno: string, varios: string) => `${entero(n)} ${n === 1 ? uno : varios}`;

// ---------- Portada ----------
function Inicio() {
  useTitulo(null);
  const [dias, setDias] = useState(7);
  const { cargando, datos: p, error } = useCarga<Periodo>(() => api.periodo(dias), [dias]);
  const estrella = p?.mayores[0];
  const lapso = dias === 7 ? "Esta semana" : "En los últimos 30 días";
  const pct = p && p.con_dato_oferentes > 0 ? Math.round((p.un_solo_oferente / p.con_dato_oferentes) * 100) : null;

  return (
    <>
      <section className="hero">
        <div className="lapso" role="group" aria-label="Período">
          <button type="button" aria-pressed={dias === 7} onClick={() => setDias(7)}>7 días</button>
          <button type="button" aria-pressed={dias === 30} onClick={() => setDias(30)}>30 días</button>
        </div>
        <p className="antetitulo">{lapso} el Estado paraguayo adjudicó</p>
        <h1 className="cifra">{p ? <mark>{montoCorto(p.monto_total)}</mark> : <span className="fantasma">Gs. 0.000 millones</span>}</h1>
        {p && (
          <p className="bajada">
            {enSalarios(p.monto_total) && <>Eso equivale a <strong>{enSalarios(p.monto_total)}</strong>. </>}
            Fueron {veces(p.adjudicaciones, "adjudicación", "adjudicaciones")} de {veces(p.instituciones, "institución", "instituciones")} a {veces(p.proveedores, "proveedor", "proveedores")}.
          </p>
        )}
        <Buscador grande />
        <ul className="chips" aria-label="Búsquedas sugeridas">
          {SUGERENCIAS.map((s) => <li key={s}><a href={ruta.buscar(s)}>{s}</a></li>)}
        </ul>
      </section>

      <Estado cargando={cargando} error={error} vacio={!!p && p.adjudicaciones === 0} textoVacio="Todavía no hay adjudicaciones cargadas en este período.">
        {p && (
          <>
            {estrella && (
              <section className="bloque" aria-labelledby="t-estrella">
                <h2 id="t-estrella"><span className="num">01</span> La compra más grande</h2>
                <TarjetaCompra c={estrella} destacada />
                <Compartir camino={estrella.entidad_id ? ruta.entidad(estrella.entidad_id) : "/"}
                  texto={`${estrella.entidad_nombre ?? "El Estado"} adjudicó ${montoCorto(estrella.monto)} a ${nombreLindo(estrella.proveedor_nombre) || "un proveedor"}: ${estrella.titulo ?? "compra pública"}.`} />
              </section>
            )}

            {p.un_oferente.length > 0 && (
              <section className="bloque" aria-labelledby="t-uno">
                <h2 id="t-uno"><span className="num">02</span> Se presentó uno solo</h2>
                <p className="intro">
                  {pct != null && <>En <strong>{pct} %</strong> de los procesos con dato hubo un único oferente ({p.un_solo_oferente} de {p.con_dato_oferentes}), por {montoCorto(p.monto_un_oferente)}. </>}
                  Que haya un solo oferente no implica una irregularidad: es un dato para mirar con atención.
                </p>
                <div className="lista-tarjetas">{p.un_oferente.map((c, i) => <TarjetaCompra key={i} c={c} />)}</div>
              </section>
            )}

            <section className="bloque" aria-labelledby="t-quien">
              <h2 id="t-quien"><span className="num">03</span> Quién compró y quién vendió</h2>
              <div className="rankings">
                <Ranking titulo="Instituciones que más adjudicaron" items={p.top_entidades.map((e) => ({
                  k: e.id, href: ruta.entidad(e.id), nombre: e.nombre, monto: e.monto,
                  detalle: `${montoCorto(e.monto)} · ${veces(e.cantidad, "adjudicación", "adjudicaciones")}` }))} />
                <Ranking titulo="Proveedores que más ganaron" items={p.top_proveedores.map((e) => ({
                  k: e.ruc, href: ruta.proveedor(e.ruc), nombre: nombreLindo(e.nombre), monto: e.monto,
                  detalle: `${montoCorto(e.monto)} · ${veces(e.cantidad, "adjudicación", "adjudicaciones")}` }))} />
              </div>
            </section>

            {p.mayores.length > 1 && (
              <section className="bloque" aria-labelledby="t-mas">
                <h2 id="t-mas"><span className="num">04</span> Otras compras grandes</h2>
                <div className="lista-tarjetas">{p.mayores.slice(1).map((c, i) => <TarjetaCompra key={i} c={c} />)}</div>
              </section>
            )}
          </>
        )}
      </Estado>

      <MiInstitucion />
      {p?.actualizado && <p className="nota">Datos actualizados al {formatearFecha(p.actualizado)}. Los montos en otras monedas no se suman.</p>}
    </>
  );
}

function MiInstitucion() {
  const [fijada, setFijada] = useFijada();
  const munis = useCarga<Opcion[]>(() => (fijada ? Promise.resolve([]) : api.municipalidades()), [fijada?.id]);
  const ficha = useCarga<FichaEntidad>(() => (fijada ? api.fichaEntidad(fijada.id) : Promise.resolve(null)), [fijada?.id]);
  const f = ficha.datos;

  return (
    <section className="bloque mia" aria-labelledby="t-mia">
      <h2 id="t-mia"><span className="num">05</span> {fijada ? "Tu institución" : "¿Y tu municipalidad?"}</h2>
      {!fijada ? (
        <>
          <p className="intro">Elegí tu ciudad y mirá qué compró, a quién y por cuánto. Queda guardada en este dispositivo.</p>
          <label htmlFor="muni" className="sr-only">Municipalidad</label>
          <select id="muni" className="selector" value="" disabled={!munis.datos?.length}
            onChange={(e) => { const m = munis.datos?.find((x) => x.id === e.target.value); if (m) setFijada(m); }}>
            <option value="">{munis.cargando ? "Cargando municipalidades…" : "Elegí tu municipalidad"}</option>
            {munis.datos?.map((m) => <option key={m.id} value={m.id}>{m.nombre.replace(/^Municipalidad de /i, "")}</option>)}
          </select>
        </>
      ) : (
        <Estado cargando={ficha.cargando} error={ficha.error}>
          <div className="tarjeta destacada">
            <h3 className="grande"><a href={ruta.entidad(fijada.id)}>{fijada.nombre}</a></h3>
            {f && f.adjudicaciones > 0 ? (
              <>
                <p className="monto">{montoCorto(f.monto_total)}</p>
                <p className="equivale">adjudicados en los últimos 12 meses, en {veces(f.adjudicaciones, "compra", "compras")} a {veces(f.proveedores, "proveedor", "proveedores")}.</p>
              </>
            ) : <p className="equivale">Todavía no tenemos adjudicaciones cargadas de esta institución.</p>}
            <p className="pie-tarjeta">
              <a className="btn primario" href={ruta.entidad(fijada.id)}>Ver sus compras</a>
              <button type="button" className="btn" onClick={() => setFijada(null)}>Cambiar</button>
            </p>
          </div>
        </Estado>
      )}
    </section>
  );
}

// ---------- Búsqueda ----------
function Busqueda({ q }: { q: string }) {
  useTitulo(`Buscar “${q}”`);
  const { cargando, datos, error } = useCarga(() => api.buscar(q), [q]);
  return (
    <section className="pagina">
      <Buscador inicial={q} />
      <h1 className="titulo-pagina">Resultados para “{q}”</h1>
      <Estado cargando={cargando} error={error} vacio={datos?.length === 0}
        textoVacio="No encontramos nada con ese nombre. Probá con otra palabra, con la sigla (IPS, ANDE) o con el RUC.">
        <ul className="resultados">
          {datos?.map((r: Resultado) => (
            <li key={r.tipo + r.id}>
              <a href={r.tipo === "proveedor" ? ruta.proveedor(r.id) : ruta.entidad(r.id)}>
                <span className="etiqueta">{r.tipo === "proveedor" ? "Proveedor" : "Institución"}</span>
                <span className="nombre">{r.tipo === "proveedor" ? nombreLindo(r.nombre) : r.nombre}</span>
                {r.tipo === "proveedor" && <span className="meta">RUC {r.id}</span>}
                <span className="flecha" aria-hidden="true">→</span>
              </a>
            </li>
          ))}
        </ul>
      </Estado>
      {datos?.length === 0 && <ul className="chips">{SUGERENCIAS.map((s) => <li key={s}><a href={ruta.buscar(s)}>{s}</a></li>)}</ul>}
    </section>
  );
}

// ---------- Ficha de proveedor ----------
function Proveedor({ ruc }: { ruc: string }) {
  const resumen = useCarga<Resumen | null>(() => api.resumenProveedor(ruc), [ruc]);
  const adjs = useCarga<Adjudicacion[]>(() => api.adjudicacionesProveedor(ruc), [ruc]);
  const r = resumen.datos;
  const nombre = nombreLindo(r?.nombre);
  useTitulo(r ? nombre : "Proveedor");
  return (
    <section className="pagina">
      <a href="/" className="volver">← Inicio</a>
      <Estado cargando={resumen.cargando} error={resumen.error} vacio={!resumen.cargando && !r} textoVacio="No encontramos un proveedor con ese RUC.">
        {r && (
          <>
            <p className="etiqueta">Proveedor del Estado · RUC {r.ruc}</p>
            <h1 className="titulo-ficha">{nombre}</h1>
            <p className="resumen-ficha">
              Ganó <mark>{montoCorto(r.monto_pyg_12m)}</mark> en {veces(r.adjudicaciones_12m, "adjudicación", "adjudicaciones")} durante los últimos 12 meses.
              {r.ultima_adjudicacion && <> La última fue el {formatearFecha(r.ultima_adjudicacion)}.</>}
            </p>
            <Compartir camino={ruta.proveedor(r.ruc)} texto={`${nombre} ganó ${montoCorto(r.monto_pyg_12m)} en contratos con el Estado en los últimos 12 meses.`} />
          </>
        )}
      </Estado>
      {r && (
        <>
          <h2 className="sub">Sus adjudicaciones</h2>
          <Estado cargando={adjs.cargando} error={adjs.error} vacio={adjs.datos?.length === 0}>
            <div className="lista-tarjetas">
              {adjs.datos?.map((a) => {
                const quien = a.comprador ?? a.procesos?.entidades ?? null;
                return <TarjetaCompra key={a.id} c={{
                  titulo: a.convenio_marco ? a.detalle ?? a.procesos?.titulo ?? null : a.procesos?.titulo ?? null,
                  monto: a.monto, fecha: a.fecha, num_oferentes: a.num_oferentes, convenio_marco: a.convenio_marco,
                  url_dncp: a.procesos?.url_dncp ?? null, entidad_id: quien?.id, entidad_nombre: quien?.nombre }} />;
              })}
            </div>
          </Estado>
        </>
      )}
    </section>
  );
}

// ---------- Ficha de institución ----------
function Entidad({ id }: { id: string }) {
  const { cargando, datos: f, error } = useCarga<FichaEntidad>(() => api.fichaEntidad(id), [id]);
  const [fijada, setFijada] = useFijada();
  useTitulo(f?.nombre ?? "Institución");
  const pct = f && f.con_dato_oferentes > 0 ? Math.round((f.un_solo_oferente / f.con_dato_oferentes) * 100) : null;
  return (
    <section className="pagina">
      <a href="/" className="volver">← Inicio</a>
      <Estado cargando={cargando} error={error} vacio={!cargando && !f} textoVacio="No encontramos esa institución.">
        {f && (
          <>
            <p className="etiqueta">Institución pública</p>
            <h1 className="titulo-ficha">{f.nombre}</h1>
            {f.adjudicaciones > 0 ? (
              <p className="resumen-ficha">
                Adjudicó <mark>{montoCorto(f.monto_total)}</mark> en {veces(f.adjudicaciones, "compra", "compras")} a {veces(f.proveedores, "proveedor", "proveedores")} durante los últimos 12 meses.
                {enSalarios(f.monto_total) && <> Equivale a {enSalarios(f.monto_total)}.</>}
                {pct != null && <> En {pct} % de los procesos con dato se presentó un solo oferente.</>}
              </p>
            ) : <p className="resumen-ficha">Todavía no tenemos adjudicaciones cargadas de esta institución en los últimos 12 meses.</p>}
            <div className="acciones">
              <Compartir camino={ruta.entidad(f.id)} texto={`${f.nombre} adjudicó ${montoCorto(f.monto_total)} en ${veces(f.adjudicaciones, "compra", "compras")} en los últimos 12 meses.`} />
              <button type="button" className="btn" aria-pressed={fijada?.id === f.id}
                onClick={() => setFijada(fijada?.id === f.id ? null : { id: f.id, nombre: f.nombre })}>
                {fijada?.id === f.id ? "★ Fijada en tu inicio" : "☆ Fijar en mi inicio"}
              </button>
            </div>

            <Ranking titulo="A quién le compró más" items={f.top_proveedores.map((p) => ({
              k: p.ruc, href: ruta.proveedor(p.ruc), nombre: nombreLindo(p.nombre), monto: p.monto,
              detalle: `${montoCorto(p.monto)} · ${veces(p.cantidad, "adjudicación", "adjudicaciones")}` }))} />

            {f.recientes.length > 0 && (
              <>
                <h2 className="sub">Compras recientes</h2>
                <div className="lista-tarjetas">{f.recientes.map((c, i) => <TarjetaCompra key={i} c={c} />)}</div>
              </>
            )}
          </>
        )}
      </Estado>
    </section>
  );
}

// ---------- Marco ----------
function alternarTema() {
  const oscuro = document.documentElement.classList.toggle("dark");
  guardado.poner("tema", oscuro ? "oscuro" : "claro");
}

export default function App() {
  const camino = useRuta();
  const [, seg, ...resto] = camino.split("/");
  let arg = resto.join("/");
  try { arg = decodeURIComponent(arg); } catch { /* se usa tal cual */ }
  let vista: ReactNode = <Inicio />;
  if (seg === "buscar" && arg) vista = <Busqueda q={arg} />;
  else if (seg === "proveedor" && arg) vista = <Proveedor ruc={arg} />;
  else if (seg === "entidad" && arg) vista = <Entidad id={arg} />;

  return (
    <>
      <a href="#contenido" className="skip" target="_self">Saltar al contenido</a>
      <header className="barra-sup">
        <a href="/" className="logo" aria-label="Contratos Abiertos, inicio">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor" /><rect x="7" y="17" width="18" height="7" rx="1.5" className="logo-marca" /><path d="M9 11h14" stroke="var(--bg)" strokeWidth="2.6" strokeLinecap="round" /></svg>
          <span>Contratos <mark>Abiertos</mark></span>
        </a>
        <button className="tema" onClick={alternarTema} aria-label="Cambiar entre modo claro y oscuro" title="Modo claro / oscuro">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></svg>
        </button>
      </header>
      {modoDemo && <p className="demo" role="note">Modo demostración: los datos que ves son ficticios.</p>}
      <main id="contenido">{vista}</main>
      <footer className="pie">
        <p>Datos abiertos de la Dirección Nacional de Contrataciones Públicas (DNCP), licencia CC BY 4.0. Sitio independiente, sin vínculo con la DNCP.</p>
        <p>Mostramos la información tal como la publica la DNCP, sin juicios de valor. La versión oficial está en el enlace de cada compra. El equivalente en salarios mínimos usa Gs. 3.044.000 (vigente desde julio de 2026).</p>
        <p className="firma">Hecho por <a href="https://ardentium.tech/?utm_source=contratos-abiertos&utm_medium=referral&utm_campaign=pie" target="_blank" rel="noopener">Ardentium</a></p>
      </footer>
    </>
  );
}
