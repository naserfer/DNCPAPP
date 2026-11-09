// Datos ficticios para desarrollar sin Supabase. NO son datos reales.
import type { Adjudicacion, Proceso, Resultado, Resumen, Semanal } from "./api";

const prov = [
  { ruc: "80000001-1", nombre: "Proveedor Ejemplo S.A." },
  { ruc: "80000002-2", nombre: "Servicios Demo S.R.L." },
];
const ent = [{ id: "E1", nombre: "Institución de Ejemplo" }];

const adjs: Adjudicacion[] = [
  { id: "a1", monto: 1_250_000_000, moneda: "PYG", fecha: "2026-10-20T15:00:00Z", num_oferentes: 1,
    procesos: { titulo: "Adquisición de insumos (ejemplo)", url_dncp: "https://www.contrataciones.gov.py", modalidad: "Licitación pública", entidades: ent[0] } },
  { id: "a2", monto: 480_000_000, moneda: "PYG", fecha: "2026-09-02T15:00:00Z", num_oferentes: 4,
    procesos: { titulo: "Servicio de mantenimiento (ejemplo)", url_dncp: "https://www.contrataciones.gov.py", modalidad: "Concurso de ofertas", entidades: ent[0] } },
];

export const demo = {
  semanal: async (): Promise<Semanal> => ({
    desde: "2026-11-02T15:00:00Z", hasta: "2026-11-09T15:00:00Z", adjudicaciones: 2, monto_total: 1_730_000_000,
    procesos_adjudicados: 2, un_solo_oferente: 1, con_dato_oferentes: 2, procesos_publicados: 5, actualizado: "2026-11-09T15:00:00Z",
    top_entidades: [{ id: "E1", nombre: ent[0].nombre, monto: 1_730_000_000, cantidad: 2 }],
    top_proveedores: [{ ruc: prov[0].ruc, nombre: prov[0].nombre, monto: 1_250_000_000, cantidad: 1 }, { ruc: prov[1].ruc, nombre: prov[1].nombre, monto: 480_000_000, cantidad: 1 }],
    mayores: adjs.map((a, i) => ({ titulo: a.procesos!.titulo, monto: a.monto!, fecha: a.fecha!, num_oferentes: a.num_oferentes,
      url_dncp: a.procesos!.url_dncp, entidad_id: "E1", entidad_nombre: ent[0].nombre, proveedor_ruc: prov[i].ruc, proveedor_nombre: prov[i].nombre })),
  }),
  buscar: async (q: string): Promise<Resultado[]> => {
    const t = q.toLowerCase();
    return [
      ...prov.filter((p) => p.nombre.toLowerCase().includes(t) || p.ruc === q).map((p) => ({ tipo: "proveedor" as const, id: p.ruc, nombre: p.nombre, similitud: 1 })),
      ...ent.filter((e) => e.nombre.toLowerCase().includes(t)).map((e) => ({ tipo: "entidad" as const, id: e.id, nombre: e.nombre, similitud: 1 })),
    ];
  },
  resumen: async (ruc: string): Promise<Resumen | null> => {
    const p = prov.find((x) => x.ruc === ruc);
    return p ? { ...p, adjudicaciones_12m: 2, monto_pyg_12m: 1_730_000_000, ultima_adjudicacion: "2026-10-20T15:00:00Z" } : null;
  },
  adjudicaciones: async (_ruc: string) => adjs,
  entidad: async (id: string) => ent.find((e) => e.id === id) ?? null,
  procesos: async (_id: string): Promise<Proceso[]> =>
    adjs.map((a, i) => ({
      ocid: "ocds-" + i, titulo: a.procesos!.titulo, modalidad: a.procesos!.modalidad, estado: "adjudicado",
      monto_estimado: a.monto, moneda: "PYG", fecha_publicacion: a.fecha, url_dncp: a.procesos!.url_dncp,
      adjudicaciones: [{ monto: a.monto, moneda: "PYG", num_oferentes: a.num_oferentes, proveedores: prov[i] }],
    })),
};
