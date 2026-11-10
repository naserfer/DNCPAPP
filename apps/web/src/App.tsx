import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, modoDemo, type Comparable, type Compra, type EstadoDatos, type FichaProducto, type FichaRubro, type Rubro, type FichaEntidad, type FichaProveedor, type Novedades, type Opcion, type Periodo, type Puesto, type Resultado } from "./lib/api";
import { nombreRubro } from "./lib/rubros";
import { SALARIO_MINIMO, diaCorto, enSalarios, entero, formatearFecha, formatearMonto, haceCuanto, montoCorto, montoEnUnidadDe, nombreEntidad, nombreLindo, tituloLimpio } from "./lib/format";

// ---------- Rutas (History API) ----------
const SITIO = "https://contratos-abiertos.pages.dev";
const ruta = {
  buscar: (q: string) => `/buscar/${encodeURIComponent(q)}`,
  proveedor: (ruc: string) => `/proveedor/${encodeURIComponent(ruc)}`,
  entidad: (id: string) => `/entidad/${encodeURIComponent(id)}`,
  rubro: (id: string) => `/rubro/${encodeURIComponent(id)}`,
  producto: (codigo: string) => `/producto/${encodeURIComponent(codigo)}`,
};

function ir(destino: string) {
  history.pushState(null, "", destino);
  dispatchEvent(new PopStateEvent("popstate"));
  scrollTo(0, 0);
}

function useRuta() {
  const [r, setR] = useState(() => {
    if (location.hash.startsWith("#/")) history.replaceState(null, "", location.hash.slice(1)); // enlaces viejos
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
    setEstado((e) => ({ ...e, cargando: true, error: false }));
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

// ---------- Preferencias locales (solo en este dispositivo) ----------
const guardado = {
  leer<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } },
  poner(k: string, v: unknown) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin storage */ } },
};

function useFijada() {
  const [f, setF] = useState<Opcion | null>(() => guardado.leer<Opcion>("fijada"));
  return [f, (v: Opcion | null) => { guardado.poner("fijada", v); setF(v); }] as const;
}

/** Momento de la visita anterior (si fue hace más de 6 horas). Se actualiza una vez por sesión. */
let visitaAnterior: number | null | undefined;
function leerVisitaAnterior(): number | null {
  if (visitaAnterior !== undefined) return visitaAnterior;
  const previa = guardado.leer<number>("visita");
  visitaAnterior = previa && Date.now() - previa > 6 * 36e5 ? previa : null;
  guardado.poner("visita", Date.now());
  return visitaAnterior;
}

/** Cuenta desde el valor anterior hasta `objetivo` (desde 0 la primera vez). Respeta "reducir movimiento". */
function useContador(objetivo: number | undefined, ms = 900): number {
  const [v, setV] = useState(0);
  const desde = useRef(0);
  useEffect(() => {
    if (objetivo == null) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { desde.current = objetivo; setV(objetivo); return; }
    const inicio = desde.current, t0 = performance.now();
    let cuadro = 0;
    const paso = (t: number) => {
      const k = Math.min((t - t0) / ms, 1), suave = 1 - Math.pow(1 - k, 3);
      const actual = inicio + (objetivo - inicio) * suave;
      desde.current = actual; setV(actual);
      if (k < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [objetivo, ms]);
  return v;
}

const veces = (n: number, uno: string, varios: string) => `${entero(n)} ${n === 1 ? uno : varios}`;

// ---------- Piezas ----------
function Estado({ cargando, error, vacio, textoVacio, children }: { cargando: boolean; error?: boolean; vacio?: boolean; textoVacio?: string; children: ReactNode }) {
  if (error) return <p className="aviso" role="alert">No pudimos cargar los datos. Revisá tu conexión y probá de nuevo.</p>;
  if (vacio) return <p className="aviso">{textoVacio ?? "Todavía no hay datos para mostrar acá."}</p>;
  if (cargando && !children) return <div className="esqueleto" role="status" aria-label="Cargando"><span /><span /></div>;
  return <div className={cargando ? "refrescando" : undefined}>{children}</div>;
}

const SUGERENCIAS = ["IPS", "ANDE", "Petropar", "Ministerio de Salud", "Municipalidad de Asunción", "Obras Públicas", "Educación", "Policía"];

function Buscador({ inicial = "" }: { inicial?: string }) {
  const [q, setQ] = useState(inicial);
  useEffect(() => setQ(inicial), [inicial]);
  const enviar = (e: FormEvent) => { e.preventDefault(); if (q.trim()) ir(ruta.buscar(q.trim())); };
  return (
    <form onSubmit={enviar} role="search" className="buscador">
      <label htmlFor="q" className="sr-only">Buscar institución, empresa, producto o RUC</label>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Institución, empresa, producto o RUC" autoComplete="off" enterKeyHint="search" />
      <button type="submit" className="btn primario">Buscar</button>
    </form>
  );
}

function Chips() {
  return <ul className="chips" aria-label="Búsquedas sugeridas">{SUGERENCIAS.map((s) => <li key={s}><a href={ruta.buscar(s)}>{s}</a></li>)}</ul>;
}

// Compartir: primero el menú nativo del dispositivo (ahí se elige WhatsApp y el contacto, y funciona
// igual en celular y computadora). Si el navegador no lo tiene, se abre WhatsApp con el mensaje.
function Compartir({ texto, camino }: { texto: string; camino: string }) {
  const [copiado, setCopiado] = useState(false);
  const mensaje = `${texto}\n${SITIO + camino}`;
  const compartir = async () => {
    if (typeof navigator.share === "function") {
      try { await navigator.share({ text: mensaje }); return; }
      catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    // Sin menú nativo (por ejemplo, navegadores dentro de otras apps): en el celular, el esquema
    // whatsapp:// abre el selector de chats con el mensaje; wa.me sin número no lo hace en iPhone.
    const t = encodeURIComponent(mensaje);
    if (matchMedia("(pointer: coarse)").matches) location.href = `whatsapp://send?text=${t}`;
    else window.open(`https://web.whatsapp.com/send?text=${t}`, "_blank", "noopener");
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(mensaje); setCopiado(true); setTimeout(() => setCopiado(false), 2200); } catch { /* sin permiso */ }
  };
  return (
    <div className="compartir">
      <button type="button" className="btn oscuro" onClick={compartir}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M12 15V4" /><path d="M8 8l4-4 4 4" /></svg>
        Compartir
      </button>
      <button type="button" className="btn" onClick={copiar} aria-live="polite">{copiado ? "¡Copiado! Pegalo donde quieras" : "Copiar mensaje"}</button>
    </div>
  );
}

function Titulo({ texto, contexto }: { texto: string | null; contexto?: string | null }) {
  const limpio = tituloLimpio(texto, contexto);
  const [abierto, setAbierto] = useState(false);
  const largo = limpio.length > 120;
  return (
    <h3 className="titulo-compra">
      {largo && !abierto ? limpio.slice(0, 110).replace(/\s+\S*$/, "") + "… " : limpio + " "}
      {largo && <button type="button" className="vermas" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>{abierto ? "ver menos" : "ver más"}</button>}
    </h3>
  );
}

function Pastillas({ c }: { c: Compra }) {
  return (
    <>
      {c.num_oferentes === 1 && !c.convenio_marco && <span className="pastilla alerta">1 solo oferente</span>}
      {c.num_oferentes != null && c.num_oferentes > 1 && !c.convenio_marco && <span className="pastilla">{c.num_oferentes} oferentes</span>}
      {c.convenio_marco && <span className="pastilla">Convenio marco</span>}
      {(c.compras ?? 1) > 1 && <span className="pastilla">{c.compras} compras</span>}
    </>
  );
}

function TarjetaCompra({ c, destacada = false, rotulo }: { c: Compra; destacada?: boolean; rotulo?: string }) {
  return (
    <article className={"tarjeta" + (destacada ? " destacada" : "")}>
      {rotulo && <p className="rotulo">{rotulo}</p>}
      <p className="monto" title={formatearMonto(c.monto)}>{montoCorto(c.monto)}</p>
      {destacada && c.monto != null && enSalarios(c.monto) && <p className="equivale">Equivale a {enSalarios(c.monto)}.</p>}
      <Titulo texto={c.titulo} contexto={c.entidad_nombre} />
      <p className="quien">
        {c.entidad_id && <a href={ruta.entidad(c.entidad_id)}>{nombreEntidad(c.entidad_nombre)}</a>}
        {c.entidad_id && c.proveedor_ruc !== undefined && <span aria-hidden="true"> → </span>}
        {c.proveedor_ruc ? <a href={ruta.proveedor(c.proveedor_ruc)}>{nombreLindo(c.proveedor_nombre)}</a> : c.proveedor_ruc === null ? "Proveedor sin dato" : null}
      </p>
      <p className="pie-tarjeta">
        <span>{formatearFecha(c.fecha)}</span>
        <Pastillas c={c} />
        {c.url_dncp && <a className="externo" href={c.url_dncp} target="_blank" rel="noopener noreferrer">Ver en la DNCP <span aria-hidden="true">↗</span></a>}
      </p>
    </article>
  );
}

type ItemRanking = { k: string; href: string; nombre: string; monto: number; detalle: string };

function Ranking({ titulo, items }: { titulo?: string; items: ItemRanking[] }) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.monto), 1);
  return (
    <div className="ranking">
      {titulo && <h3 className="sub">{titulo}</h3>}
      <ol>
        {items.map((i, n) => (
          <li key={i.k}>
            <a href={i.href}>
              <span className="puesto" aria-hidden="true">{n + 1}</span>
              <span className="cuerpo">
                <span className="nombre">{i.nombre}</span>
                <span className="barra" aria-hidden="true"><span style={{ width: `${Math.max((i.monto / max) * 100, 2)}%`, animationDelay: `${n * 70}ms` }} /></span>
                <span className="meta">{i.detalle}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Barras simples. `resaltar` = cuántas barras del final van en color fuerte. */
function Barras({ datos, resaltar, descripcion }: { datos: { etiqueta: string; monto: number }[]; resaltar?: number; descripcion: string }) {
  const max = Math.max(...datos.map((d) => d.monto), 1);
  const corte = datos.length - (resaltar ?? datos.length);
  return (
    <figure className="barras">
      <div className="lienzo" role="img" aria-label={descripcion}>
        {datos.map((d, i) => (
          <span key={d.etiqueta + i} className={i >= corte ? "fuerte" : ""} title={`${d.etiqueta}: ${montoCorto(d.monto)}`}
            style={{ animationDelay: `${Math.min(i * 28, 700)}ms`, height: `${d.monto > 0 ? Math.max(Math.sqrt(d.monto / max) * 100, 5) : 1.5}%` }} />
        ))}
      </div>
      <figcaption><span>{datos[0]?.etiqueta}</span><span className="escala">escala comprimida para que se vean los días chicos</span><span>{datos[datos.length - 1]?.etiqueta}</span></figcaption>
    </figure>
  );
}

function aRanking(p: Puesto[], tipo: "entidad" | "proveedor"): ItemRanking[] {
  return p.map((e) => ({
    k: e.id, href: tipo === "entidad" ? ruta.entidad(e.id) : ruta.proveedor(e.id),
    nombre: tipo === "entidad" ? nombreEntidad(e.nombre) : nombreLindo(e.nombre), monto: e.monto,
    detalle: `${montoCorto(e.monto)} · ${veces(e.cantidad, "adjudicación", "adjudicaciones")}` + (e.un_oferente ? ` · ${e.un_oferente} con un solo oferente` : ""),
  }));
}

// ---------- Portada ----------
function Inicio() {
  useTitulo(null);
  const [dias, setDias] = useState(7);
  const [fijada, setFijada] = useFijada();
  const { cargando, datos: p, error } = useCarga<Periodo>(() => api.periodo(dias), [dias]);
  const previa = leerVisitaAnterior();
  const nuevas = useCarga<Novedades | null>(() => (previa ? api.novedades(previa) : Promise.resolve(null)), [previa]);

  const lapso = dias === 7 ? "Esta semana" : "En los últimos 30 días";
  const anterior = dias === 7 ? "la semana anterior" : "los 30 días anteriores";
  const cambio = p && p.anterior_completo && p.monto_anterior > 0 ? Math.round(((p.monto_total - p.monto_anterior) / p.monto_anterior) * 100) : null;
  const pct = p && p.con_dato_oferentes >= 5 ? Math.round((p.un_solo_oferente / p.con_dato_oferentes) * 100) : null;
  const estrella = p?.mayores[0];
  const uno = p?.un_oferente.find((c) => c.titulo !== estrella?.titulo) ?? null;
  const otras = p?.mayores.filter((c) => c !== estrella && c.titulo !== uno?.titulo).slice(0, 2) ?? [];
  const serie = p?.serie.slice(-Math.min(p.serie.length, dias * 2)) ?? [];
  const total = useContador(p?.monto_total);

  return (
    <>
      <section className="hero">
        <p className="antetitulo">{lapso} el Estado paraguayo adjudicó</p>
        <h1 className="cifra" aria-label={p ? montoCorto(p.monto_total) : undefined}>
          {p ? <mark aria-hidden="true">{montoEnUnidadDe(total, p.monto_total)}</mark> : <span className="fantasma">Gs. 0,0 mil millones</span>}
        </h1>
        {p && (
          <p className="bajada entra">
            {enSalarios(p.monto_total) && <>Equivale a <strong>{entero(Math.round(total / SALARIO_MINIMO))} salarios mínimos</strong>. </>}
            Fueron {veces(p.adjudicaciones, "adjudicación", "adjudicaciones")} de {veces(p.instituciones, "institución", "instituciones")} a {veces(p.proveedores, "proveedor", "proveedores")}.
            {cambio != null && <> <span className="cambio">{cambio >= 0 ? "▲" : "▼"} {Math.abs(cambio)} % {cambio >= 0 ? "más" : "menos"} que {anterior}</span>.</>}
          </p>
        )}
        {serie.length > 3 && (
          <Barras resaltar={dias} datos={serie.map((d) => ({ etiqueta: diaCorto(d.dia), monto: d.monto }))}
            descripcion={`Monto adjudicado por día. En color fuerte, ${dias === 7 ? "los últimos 7 días" : "los últimos 30 días"}.`} />
        )}
        <div className="lapso" role="group" aria-label="Período">
          <button type="button" aria-pressed={dias === 7} onClick={() => setDias(7)}>7 días</button>
          <button type="button" aria-pressed={dias === 30} onClick={() => setDias(30)}>30 días</button>
        </div>
        {previa && nuevas.datos && nuevas.datos.adjudicaciones > 0 && (
          <p className="novedad" role="status">
            <strong>Desde tu última visita</strong> ({haceCuanto(previa)}): {veces(nuevas.datos.adjudicaciones, "adjudicación nueva", "adjudicaciones nuevas")} por {montoCorto(nuevas.datos.monto)}.
          </p>
        )}
        <Buscador />
        <Chips />
      </section>

      {fijada && <MiInstitucion fijada={fijada} cambiar={() => setFijada(null)} previa={previa} />}

      <Estado cargando={cargando} error={error} vacio={!!p && p.adjudicaciones === 0} textoVacio="Todavía no hay adjudicaciones cargadas en este período.">
        {p && p.adjudicaciones > 0 && (
          <>
            <section className="bloque" aria-labelledby="t-historias">
              <h2 id="t-historias">Lo más llamativo</h2>
              <div className="lista-tarjetas">
                {estrella && <TarjetaCompra c={estrella} destacada rotulo="La compra más grande" />}
                {uno && <TarjetaCompra c={uno} rotulo="La mayor con un solo oferente" />}
                {otras.map((c, i) => <TarjetaCompra key={i} c={c} />)}
              </div>
              {pct != null && (
                <p className="dato-suelto">
                  En <mark>{pct} %</mark> de las licitaciones con dato se presentó un solo oferente ({p.un_solo_oferente} de {p.con_dato_oferentes}).
                  <span> No implica una irregularidad: es un dato para mirar con atención.</span>
                </p>
              )}
              <Compartir camino="/" texto={`${lapso} el Estado paraguayo adjudicó ${montoCorto(p.monto_total)}${enSalarios(p.monto_total) ? `, el equivalente a ${enSalarios(p.monto_total)}` : ""}. Mirá a quién le compró:`} />
            </section>

            <section className="bloque" aria-labelledby="t-quien">
              <h2 id="t-quien">Quién compró y quién vendió</h2>
              <div className="rankings">
                <Ranking titulo="Instituciones" items={aRanking(p.top_entidades.slice(0, 3), "entidad")} />
                <Ranking titulo="Proveedores" items={aRanking(p.top_proveedores.slice(0, 3).map((x) => ({ ...x, id: x.ruc })), "proveedor")} />
              </div>
              <p className="mas"><a className="btn" href="/ranking">Ver el ranking completo →</a></p>
            </section>
          </>
        )}
      </Estado>

      <Comparables limite={3} titulo="¿Quién paga más por lo mismo?" />
      {!fijada && <ElegirMunicipalidad elegir={setFijada} />}
      <BotonTelegram />
    </>
  );
}

function MiInstitucion({ fijada, cambiar, previa }: { fijada: Opcion; cambiar: () => void; previa: number | null }) {
  const ficha = useCarga<FichaEntidad>(() => api.fichaEntidad(fijada.id), [fijada.id]);
  const nuevas = useCarga<Novedades | null>(() => (previa ? api.novedades(previa, fijada.id) : Promise.resolve(null)), [fijada.id, previa]);
  const f = ficha.datos;
  return (
    <section className="bloque mia" aria-labelledby="t-mia">
      <h2 id="t-mia">Tu institución</h2>
      <div className="tarjeta destacada">
        <h3 className="grande"><a href={ruta.entidad(fijada.id)}>{nombreEntidad(fijada.nombre)}</a></h3>
        {ficha.cargando && !f ? <p className="equivale">Cargando…</p> : f && f.adjudicaciones > 0 ? (
          <>
            <p className="monto">{montoCorto(f.monto_total)}</p>
            <p className="equivale">adjudicados desde el {formatearFecha(f.desde)}, en {veces(f.adjudicaciones, "compra", "compras")} a {veces(f.proveedores, "proveedor", "proveedores")}.</p>
          </>
        ) : <p className="equivale">Todavía no registramos adjudicaciones de esta institución.</p>}
        {previa && nuevas.datos && (
          <p className="novedad">{nuevas.datos.adjudicaciones > 0
            ? <><strong>Nuevo desde tu última visita:</strong> {veces(nuevas.datos.adjudicaciones, "adjudicación", "adjudicaciones")} por {montoCorto(nuevas.datos.monto)}.</>
            : <>Sin adjudicaciones nuevas desde tu última visita ({haceCuanto(previa)}).</>}</p>
        )}
        <p className="pie-tarjeta">
          <a className="btn primario" href={ruta.entidad(fijada.id)}>Ver sus compras</a>
          <button type="button" className="btn" onClick={cambiar}>Cambiar</button>
        </p>
      </div>
    </section>
  );
}

function ElegirMunicipalidad({ elegir }: { elegir: (o: Opcion) => void }) {
  const munis = useCarga<Opcion[]>(() => api.municipalidades(), []);
  return (
    <section className="bloque mia" aria-labelledby="t-muni">
      <h2 id="t-muni">¿Y tu municipalidad?</h2>
      <p className="intro">Elegí tu ciudad y la próxima vez que entres vas a ver primero qué compró, a quién y por cuánto. Se guarda solo en este dispositivo.</p>
      <label htmlFor="muni" className="sr-only">Municipalidad</label>
      <select id="muni" className="selector" value="" disabled={!munis.datos?.length}
        onChange={(e) => { const m = munis.datos?.find((x) => x.id === e.target.value); if (m) { elegir(m); scrollTo(0, 0); } }}>
        <option value="">{munis.cargando ? "Cargando municipalidades…" : munis.error ? "No pudimos cargar la lista" : "Elegí tu municipalidad"}</option>
        {munis.datos?.map((m) => <option key={m.id} value={m.id}>{m.nombre.replace(/^Municipalidad de /i, "")}</option>)}
      </select>
      <p className="meta">¿Otra institución? Buscala y tocá “Fijar en mi inicio”.</p>
    </section>
  );
}

// ---------- Ranking ----------
function PaginaRanking() {
  useTitulo("Ranking");
  const [tipo, setTipo] = useState<"entidad" | "proveedor">("entidad");
  const [dias, setDias] = useState(30);
  const { cargando, datos, error } = useCarga<Puesto[]>(() => api.ranking(tipo, dias), [tipo, dias]);
  return (
    <section className="pagina">
      <a href="/" className="volver">← Inicio</a>
      <p className="etiqueta">Ranking</p>
      <h1 className="titulo-ficha">{tipo === "entidad" ? "Quién adjudicó más" : "Quién ganó más"}</h1>
      <p className="resumen-ficha">Las 20 {tipo === "entidad" ? "instituciones que más adjudicaron" : "empresas y personas que más ganaron"}, por monto en guaraníes.</p>
      <div className="filtros">
        <div className="lapso" role="group" aria-label="Qué mirar">
          <button type="button" aria-pressed={tipo === "entidad"} onClick={() => setTipo("entidad")}>Instituciones</button>
          <button type="button" aria-pressed={tipo === "proveedor"} onClick={() => setTipo("proveedor")}>Proveedores</button>
        </div>
        <div className="lapso" role="group" aria-label="Período">
          {[7, 30, 90].map((d) => <button key={d} type="button" aria-pressed={dias === d} onClick={() => setDias(d)}>{d} días</button>)}
        </div>
      </div>
      <Estado cargando={cargando} error={error} vacio={datos?.length === 0}>
        {datos && <Ranking items={aRanking(datos, tipo)} />}
      </Estado>
      <NotaDatos />
    </section>
  );
}

function NotaDatos() {
  const { datos: e } = useCarga<EstadoDatos>(() => api.estado(), []);
  if (!e) return null;
  return (
    <p className="nota">
      Datos completos desde el {formatearFecha(e.desde)}{e.actualizado && <>, actualizados al {formatearFecha(e.actualizado)}</>}.
      {e.cargando && " Seguimos cargando y corrigiendo registros anteriores; algunas cifras pueden cambiar."}
    </p>
  );
}

// ---------- Rubros y precios ----------
const veces2 = (max: number | null, min: number | null) => (max && min && min > 0 ? max / min : null);
const nVeces = (v: number) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 }).format(v);

function TarjetaComparable({ c }: { c: Comparable }) {
  const v = veces2(c.precio_max, c.precio_min);
  return (
    <a className="tarjeta comparable" href={ruta.producto(c.codigo)}>
      <h3>{nombreLindo(c.nombre.toUpperCase())}</h3>
      <p className="rango"><span>{formatearMonto(Math.round(c.precio_min))}</span><span className="hasta" aria-hidden="true">→</span><span>{formatearMonto(Math.round(c.precio_max))}</span></p>
      <p className="meta">por {(c.unidad ?? "unidad").toLowerCase()} · {veces(c.instituciones, "institución", "instituciones")}{v ? <> · <strong>{nVeces(v)} veces</strong> entre la que menos y la que más pagó</> : null}</p>
    </a>
  );
}

function Comparables({ limite, titulo }: { limite: number; titulo: string }) {
  // Solo bienes: en servicios y obras (códigos 70 en adelante) cada contrato es distinto y el precio unitario no es comparable.
  const { datos: todos } = useCarga<Comparable[]>(() => api.comparables(limite * 5), [limite]);
  const datos = todos?.filter((c) => c.codigo < "70").slice(0, limite);
  if (!datos?.length) return null;
  return (
    <section className="bloque" aria-labelledby="t-precios">
      <h2 id="t-precios">{titulo}</h2>
      <p className="intro">El mismo producto del catálogo, comprado por instituciones distintas. La marca, la calidad, la cantidad y el flete pueden explicar parte de la diferencia.</p>
      <div className="lista-tarjetas">{datos.map((c) => <TarjetaComparable key={c.codigo} c={c} />)}</div>
      {limite <= 3 && <p className="mas"><a className="btn" href="/rubros">Ver más precios y rubros →</a></p>}
    </section>
  );
}

function PaginaRubros() {
  useTitulo("Rubros y precios");
  const [dias, setDias] = useState(30);
  const { cargando, datos, error } = useCarga<Rubro[]>(() => api.rubros(dias), [dias]);
  return (
    <section className="pagina">
      <a href="/" className="volver">← Inicio</a>
      <p className="etiqueta">Rubros</p>
      <h1 className="titulo-ficha">En qué se gasta</h1>
      <p className="resumen-ficha">Las compras agrupadas por rubro del catálogo oficial. Tocá uno para ver qué se compró, quién y a quién.</p>
      <div className="filtros">
        <div className="lapso" role="group" aria-label="Período">
          {[30, 90].map((d) => <button key={d} type="button" aria-pressed={dias === d} onClick={() => setDias(d)}>{d} días</button>)}
        </div>
      </div>
      <Estado cargando={cargando} error={error} vacio={datos?.length === 0} textoVacio="Todavía estamos cargando el detalle de productos. Volvé en unas horas.">
        {datos && <Ranking items={datos.slice(0, 25).map((r) => ({ k: r.id, href: ruta.rubro(r.id), nombre: nombreRubro(r.id), monto: r.monto,
          detalle: `${montoCorto(r.monto)} · ${veces(r.productos, "producto", "productos")} · ${veces(r.instituciones, "institución", "instituciones")}` }))} />}
      </Estado>
      <Comparables limite={12} titulo="¿Quién paga más por lo mismo?" />
      <NotaDatos />
    </section>
  );
}

function PaginaRubro({ id }: { id: string }) {
  const nombre = nombreRubro(id);
  useTitulo(nombre);
  const [dias, setDias] = useState(30);
  const { cargando, datos: r, error } = useCarga<FichaRubro>(() => api.rubro(id, dias), [id, dias]);
  return (
    <section className="pagina">
      <a href="/rubros" className="volver">← Rubros</a>
      <p className="etiqueta">Rubro {id}</p>
      <h1 className="titulo-ficha">{nombre}</h1>
      <div className="filtros">
        <div className="lapso" role="group" aria-label="Período">
          {[30, 90].map((d) => <button key={d} type="button" aria-pressed={dias === d} onClick={() => setDias(d)}>{d} días</button>)}
        </div>
      </div>
      <Estado cargando={cargando} error={error} vacio={!!r && r.compras === 0} textoVacio="No registramos compras de este rubro en el período.">
        {r && r.compras > 0 && (
          <>
            <p className="resumen-ficha">El Estado compró <mark>{montoCorto(r.monto)}</mark> en este rubro desde el {formatearFecha(r.desde)}, en {veces(r.compras, "ítem", "ítems")} de {veces(r.instituciones, "institución", "instituciones")}.</p>
            <div className="acciones"><Compartir camino={ruta.rubro(id)} texto={`El Estado paraguayo compró ${montoCorto(r.monto)} en ${nombre.toLowerCase()} desde el ${formatearFecha(r.desde)}.`} /></div>
            <Ranking titulo="Qué se compró" items={r.productos.map((p) => ({ k: p.codigo, href: ruta.producto(p.codigo), nombre: nombreLindo(p.nombre.toUpperCase()), monto: p.monto,
              detalle: `${montoCorto(p.monto)} · ${veces(p.instituciones, "institución", "instituciones")}` }))} />
            <div className="rankings">
              <Ranking titulo="Quién compró" items={aRanking(r.top_entidades, "entidad")} />
              <Ranking titulo="A quién" items={aRanking(r.top_proveedores, "proveedor")} />
            </div>
          </>
        )}
      </Estado>
      <NotaDatos />
    </section>
  );
}

function PaginaProducto({ codigo }: { codigo: string }) {
  const { cargando, datos: p, error } = useCarga<FichaProducto>(() => api.producto(codigo), [codigo]);
  const nombre = p ? nombreLindo(p.nombre.toUpperCase()) : "Producto";
  useTitulo(nombre);
  const v = p ? veces2(p.precio_max, p.precio_min) : null;
  const unidad = (p?.unidad ?? "unidad").toLowerCase();
  const max = Math.max(...(p?.instituciones.map((i) => i.precio) ?? [1]), 1);
  return (
    <section className="pagina">
      <a href={ruta.rubro(codigo.slice(0, 2))} className="volver">← {nombreRubro(codigo.slice(0, 2))}</a>
      <Estado cargando={cargando} error={error} vacio={!cargando && (!p || p.instituciones.length === 0)} textoVacio="Todavía no tenemos compras de este producto con precio en guaraníes.">
        {p && p.instituciones.length > 0 && (
          <>
            <p className="etiqueta">Producto · código {p.codigo}</p>
            <h1 className="titulo-ficha">{nombre}</h1>
            <p className="resumen-ficha">
              {p.instituciones.length > 1 ? <>
                {veces(p.instituciones.length, "institución lo compró", "instituciones lo compraron")} desde el {formatearFecha(p.desde)}. Pagaron entre <mark>{formatearMonto(Math.round(p.precio_min ?? 0))}</mark> y <mark>{formatearMonto(Math.round(p.precio_max ?? 0))}</mark> por {unidad}.
                {v && v >= 1.2 && <> La que más pagó, pagó {nVeces(v)} veces lo que la que menos.</>}
              </> : <>Una institución lo compró desde el {formatearFecha(p.desde)}, a {formatearMonto(Math.round(p.precio_max ?? 0))} por {unidad}.</>}
            </p>
            <div className="acciones">
              <Compartir camino={ruta.producto(p.codigo)} texto={p.instituciones.length > 1
                ? `${nombre}: las instituciones públicas pagaron entre ${formatearMonto(Math.round(p.precio_min ?? 0))} y ${formatearMonto(Math.round(p.precio_max ?? 0))} por ${unidad}.`
                : `${nombre}: el Estado lo compró a ${formatearMonto(Math.round(p.precio_max ?? 0))} por ${unidad}.`} />
            </div>
            <h2 className="sub">Precio por {unidad}, de mayor a menor</h2>
            <ol className="precios">
              {p.instituciones.map((i) => (
                <li key={i.id}>
                  <div className="fila">
                    <a className="nombre" href={ruta.entidad(i.id)}>{nombreEntidad(i.nombre)}</a>
                    <strong>{formatearMonto(Math.round(i.precio))}</strong>
                  </div>
                  <span className="barra" aria-hidden="true"><span style={{ width: `${Math.max((i.precio / max) * 100, 2)}%` }} /></span>
                  <p className="meta">
                    {entero(i.cantidad)} {i.cantidad === 1 ? "unidad" : "unidades"} · {montoCorto(i.monto)} · {formatearFecha(i.fecha)}
                    {i.proveedor_ruc && <> · <a href={ruta.proveedor(i.proveedor_ruc)}>{nombreLindo(i.proveedor_nombre)}</a></>}
                    {i.url_dncp && <> · <a href={i.url_dncp} target="_blank" rel="noopener noreferrer">DNCP ↗</a></>}
                  </p>
                </li>
              ))}
            </ol>
            <p className="nota">
              Se compara la misma unidad de medida ({unidad}){p.otras_unidades > 0 && `; dejamos fuera ${p.otras_unidades === 1 ? "otra presentación" : `otras ${p.otras_unidades} presentaciones`}`}.
              Es el precio promedio que pagó cada institución en el período. La marca, la calidad, la cantidad, el plazo de entrega y el flete pueden explicar diferencias: no implica una irregularidad.
            </p>
          </>
        )}
      </Estado>
      <NotaDatos />
    </section>
  );
}

function BotonTelegram() {
  const { datos: canal } = useCarga<string | null>(() => api.canalTelegram().catch(() => null), []);
  if (!canal) return null;
  return (
    <section className="bloque avisos" aria-labelledby="t-avisos">
      <h2 id="t-avisos">Recibí el resumen cada lunes</h2>
      <p className="intro">Un mensaje por semana en nuestro canal de Telegram, con la compra más grande y los datos principales. Sin registrarte en este sitio.</p>
      <a className="btn primario" href={canal} target="_blank" rel="noopener noreferrer">Seguir en Telegram ↗</a>
    </section>
  );
}

// ---------- Búsqueda ----------
function Busqueda({ q }: { q: string }) {
  useTitulo(`Buscar “${q}”`);
  const { cargando, datos, error } = useCarga(() => api.buscar(q), [q]);
  const productos = useCarga(() => api.buscarProductos(q).catch(() => []), [q]);
  return (
    <section className="pagina">
      <a href="/" className="volver">← Inicio</a>
      <Buscador inicial={q} />
      <h1 className="titulo-pagina">{datos ? veces(datos.length, "resultado", "resultados") : "Resultados"} para “{q}”</h1>
      <Estado cargando={cargando} error={error} vacio={datos?.length === 0}
        textoVacio={productos.datos?.length ? "No hay instituciones ni proveedores con ese nombre." : "No encontramos nada con ese nombre. Probá con otra palabra, con la sigla (IPS, ANDE) o con el RUC."}>
        {datos && (
          <ul className="resultados">
            {datos.map((r: Resultado) => (
              <li key={r.tipo + r.id}>
                <a href={r.tipo === "proveedor" ? ruta.proveedor(r.id) : ruta.entidad(r.id)}>
                  <span className="etiqueta">{r.tipo === "proveedor" ? "Proveedor" : "Institución"}</span>
                  <span className="nombre">{r.tipo === "proveedor" ? nombreLindo(r.nombre) : nombreEntidad(r.nombre)}</span>
                  {r.tipo === "proveedor" && <span className="meta">RUC {r.id}</span>}
                  <span className="flecha" aria-hidden="true">→</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Estado>
      {!!productos.datos?.length && (
        <>
          <h2 className="sub">Productos que compró el Estado</h2>
          <ul className="resultados">
            {productos.datos.map((p) => (
              <li key={p.codigo}>
                <a href={ruta.producto(p.codigo)}>
                  <span className="etiqueta">Producto</span>
                  <span className="nombre">{nombreLindo(p.nombre.toUpperCase())}</span>
                  <span className="meta">Compará qué pagó cada institución</span>
                  <span className="flecha" aria-hidden="true">→</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {datos?.length === 0 && !productos.datos?.length && <Chips />}
    </section>
  );
}

// ---------- Fichas ----------
type Ficha = NonNullable<FichaEntidad> | NonNullable<FichaProveedor>;

function CuerpoFicha({ f, tipo, nombre, camino, extra }: { f: Ficha; tipo: "entidad" | "proveedor"; nombre: string; camino: string; extra?: ReactNode }) {
  const esEnt = tipo === "entidad";
  const pct = f.con_dato_oferentes >= 3 ? Math.round((f.un_solo_oferente / f.con_dato_oferentes) * 100) : null;
  const contrapartes = "top_proveedores" in f
    ? aRanking(f.top_proveedores.map((x) => ({ ...x, id: x.ruc })), "proveedor")
    : aRanking(f.top_entidades, "entidad");
  const cuantos = "proveedores" in f ? veces(f.proveedores, "proveedor", "proveedores") : veces(f.instituciones, "institución", "instituciones");
  const compras = veces(f.adjudicaciones, esEnt ? "compra" : "adjudicación", esEnt ? "compras" : "adjudicaciones");
  const total = useContador(f.monto_total, 700);
  const frase = `${nombre} ${esEnt ? "adjudicó" : "ganó"} ${montoCorto(f.monto_total)} en ${compras} desde el ${formatearFecha(f.desde)}.`;
  return (
    <>
      {f.adjudicaciones > 0 ? (
        <p className="resumen-ficha">
          {esEnt ? "Adjudicó" : "Ganó"} <mark aria-label={montoCorto(f.monto_total)}>{montoEnUnidadDe(total, f.monto_total)}</mark> en {compras} {esEnt ? "a" : "de"} {cuantos} desde el {formatearFecha(f.desde)}.
          {enSalarios(f.monto_total) && <> Equivale a {enSalarios(f.monto_total)}.</>}
        </p>
      ) : <p className="resumen-ficha">No registramos adjudicaciones {esEnt ? "de esta institución" : "a este proveedor"} desde el {formatearFecha(f.desde)}.</p>}

      {f.adjudicaciones > 0 && (f.puesto != null || pct != null) && (
        <ul className="datos-clave">
          {f.puesto != null && <li><strong>Puesto {f.puesto}</strong> de {entero(f.de)} {esEnt ? "instituciones" : "proveedores"}, por monto</li>}
          {pct != null && <li><strong>{pct} %</strong> de sus licitaciones con dato tuvo un solo oferente ({f.un_solo_oferente} de {f.con_dato_oferentes})</li>}
        </ul>
      )}

      <div className="acciones">
        <Compartir camino={camino} texto={frase} />
        {extra}
      </div>

      {f.adjudicaciones > 0 && f.serie.length > 2 && (
        <>
          <h2 className="sub">Monto adjudicado por semana</h2>
          <Barras datos={f.serie.map((s) => ({ etiqueta: diaCorto(s.semana), monto: s.monto }))} descripcion="Monto adjudicado por semana desde que tenemos datos completos." />
        </>
      )}

      <Ranking titulo={esEnt ? "A quién le compró más" : "Quién le compró más"} items={contrapartes} />

      {f.recientes.length > 0 && (
        <>
          <h2 className="sub">{esEnt ? "Compras recientes" : "Adjudicaciones recientes"}</h2>
          <div className="lista-tarjetas">
            {f.recientes.map((c, i) => <TarjetaCompra key={i} c={c} />)}
          </div>
        </>
      )}
      <NotaDatos />
    </>
  );
}

function Proveedor({ ruc }: { ruc: string }) {
  const { cargando, datos: f, error } = useCarga<FichaProveedor>(() => api.fichaProveedor(ruc), [ruc]);
  const nombre = nombreLindo(f?.nombre);
  useTitulo(f ? nombre : "Proveedor");
  return (
    <section className="pagina">
      <a href="/" className="volver">← Inicio</a>
      <Estado cargando={cargando} error={error} vacio={!cargando && !f} textoVacio="No encontramos un proveedor con ese RUC.">
        {f && (
          <>
            <p className="etiqueta">Proveedor del Estado · RUC {f.ruc}</p>
            <h1 className="titulo-ficha">{nombre}</h1>
            <CuerpoFicha f={f} tipo="proveedor" nombre={nombre} camino={ruta.proveedor(f.ruc)} />
          </>
        )}
      </Estado>
    </section>
  );
}

function Entidad({ id }: { id: string }) {
  const { cargando, datos: f, error } = useCarga<FichaEntidad>(() => api.fichaEntidad(id), [id]);
  const [fijada, setFijada] = useFijada();
  const nombre = nombreEntidad(f?.nombre);
  useTitulo(f ? nombre : "Institución");
  return (
    <section className="pagina">
      <a href="/" className="volver">← Inicio</a>
      <Estado cargando={cargando} error={error} vacio={!cargando && !f} textoVacio="No encontramos esa institución.">
        {f && (
          <>
            <p className="etiqueta">Institución pública</p>
            <h1 className="titulo-ficha">{nombre}</h1>
            <CuerpoFicha f={f} tipo="entidad" nombre={nombre} camino={ruta.entidad(f.id)} extra={
              <button type="button" className="btn" aria-pressed={fijada?.id === f.id}
                onClick={() => setFijada(fijada?.id === f.id ? null : { id: f.id, nombre: f.nombre })}>
                {fijada?.id === f.id ? "★ Fijada en tu inicio" : "☆ Fijar en mi inicio"}
              </button>} />
          </>
        )}
      </Estado>
    </section>
  );
}

function NoEncontrada() {
  useTitulo("Página no encontrada");
  return (
    <section className="pagina">
      <h1 className="titulo-ficha">No encontramos esa página</h1>
      <p className="resumen-ficha">Puede que el enlace esté incompleto. Probá buscar lo que necesitás:</p>
      <Buscador />
      <Chips />
      <p className="mas"><a className="btn" href="/">Ir al inicio</a></p>
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
  let vista: ReactNode;
  if (!seg) vista = <Inicio />;
  else if (seg === "buscar" && arg) vista = <Busqueda q={arg} />;
  else if (seg === "proveedor" && arg) vista = <Proveedor ruc={arg} />;
  else if (seg === "entidad" && arg) vista = <Entidad id={arg} />;
  else if (seg === "ranking") vista = <PaginaRanking />;
  else if (seg === "rubros") vista = <PaginaRubros />;
  else if (seg === "rubro" && arg) vista = <PaginaRubro id={arg} />;
  else if (seg === "producto" && arg) vista = <PaginaProducto codigo={arg} />;
  else vista = <NoEncontrada />;

  return (
    <>
      <a href="#contenido" className="skip" target="_self">Saltar al contenido</a>
      <header className="barra-sup">
        <a href="/" className="logo" aria-label="Contratos Abiertos, inicio">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor" /><rect x="7" y="17" width="18" height="7" rx="1.5" className="logo-marca" /><path d="M9 11h14" stroke="var(--bg)" strokeWidth="2.6" strokeLinecap="round" /></svg>
          <span>Contratos <mark>Abiertos</mark></span>
        </a>
        <nav aria-label="Secciones">
          <a href="/rubros" aria-current={seg === "rubros" || seg === "rubro" || seg === "producto" ? "page" : undefined}>Rubros</a>
          <a href="/ranking" aria-current={seg === "ranking" ? "page" : undefined}>Ranking</a>
          <button className="tema" onClick={alternarTema} aria-label="Cambiar entre modo claro y oscuro" title="Modo claro / oscuro">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></svg>
          </button>
        </nav>
      </header>
      {modoDemo && <p className="demo" role="note">Modo demostración: los datos que ves son ficticios.</p>}
      <main id="contenido">{vista}</main>
      <footer className="pie">
        <p>Datos abiertos de la Dirección Nacional de Contrataciones Públicas (DNCP), licencia CC BY 4.0. Sitio independiente, sin vínculo con la DNCP.</p>
        <p>Mostramos la información tal como la publica la DNCP, sin juicios de valor; la versión oficial está en el enlace de cada compra. Solo se suman montos en guaraníes. El equivalente en salarios mínimos usa Gs. 3.044.000 (vigente desde julio de 2026).</p>
        <p className="firma">Hecho por <a href="https://ardentium.tech/?utm_source=contratos-abiertos&utm_medium=referral&utm_campaign=pie" target="_blank" rel="noopener">Ardentium</a></p>
      </footer>
    </>
  );
}
