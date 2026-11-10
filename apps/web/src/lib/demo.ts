// Datos ficticios para desarrollar sin Supabase. NO son datos reales.
import type { Compra, EstadoDatos, FichaEntidad, FichaProveedor, Novedades, Opcion, Periodo, Puesto, Resultado } from "./api";

const prov = [
  { ruc: "80000001-1", nombre: "PROVEEDOR EJEMPLO SOCIEDAD ANONIMA" },
  { ruc: "80000002-2", nombre: "SERVICIOS DEMO S.R.L." },
];
const ent = [{ id: "E1", nombre: "Ministerio de Ejemplo (ME)" }, { id: "E2", nombre: "Municipalidad de Ejemplo" }, { id: "E3", nombre: "Rectorado / Universidad de Ejemplo" }];
const url = "https://www.contrataciones.gov.py";
const compras: Compra[] = [
  { titulo: "LPN N° 08/2026 SEGURO MÉDICO PARA FUNCIONARIOS DEL MINISTERIO DE EJEMPLO, CON COBERTURA INTEGRAL EN TODO EL TERRITORIO NACIONAL - Plurianual – 2° Llamado – AD REFERENDUM PGN 2026", monto: 8_400_000_000, fecha: "2026-11-06T15:00:00Z", num_oferentes: 1, convenio_marco: false,
    url_dncp: url, modalidad: "Licitación Pública Nacional", compras: 1, entidad_id: "E1", entidad_nombre: ent[0].nombre, proveedor_ruc: prov[0].ruc, proveedor_nombre: prov[0].nombre },
  { titulo: "Mantenimiento de edificios (ejemplo)", monto: 480_000_000, fecha: "2026-11-05T15:00:00Z", num_oferentes: 4, convenio_marco: false,
    url_dncp: url, modalidad: "Concurso de ofertas", compras: 1, entidad_id: "E2", entidad_nombre: ent[1].nombre, proveedor_ruc: prov[1].ruc, proveedor_nombre: prov[1].nombre },
  { titulo: "Compra por convenio marco: Computadoras portátiles", monto: 950_000_000, fecha: "2026-11-04T15:00:00Z", num_oferentes: null, convenio_marco: true,
    url_dncp: url, modalidad: "Convenio marco", compras: 3, entidad_id: "E3", entidad_nombre: ent[2].nombre, proveedor_ruc: prov[1].ruc, proveedor_nombre: prov[1].nombre },
];
const dias = [3, 0, 0, 5, 9, 4, 2, 0, 0, 14, 22, 9, 30, 12].map((m, i) => ({ dia: new Date(Date.UTC(2026, 9, 28 + i)).toISOString().slice(0, 10), monto: m * 1e8 }));
const semanas = [2, 0, 5, 1, 8, 3, 0, 12, 4, 6, 9, 30, 12].map((m, i) => ({ semana: new Date(Date.UTC(2026, 7, 10 + 7 * i)).toISOString().slice(0, 10), monto: m * 1e8 }));
const puestos: Puesto[] = [
  { id: "E1", nombre: ent[0].nombre, monto: 8_400_000_000, cantidad: 1, un_oferente: 1 },
  { id: "E3", nombre: ent[2].nombre, monto: 950_000_000, cantidad: 3, un_oferente: 0 },
  { id: "E2", nombre: ent[1].nombre, monto: 480_000_000, cantidad: 1, un_oferente: 0 },
];

export const demo = {
  periodo: async (): Promise<Periodo> => ({
    desde: "2026-11-03T15:00:00Z", hasta: "2026-11-10T15:00:00Z", adjudicaciones: 212, monto_total: 9_789_000_000, monto_anterior: 7_300_000_000, anterior_completo: true,
    instituciones: 41, proveedores: 87, un_solo_oferente: 5, con_dato_oferentes: 20, monto_un_oferente: 8_400_000_000, actualizado: "2026-11-10T15:00:00Z",
    serie: dias, top_entidades: puestos,
    top_proveedores: [{ ruc: prov[0].ruc, nombre: prov[0].nombre, monto: 8_400_000_000, cantidad: 1 }, { ruc: prov[1].ruc, nombre: prov[1].nombre, monto: 1_430_000_000, cantidad: 4 }],
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
    return e ? { ...e, desde: "2026-08-12T15:00:00Z", adjudicaciones: 34, monto_total: 12_300_000_000, proveedores: 19, un_solo_oferente: 4, con_dato_oferentes: 22,
      puesto: 3, de: 180, serie: semanas,
      top_proveedores: [{ ruc: prov[0].ruc, nombre: prov[0].nombre, monto: 8_400_000_000, cantidad: 1 }, { ruc: prov[1].ruc, nombre: prov[1].nombre, monto: 492_500_000, cantidad: 2 }],
      recientes: compras } : null;
  },
  proveedor: async (ruc: string): Promise<FichaProveedor> => {
    const p = prov.find((x) => x.ruc === ruc);
    return p ? { ...p, desde: "2026-08-12T15:00:00Z", adjudicaciones: 4, monto_total: 18_518_490_960, instituciones: 4, un_solo_oferente: 3, con_dato_oferentes: 4,
      puesto: 2, de: 640, serie: semanas, top_entidades: puestos, recientes: compras } : null;
  },
  ranking: async (tipo: string): Promise<Puesto[]> =>
    tipo === "proveedor" ? prov.map((p, i) => ({ id: p.ruc, nombre: p.nombre, monto: [8.4e9, 1.43e9][i], cantidad: [1, 4][i], un_oferente: [1, 0][i] })) : puestos,
  novedades: async (): Promise<Novedades> => ({ adjudicaciones: 41, monto: 2_300_000_000 }),
  estado: async (): Promise<EstadoDatos> => ({ desde: "2026-08-12T15:00:00Z", cargando: true, actualizado: "2026-11-10T15:00:00Z" }),
  municipalidades: async (): Promise<Opcion[]> => [ent[1], { id: "E9", nombre: "Municipalidad de Otra Ciudad" }],
};
