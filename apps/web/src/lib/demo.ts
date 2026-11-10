// Datos ficticios para desarrollar sin Supabase. NO son datos reales.
import type { Comparable, Compra, EstadoDatos, FichaProducto, FichaRubro, Rubro, FichaEntidad, FichaProveedor, Novedades, Opcion, Periodo, Puesto, Resultado } from "./api";

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

const comps: Comparable[] = [
  { codigo: "84131602-001", nombre: "Seguro medico", unidad: "Unidad", instituciones: 9, precio_min: 9_600_000, precio_max: 25_700_000, precio_mediano: 16_000_000, monto: 41_000_000_000 },
  { codigo: "43211503-001", nombre: "Computadora portátil - Intermedia", unidad: "Unidad", instituciones: 6, precio_min: 5_900_000, precio_max: 8_100_000, precio_mediano: 6_600_000, monto: 2_300_000_000 },
  { codigo: "14111507-003", nombre: "Papel tamaño oficio", unidad: "Resma", instituciones: 14, precio_min: 31_000, precio_max: 52_000, precio_mediano: 38_500, monto: 310_000_000 },
];

export const demo = {
  rubros: async (): Promise<Rubro[]> => [
    { id: "84", monto: 41e9, compras: 22, productos: 3, instituciones: 18 }, { id: "51", monto: 33e9, compras: 140, productos: 85, instituciones: 9 },
    { id: "72", monto: 21e9, compras: 31, productos: 12, instituciones: 25 }, { id: "43", monto: 6.2e9, compras: 120, productos: 40, instituciones: 31 },
    { id: "47", monto: 0.9e9, compras: 310, productos: 60, instituciones: 44 },
  ],
  rubro: async (id: string): Promise<FichaRubro> => ({ id, desde: "2026-08-12T15:00:00Z", monto: 41e9, compras: 22, instituciones: 18,
    productos: comps.map((c) => ({ codigo: c.codigo, nombre: c.nombre, monto: c.monto, compras: 12, instituciones: c.instituciones })),
    top_entidades: puestos, top_proveedores: prov.map((p, i) => ({ id: p.ruc, nombre: p.nombre, monto: [8.4e9, 1.43e9][i], cantidad: [1, 4][i] })) }),
  producto: async (codigo: string): Promise<FichaProducto> => {
    const c = comps.find((x) => x.codigo === codigo) ?? comps[0];
    return { codigo: c.codigo, nombre: c.nombre, desde: "2026-08-12T15:00:00Z", unidad: c.unidad, otras_unidades: 1, compras: 11, monto: c.monto,
      precio_min: c.precio_min, precio_max: c.precio_max, precio_mediano: c.precio_mediano,
      instituciones: [c.precio_max, c.precio_mediano * 1.2, c.precio_mediano, c.precio_min].map((precio, i) => ({
        id: ent[i % 3].id, nombre: ent[i % 3].nombre, precio, cantidad: [350, 120, 900, 60][i], monto: precio * [350, 120, 900, 60][i], compras: 1,
        fecha: "2026-10-2" + i + "T15:00:00Z", proveedor_nombre: prov[i % 2].nombre, proveedor_ruc: prov[i % 2].ruc, url_dncp: url })) };
  },
  comparables: async (): Promise<Comparable[]> => comps,
  buscarProductos: async (q: string) => comps.filter((c) => c.nombre.toLowerCase().includes(q.toLowerCase())).map((c) => ({ codigo: c.codigo, nombre: c.nombre })),
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
