// Datos ficticios para desarrollar sin Supabase. NO son datos reales.
import type { Adjudicacion, Compra, FichaEntidad, Opcion, Periodo, Resultado, Resumen } from "./api";

const prov = [
  { ruc: "80000001-1", nombre: "PROVEEDOR EJEMPLO SOCIEDAD ANONIMA" },
  { ruc: "80000002-2", nombre: "SERVICIOS DEMO S.R.L." },
];
const ent = [{ id: "E1", nombre: "Ministerio de Ejemplo (ME)" }, { id: "E2", nombre: "Municipalidad de Ejemplo" }];
const url = "https://www.contrataciones.gov.py";
const compras: Compra[] = [
  { titulo: "Seguro médico para funcionarios (ejemplo)", monto: 8_400_000_000, fecha: "2026-11-06T15:00:00Z", num_oferentes: 1, convenio_marco: false,
    url_dncp: url, modalidad: "Licitación Pública Nacional", entidad_id: "E1", entidad_nombre: ent[0].nombre, proveedor_ruc: prov[0].ruc, proveedor_nombre: prov[0].nombre },
  { titulo: "Mantenimiento de edificios (ejemplo)", monto: 480_000_000, fecha: "2026-11-05T15:00:00Z", num_oferentes: 4, convenio_marco: false,
    url_dncp: url, modalidad: "Concurso de ofertas", entidad_id: "E2", entidad_nombre: ent[1].nombre, proveedor_ruc: prov[1].ruc, proveedor_nombre: prov[1].nombre },
  { titulo: "Resmas de papel y 3 ítems más", monto: 12_500_000, fecha: "2026-11-04T15:00:00Z", num_oferentes: null, convenio_marco: true,
    url_dncp: url, modalidad: "Convenio marco", entidad_id: "E2", entidad_nombre: ent[1].nombre, proveedor_ruc: prov[1].ruc, proveedor_nombre: prov[1].nombre },
];

export const demo = {
  periodo: async (): Promise<Periodo> => ({
    desde: "2026-11-03T15:00:00Z", hasta: "2026-11-10T15:00:00Z", adjudicaciones: 212, monto_total: 9_789_000_000, instituciones: 41, proveedores: 87,
    un_solo_oferente: 5, con_dato_oferentes: 20, monto_un_oferente: 8_400_000_000, actualizado: "2026-11-10T15:00:00Z",
    top_entidades: [{ id: "E1", nombre: ent[0].nombre, monto: 8_400_000_000, cantidad: 1 }, { id: "E2", nombre: ent[1].nombre, monto: 492_500_000, cantidad: 2 }],
    top_proveedores: [{ ruc: prov[0].ruc, nombre: prov[0].nombre, monto: 8_400_000_000, cantidad: 1 }, { ruc: prov[1].ruc, nombre: prov[1].nombre, monto: 492_500_000, cantidad: 2 }],
    mayores: compras, un_oferente: compras.filter((c) => c.num_oferentes === 1),
  }),
  buscar: async (q: string): Promise<Resultado[]> => {
    const t = q.toLowerCase();
    return [
      ...ent.filter((e) => e.nombre.toLowerCase().includes(t)).map((e) => ({ tipo: "entidad" as const, id: e.id, nombre: e.nombre, similitud: 1 })),
      ...prov.filter((p) => p.nombre.toLowerCase().includes(t) || p.ruc === q).map((p) => ({ tipo: "proveedor" as const, id: p.ruc, nombre: p.nombre, similitud: 1 })),
    ];
  },
  entidad: async (id: string): Promise<FichaEntidad> => {
    const e = ent.find((x) => x.id === id);
    return e ? { ...e, adjudicaciones: 34, monto_total: 12_300_000_000, proveedores: 19, un_solo_oferente: 4, con_dato_oferentes: 22,
      top_proveedores: [{ ruc: prov[0].ruc, nombre: prov[0].nombre, monto: 8_400_000_000, cantidad: 1 }, { ruc: prov[1].ruc, nombre: prov[1].nombre, monto: 492_500_000, cantidad: 2 }],
      recientes: compras } : null;
  },
  municipalidades: async (): Promise<Opcion[]> => [ent[1], { id: "E3", nombre: "Municipalidad de Otra Ciudad" }],
  resumen: async (ruc: string): Promise<Resumen | null> => {
    const p = prov.find((x) => x.ruc === ruc);
    return p ? { ...p, adjudicaciones_12m: 4, monto_pyg_12m: 18_518_490_960, ultima_adjudicacion: "2026-10-21T15:00:00Z" } : null;
  },
  adjudicaciones: async (): Promise<Adjudicacion[]> => compras.map((c, i) => ({
    id: "a" + i, monto: c.monto, moneda: "PYG", fecha: c.fecha, num_oferentes: c.num_oferentes, detalle: c.convenio_marco ? c.titulo : null,
    convenio_marco: c.convenio_marco, comprador: { id: c.entidad_id!, nombre: c.entidad_nombre! },
    procesos: { titulo: c.titulo!, url_dncp: c.url_dncp, modalidad: c.modalidad ?? null, entidades: { id: c.entidad_id!, nombre: c.entidad_nombre! } },
  })),
};
