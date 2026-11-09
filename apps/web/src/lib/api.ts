import { demo } from "./demo";

const URL_BASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const modoDemo = !URL_BASE || !KEY;

export type Resultado = { tipo: "proveedor" | "entidad"; id: string; nombre: string; similitud: number };
export type Resumen = { ruc: string; nombre: string; adjudicaciones_12m: number; monto_pyg_12m: number; ultima_adjudicacion: string | null };
export type Adjudicacion = {
  id: string; monto: number | null; moneda: string | null; fecha: string | null; num_oferentes: number | null;
  procesos: { titulo: string; url_dncp: string | null; modalidad: string | null; entidades: { id: string; nombre: string } | null } | null;
};
export type Semanal = {
  desde: string; hasta: string; adjudicaciones: number; monto_total: number; procesos_adjudicados: number;
  un_solo_oferente: number; con_dato_oferentes: number; procesos_publicados: number; actualizado: string | null;
  top_entidades: { id: string; nombre: string; monto: number; cantidad: number }[];
  top_proveedores: { ruc: string; nombre: string; monto: number; cantidad: number }[];
  mayores: { titulo: string; monto: number; fecha: string; num_oferentes: number | null; url_dncp: string | null;
    entidad_id: string | null; entidad_nombre: string | null; proveedor_ruc: string | null; proveedor_nombre: string | null }[];
};
export type Proceso = {
  ocid: string; titulo: string; modalidad: string | null; estado: string | null; monto_estimado: number | null;
  moneda: string | null; fecha_publicacion: string | null; url_dncp: string | null;
  adjudicaciones: { monto: number | null; moneda: string | null; num_oferentes: number | null; proveedores: { ruc: string; nombre: string } | null }[];
};

async function rest<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
    ...init,
    headers: { apikey: KEY!, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

export const api = {
  resumenSemanal: (): Promise<Semanal> =>
    modoDemo ? demo.semanal() : rest("rpc/resumen_semanal", { method: "POST", body: "{}" }),

  buscar: (q: string): Promise<Resultado[]> =>
    modoDemo ? demo.buscar(q) : rest("rpc/buscar", { method: "POST", body: JSON.stringify({ q, limite: 20 }) }),

  resumenProveedor: async (ruc: string): Promise<Resumen | null> =>
    modoDemo ? demo.resumen(ruc) : (await rest<Resumen[]>(`resumen_proveedor?ruc=eq.${enc(ruc)}`))[0] ?? null,

  adjudicacionesProveedor: (ruc: string): Promise<Adjudicacion[]> =>
    modoDemo
      ? demo.adjudicaciones(ruc)
      : rest(`adjudicaciones?proveedor_ruc=eq.${enc(ruc)}&select=id,monto,moneda,fecha,num_oferentes,procesos(titulo,url_dncp,modalidad,entidades(id,nombre))&order=fecha.desc.nullslast&limit=50`),

  entidad: async (id: string): Promise<{ id: string; nombre: string } | null> =>
    modoDemo ? demo.entidad(id) : (await rest<{ id: string; nombre: string }[]>(`entidades?id=eq.${enc(id)}`))[0] ?? null,

  procesosEntidad: (id: string): Promise<Proceso[]> =>
    modoDemo
      ? demo.procesos(id)
      : rest(`procesos?entidad_id=eq.${enc(id)}&select=ocid,titulo,modalidad,estado,monto_estimado,moneda,fecha_publicacion,url_dncp,adjudicaciones(monto,moneda,num_oferentes,proveedores(ruc,nombre))&order=fecha_publicacion.desc.nullslast&limit=50`),
};
