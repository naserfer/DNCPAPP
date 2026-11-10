import { demo } from "./demo";

const URL_BASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const modoDemo = !URL_BASE || !KEY;

export type Resultado = { tipo: "proveedor" | "entidad"; id: string; nombre: string; similitud: number };
export type Resumen = { ruc: string; nombre: string; adjudicaciones_12m: number; monto_pyg_12m: number; ultima_adjudicacion: string | null };
export type Compra = {
  titulo: string | null; monto: number | null; fecha: string | null; num_oferentes: number | null;
  convenio_marco: boolean; url_dncp: string | null; modalidad?: string | null;
  entidad_id?: string | null; entidad_nombre?: string | null;
  proveedor_ruc?: string | null; proveedor_nombre?: string | null;
};
export type Puesto = { id: string; nombre: string; monto: number; cantidad: number };
export type Periodo = {
  desde: string; hasta: string; adjudicaciones: number; monto_total: number; instituciones: number; proveedores: number;
  un_solo_oferente: number; con_dato_oferentes: number; monto_un_oferente: number; actualizado: string | null;
  top_entidades: Puesto[]; top_proveedores: (Omit<Puesto, "id"> & { ruc: string })[];
  mayores: Compra[]; un_oferente: Compra[];
};
export type FichaEntidad = {
  id: string; nombre: string; adjudicaciones: number; monto_total: number; proveedores: number;
  un_solo_oferente: number; con_dato_oferentes: number;
  top_proveedores: { ruc: string; nombre: string; monto: number; cantidad: number }[]; recientes: Compra[];
} | null;
export type Adjudicacion = {
  id: string; monto: number | null; moneda: string | null; fecha: string | null; num_oferentes: number | null;
  detalle: string | null; convenio_marco: boolean;
  comprador: { id: string; nombre: string } | null;
  procesos: { titulo: string; url_dncp: string | null; modalidad: string | null; entidades: { id: string; nombre: string } | null } | null;
};
export type Opcion = { id: string; nombre: string };

async function rest<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
    ...init,
    headers: { apikey: KEY!, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json() as Promise<T>;
}
const rpc = <T,>(fn: string, args: object = {}) => rest<T>(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
const enc = encodeURIComponent;

export const api = {
  periodo: (dias: number): Promise<Periodo> => (modoDemo ? demo.periodo() : rpc("resumen_semanal", { dias })),
  buscar: (q: string): Promise<Resultado[]> => (modoDemo ? demo.buscar(q) : rpc("buscar", { q, limite: 20 })),
  fichaEntidad: (id: string): Promise<FichaEntidad> => (modoDemo ? demo.entidad(id) : rpc("resumen_entidad", { p_id: id })),
  municipalidades: (): Promise<Opcion[]> =>
    modoDemo ? demo.municipalidades() : rest("entidades?nombre=ilike.Municipalidad*&select=id,nombre&order=nombre&limit=400"),
  resumenProveedor: async (ruc: string): Promise<Resumen | null> =>
    modoDemo ? demo.resumen(ruc) : (await rest<Resumen[]>(`resumen_proveedor?ruc=eq.${enc(ruc)}`))[0] ?? null,
  adjudicacionesProveedor: (ruc: string): Promise<Adjudicacion[]> =>
    modoDemo
      ? demo.adjudicaciones()
      : rest(`adjudicaciones?proveedor_ruc=eq.${enc(ruc)}&select=id,monto,moneda,fecha,num_oferentes,detalle,convenio_marco,comprador:entidades(id,nombre),procesos(titulo,url_dncp,modalidad,entidades(id,nombre))&order=fecha.desc.nullslast&limit=50`),
};
