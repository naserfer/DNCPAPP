import { demo } from "./demo";

const URL_BASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const modoDemo = !URL_BASE || !KEY;

export type Resultado = { tipo: "proveedor" | "entidad"; id: string; nombre: string; similitud: number };
export type Compra = {
  titulo: string | null; monto: number | null; fecha: string | null; num_oferentes: number | null;
  convenio_marco: boolean; url_dncp: string | null; modalidad?: string | null; compras?: number;
  entidad_id?: string | null; entidad_nombre?: string | null;
  proveedor_ruc?: string | null; proveedor_nombre?: string | null;
};
export type Puesto = { id: string; nombre: string; monto: number; cantidad: number; un_oferente?: number };
export type Periodo = {
  desde: string; hasta: string; adjudicaciones: number; monto_total: number; monto_anterior: number; anterior_completo: boolean;
  instituciones: number; proveedores: number;
  un_solo_oferente: number; con_dato_oferentes: number; monto_un_oferente: number; actualizado: string | null;
  serie: { dia: string; monto: number }[];
  top_entidades: Puesto[]; top_proveedores: (Omit<Puesto, "id"> & { ruc: string })[];
  mayores: Compra[]; un_oferente: Compra[];
};
type FichaBase = {
  nombre: string; desde: string; adjudicaciones: number; monto_total: number;
  un_solo_oferente: number; con_dato_oferentes: number; puesto: number | null; de: number;
  serie: { semana: string; monto: number }[]; recientes: Compra[];
};
export type FichaEntidad = (FichaBase & { id: string; proveedores: number;
  top_proveedores: { ruc: string; nombre: string; monto: number; cantidad: number }[] }) | null;
export type FichaProveedor = (FichaBase & { ruc: string; instituciones: number; top_entidades: Puesto[] }) | null;
export type Rubro = { id: string; monto: number; compras: number; productos: number; instituciones: number };
export type FichaRubro = { id: string; desde: string; monto: number; compras: number; instituciones: number;
  productos: { codigo: string; nombre: string; monto: number; compras: number; instituciones: number }[];
  top_entidades: Puesto[]; top_proveedores: Puesto[] };
export type Comparable = { codigo: string; nombre: string; unidad: string | null; instituciones: number; precio_min: number; precio_max: number; precio_mediano: number; monto: number };
export type FichaProducto = { codigo: string; nombre: string; desde: string; unidad: string | null; otras_unidades: number; compras: number; monto: number;
  precio_min: number | null; precio_max: number | null; precio_mediano: number | null;
  instituciones: { id: string; nombre: string; precio: number; cantidad: number; monto: number; compras: number; fecha: string;
    proveedor_nombre: string | null; proveedor_ruc: string | null; url_dncp: string | null }[] } | null;
export type Opcion = { id: string; nombre: string };
export type Novedades = { adjudicaciones: number; monto: number };
export type EstadoDatos = { desde: string; cargando: boolean; actualizado: string | null };

async function rest<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
    ...init,
    headers: { apikey: KEY!, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json() as Promise<T>;
}
const rpc = <T,>(fn: string, args: object = {}) => rest<T>(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

export const api = {
  periodo: (dias: number): Promise<Periodo> => (modoDemo ? demo.periodo() : rpc("resumen_semanal", { dias })),
  buscar: (q: string): Promise<Resultado[]> => (modoDemo ? demo.buscar(q) : rpc("buscar", { q, limite: 20 })),
  fichaEntidad: (id: string): Promise<FichaEntidad> => (modoDemo ? demo.entidad(id) : rpc("ficha_entidad", { p_id: id })),
  fichaProveedor: (ruc: string): Promise<FichaProveedor> => (modoDemo ? demo.proveedor(ruc) : rpc("ficha_proveedor", { p_ruc: ruc })),
  ranking: (tipo: "entidad" | "proveedor", dias: number): Promise<Puesto[]> =>
    modoDemo ? demo.ranking(tipo) : rpc("ranking", { tipo, dias, limite: 20 }),
  novedades: (desde: number, entidad?: string): Promise<Novedades> =>
    modoDemo ? demo.novedades() : rpc("novedades", { p_desde: new Date(desde).toISOString(), ...(entidad ? { p_entidad: entidad } : {}) }),
  estado: (): Promise<EstadoDatos> => (modoDemo ? demo.estado() : rpc("estado_datos")),
  rubros: (dias: number): Promise<Rubro[]> => (modoDemo ? demo.rubros() : rpc("rubros", { dias })),
  rubro: (id: string, dias: number): Promise<FichaRubro> => (modoDemo ? demo.rubro(id) : rpc("rubro", { p_id: id, dias })),
  producto: (codigo: string): Promise<FichaProducto> => (modoDemo ? demo.producto(codigo) : rpc("producto", { p_codigo: codigo, dias: 90 })),
  comparables: (limite: number): Promise<Comparable[]> => (modoDemo ? demo.comparables() : rpc("comparables", { dias: 90, limite })),
  buscarProductos: (q: string): Promise<{ codigo: string; nombre: string }[]> => (modoDemo ? demo.buscarProductos(q) : rpc("buscar_productos", { q, limite: 8 })),
  canalTelegram: async (): Promise<string | null> =>
    modoDemo ? "https://t.me/ejemplo" : (await rest<{ valor: string }[]>("config?clave=eq.telegram_canal&select=valor"))[0]?.valor ?? null,
  municipalidades: (): Promise<Opcion[]> =>
    modoDemo ? demo.municipalidades() : rest("entidades?nombre=ilike.Municipalidad*&select=id,nombre&order=nombre&limit=400"),
};
