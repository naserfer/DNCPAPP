import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, modoDemo, type Adjudicacion, type Proceso, type Resultado, type Resumen, type Semanal } from "./lib/api";
import { formatearCompacto, formatearFecha, formatearMonto } from "./lib/format";

function useRuta() {
  const leer = () => decodeURIComponent(location.hash.replace(/^#/, "")) || "/";
  const [ruta, setRuta] = useState(leer);
  useEffect(() => {
    const f = () => { setRuta(leer()); window.scrollTo(0, 0); };
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return ruta;
}

const ir = (r: string) => { location.hash = encodeURIComponent(r).replace(/%2F/g, "/"); };

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

function alternarTema() {
  const oscuro = document.documentElement.classList.toggle("dark");
  try { localStorage.setItem("tema", oscuro ? "oscuro" : "claro"); } catch { /* sin storage */ }
}

function Buscador({ inicial = "", grande = false }: { inicial?: string; grande?: boolean }) {
  const [q, setQ] = useState(inicial);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) ir(`/buscar/${q.trim()}`);
  };
  return (
    <form onSubmit={enviar} role="search" className={"buscador" + (grande ? " grande" : "")}>
      <label htmlFor="q" className="sr-only">Buscar proveedor, RUC o institución</label>
      <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, RUC o institución" autoComplete="off" autoFocus={grande} />
      <button type="submit">Buscar</button>
    </form>
  );
}

function Estado({ cargando, error, vacio, children }: { cargando: boolean; error?: boolean; vacio?: boolean; children: ReactNode }) {
  if (cargando) return <p className="aviso" role="status">Cargando…</p>;
  if (error) return <p className="aviso" role="alert">No pudimos cargar los datos. Probá de nuevo en un momento.</p>;
  if (vacio) return <p className="aviso">No encontramos resultados. Probá con otro nombre o con el RUC completo.</p>;
  return <>{children}</>;
}

function Inicio() {
  return (
    <section className="hero">
      <h1>¿Cuánto y cómo contrata el Estado?</h1>
      <p className="lead">Buscá una empresa o una institución y mirá sus contrataciones públicas, en lenguaje claro.</p>
      <Buscador grande />
      <ul className="pasos">
        <li><strong>1</strong> Buscá por nombre o RUC</li>
        <li><strong>2</strong> Mirá montos, fechas y cantidad de oferentes</li>
        <li><strong>3</strong> Abrí el proceso oficial en la DNCP</li>
      </ul>
      <ResumenSemanal />
      <BloqueArdentium />
    </section>
  );
}

function ResumenSemanal() {
  const { cargando, datos: r, error } = useCarga<Semanal>(() => api.resumenSemanal(), []);
  const pct = r && r.con_dato_oferentes > 0 ? Math.round((r.un_solo_oferente / r.con_dato_oferentes) * 100) : null;
  return (
    <section className="semanal" aria-labelledby="t-semanal">
      <div className="semanal-cab">
        <h2 id="t-semanal">Resumen de la semana</h2>
        {r && <p className="meta">{formatearFecha(r.desde)} – {formatearFecha(r.hasta)}</p>}
      </div>
      <Estado cargando={cargando} error={error} vacio={!!r && r.adjudicaciones === 0 && r.procesos_publicados === 0}>
        {r && (
          <>
            <dl className="cifras">
              <div><dt>Monto adjudicado</dt><dd>{formatearCompacto(r.monto_total)}</dd></div>
              <div><dt>Adjudicaciones</dt><dd>{r.adjudicaciones}</dd></div>
              <div><dt>Llamados publicados</dt><dd>{r.procesos_publicados}</dd></div>
              <div>
                <dt>Procesos con un solo oferente</dt>
                <dd>{pct == null ? "—" : `${pct} %`}</dd>
                {pct != null && <p className="meta">{r.un_solo_oferente} de {r.con_dato_oferentes} con dato</p>}
              </div>
            </dl>

            <div className="rankings">
              <Ranking titulo="Instituciones con más monto adjudicado"
                items={r.top_entidades.map((e) => ({ k: e.id, href: `#/entidad/${e.id}`, nombre: e.nombre, monto: e.monto, n: e.cantidad }))} />
              <Ranking titulo="Proveedores con más monto adjudicado"
                items={r.top_proveedores.map((p) => ({ k: p.ruc, href: `#/proveedor/${p.ruc}`, nombre: p.nombre, monto: p.monto, n: p.cantidad }))} />
            </div>

            {r.mayores.length > 0 && (
              <>
                <h3 className="sub">Adjudicaciones más grandes</h3>
                <ul className="tarjetas">
                  {r.mayores.map((m, i) => (
                    <li key={i}>
                      <h3>{m.titulo}</h3>
                      <p className="meta">
                        {m.entidad_id ? <a href={`#/entidad/${m.entidad_id}`}>{m.entidad_nombre}</a> : "Institución sin dato"}
                        {" → "}
                        {m.proveedor_ruc ? <a href={`#/proveedor/${m.proveedor_ruc}`}>{m.proveedor_nombre}</a> : "proveedor sin dato"}
                      </p>
                      <p className="monto">{formatearMonto(m.monto)}</p>
                      <p className="meta">{formatearFecha(m.fecha)} · <Oferentes n={m.num_oferentes} /></p>
                      <EnlaceDncp url={m.url_dncp} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="nota">
              Que un proceso tenga un solo oferente no implica por sí mismo una irregularidad; es un dato de contexto.
              {r.actualizado && <> Datos actualizados al {formatearFecha(r.actualizado)}.</>}
            </p>
          </>
        )}
      </Estado>
    </section>
  );
}

function Ranking({ titulo, items }: { titulo: string; items: { k: string; href: string; nombre: string; monto: number; n: number }[] }) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.monto), 1);
  return (
    <div className="ranking">
      <h3 className="sub">{titulo}</h3>
      <ol>
        {items.map((i) => (
          <li key={i.k}>
            <a href={i.href}>{i.nombre}</a>
            <span className="barra-fondo" aria-hidden="true"><span style={{ width: `${(i.monto / max) * 100}%` }} /></span>
            <span className="meta">{formatearCompacto(i.monto)} · {i.n} {i.n === 1 ? "adjudicación" : "adjudicaciones"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Busqueda({ q }: { q: string }) {
  const { cargando, datos, error } = useCarga(() => api.buscar(q), [q]);
  return (
    <section>
      <Buscador inicial={q} />
      <h2>Resultados para “{q}”</h2>
      <Estado cargando={cargando} error={error} vacio={datos?.length === 0}>
        <ul className="lista">
          {datos?.map((r: Resultado) => (
            <li key={r.tipo + r.id}>
              <a href={`#/${r.tipo}/${r.id}`}>
                <span className="etiqueta">{r.tipo === "proveedor" ? "Proveedor" : "Institución"}</span>
                <span className="nombre">{r.nombre}</span>
                {r.tipo === "proveedor" && <span className="meta">RUC {r.id}</span>}
              </a>
            </li>
          ))}
        </ul>
      </Estado>
    </section>
  );
}

function Oferentes({ n }: { n: number | null }) {
  if (n == null) return <span>Oferentes: sin dato</span>;
  return <span>{n} {n === 1 ? "oferente" : "oferentes"}</span>;
}

function EnlaceDncp({ url }: { url: string | null }) {
  return url ? <a className="externo" href={url} target="_blank" rel="noreferrer noopener">Ver en la DNCP ↗</a> : null;
}

function Proveedor({ ruc }: { ruc: string }) {
  const resumen = useCarga<Resumen | null>(() => api.resumenProveedor(ruc), [ruc]);
  const adjs = useCarga<Adjudicacion[]>(() => api.adjudicacionesProveedor(ruc), [ruc]);
  const r = resumen.datos;
  return (
    <section>
      <a href="#/" className="volver">← Inicio</a>
      <Estado cargando={resumen.cargando} error={resumen.error} vacio={!resumen.cargando && !r}>
        {r && (
          <>
            <h1>{r.nombre}</h1>
            <p className="meta">RUC {r.ruc}</p>
            <dl className="cifras">
              <div><dt>Adjudicaciones, últimos 12 meses</dt><dd>{r.adjudicaciones_12m}</dd></div>
              <div><dt>Monto total (Gs.)</dt><dd>{formatearMonto(r.monto_pyg_12m)}</dd></div>
              <div><dt>Última adjudicación</dt><dd>{formatearFecha(r.ultima_adjudicacion)}</dd></div>
            </dl>
          </>
        )}
      </Estado>
      {r && (
        <>
          <h2>Adjudicaciones recientes</h2>
          <Estado cargando={adjs.cargando} error={adjs.error} vacio={adjs.datos?.length === 0}>
            <ul className="tarjetas">
              {adjs.datos?.map((a) => (
                <li key={a.id}>
                  <h3>{a.procesos?.titulo ?? "Proceso sin título"}</h3>
                  {a.procesos?.entidades && <p><a href={`#/entidad/${a.procesos.entidades.id}`}>{a.procesos.entidades.nombre}</a></p>}
                  <p className="monto">{formatearMonto(a.monto, a.moneda ?? "PYG")}</p>
                  <p className="meta">{formatearFecha(a.fecha)} · {a.procesos?.modalidad ?? "Modalidad sin dato"} · <Oferentes n={a.num_oferentes} /></p>
                  <EnlaceDncp url={a.procesos?.url_dncp ?? null} />
                </li>
              ))}
            </ul>
          </Estado>
        </>
      )}
    </section>
  );
}

function Entidad({ id }: { id: string }) {
  const ent = useCarga(() => api.entidad(id), [id]);
  const procs = useCarga<Proceso[]>(() => api.procesosEntidad(id), [id]);
  return (
    <section>
      <a href="#/" className="volver">← Inicio</a>
      <Estado cargando={ent.cargando} error={ent.error} vacio={!ent.cargando && !ent.datos}>
        {ent.datos && <h1>{ent.datos.nombre}</h1>}
      </Estado>
      {ent.datos && (
        <>
          <h2>Procesos recientes</h2>
          <Estado cargando={procs.cargando} error={procs.error} vacio={procs.datos?.length === 0}>
            <ul className="tarjetas">
              {procs.datos?.map((p) => (
                <li key={p.ocid}>
                  <h3>{p.titulo}</h3>
                  <p className="monto">{formatearMonto(p.monto_estimado, p.moneda ?? "PYG")} <span className="meta">estimado</span></p>
                  <p className="meta">{formatearFecha(p.fecha_publicacion)} · {p.modalidad ?? "Modalidad sin dato"} · {p.estado ?? "Estado sin dato"}</p>
                  {p.adjudicaciones.map((a, i) => (
                    <p key={i} className="meta">
                      Adjudicado a {a.proveedores ? <a href={`#/proveedor/${a.proveedores.ruc}`}>{a.proveedores.nombre}</a> : "proveedor sin dato"} · {formatearMonto(a.monto, a.moneda ?? "PYG")} · <Oferentes n={a.num_oferentes} />
                    </p>
                  ))}
                  <EnlaceDncp url={p.url_dncp} />
                </li>
              ))}
            </ul>
          </Estado>
        </>
      )}
    </section>
  );
}

const ARDENTIUM = "https://ardentium.tech/?utm_source=contratos-abiertos&utm_medium=referral";
const enlaceArdentium = (campania: string) => `${ARDENTIUM}&utm_campaign=${campania}`;

function BloqueArdentium() {
  return (
    <aside className="ardentium" aria-label="Sobre quién hizo este sitio">
      <p className="etiqueta">Un proyecto de Ardentium</p>
      <h2>Datos públicos convertidos en algo que cualquiera entiende.</h2>
      <p className="meta">
        Diseñamos y desarrollamos este sitio de forma independiente y gratuita. Si tu empresa necesita una plataforma,
        un panel de datos o software a medida, hablemos.
      </p>
      <a className="boton" href={enlaceArdentium("bloque-portada")} target="_blank" rel="noopener">Conocé Ardentium ↗</a>
    </aside>
  );
}

export default function App() {
  const ruta = useRuta();
  const [, seg, ...resto] = ruta.split("/");
  const arg = resto.join("/");
  let vista: ReactNode = <Inicio />;
  if (seg === "buscar" && arg) vista = <Busqueda q={arg} />;
  else if (seg === "proveedor" && arg) vista = <Proveedor ruc={arg} />;
  else if (seg === "entidad" && arg) vista = <Entidad id={arg} />;

  return (
    <>
      <a href="#contenido" className="skip">Saltar al contenido</a>
      <header className="barra">
        <span className="marca">
          <a href="#/" className="logo">Contratos Abiertos</a>
          <a href={enlaceArdentium("encabezado")} target="_blank" rel="noopener" className="por">por Ardentium</a>
        </span>
        <button className="tema" onClick={alternarTema} aria-label="Cambiar entre tema claro y oscuro"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></svg></button>
      </header>
      {modoDemo && <p className="demo" role="note">Modo demostración: los datos que ves son ficticios.</p>}
      <main id="contenido">{vista}</main>
      <footer className="pie">
        <p className="firma">Hecho en Asunción por <a href={enlaceArdentium("pie")} target="_blank" rel="noopener">Ardentium</a> · software a medida</p>
        <p>Datos: Dirección Nacional de Contrataciones Públicas (DNCP), licencia CC BY 4.0. Este sitio es independiente y no está afiliado a la DNCP.</p>
        <p>La información se muestra tal como la publica la DNCP, sin juicios de valor. Para el detalle y la versión oficial, abrí el proceso en el portal de la DNCP.</p>
      </footer>
    </>
  );
}
