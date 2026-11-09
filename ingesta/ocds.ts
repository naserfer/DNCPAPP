// Convierte releases OCDS de la DNCP en filas para nuestro esquema.
// Defensivo: la DNCP no documenta la forma exacta de la respuesta, así que
// cada campo se busca en las ubicaciones estándar de OCDS.

export type Fila = Record<string, unknown>;
export type Mapeo = {
  entidades: Fila[]; proveedores: Fila[]; procesos: Fila[];
  adjudicaciones: Fila[]; versiones: Fila[];
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const fechaISO = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Localiza la lista de releases dentro de la respuesta, sea cual sea su envoltorio. */
export function extraerReleases(resp: any): any[] {
  if (Array.isArray(resp)) return resp;
  if (!resp || typeof resp !== "object") return [];
  for (const k of ["list", "releases", "results", "data", "items"]) {
    if (Array.isArray(resp[k])) return resp[k];
  }
  if (Array.isArray(resp.records)) return resp.records.flatMap((r: any) => r.compiledRelease ?? r.releases ?? []);
  return [];
}

export function totalPaginas(resp: any): number | null {
  const p = resp?.pagination ?? resp?.meta ?? resp;
  const t = num(p?.total_pages ?? p?.totalPages ?? p?.pages);
  return t;
}

/** id numérico del llamado, p. ej. ocds-03ad3f-193399-1 → 193399 */
export function idLlamado(ocid: string, release: any): string | null {
  const t = str(release?.tender?.id);
  if (t && /^\d+$/.test(t)) return t;
  const m = ocid.match(/-(\d+)-\d+$/);
  return m ? m[1] : null;
}

export const urlProceso = (idLl: string | null) =>
  idLl ? `https://www.contrataciones.gov.py/licitaciones/convocatoria/${idLl}.html` : null;

const esPersonaFisica = (ruc: string) => {
  const base = parseInt(ruc.split("-")[0], 10);
  return Number.isFinite(base) && base < 80_000_000;
};

/** El id de parte en la DNCP suele ser "PY-RUC-80012345-6"; nos quedamos con el RUC. */
export function limpiarRuc(id: unknown): string | null {
  const s = str(id);
  if (!s) return null;
  const m = s.match(/(\d{3,9}-\d)\s*$/);
  return m ? m[1] : s;
}

export function mapear(releases: any[]): Mapeo {
  const out: Mapeo = { entidades: [], proveedores: [], procesos: [], adjudicaciones: [], versiones: [] };
  const ent = new Map<string, Fila>(), prov = new Map<string, Fila>();

  for (const r of releases) {
    const ocid = str(r?.ocid);
    if (!ocid) continue;
    const tender = r.tender ?? {};
    const pe = tender.procuringEntity ?? r.buyer ?? null;
    const entId = str(pe?.id);
    if (entId && pe?.name) ent.set(entId, { id: entId, nombre: String(pe.name) });

    const idLl = idLlamado(ocid, r);
    out.procesos.push({
      ocid, id_llamado: idLl, entidad_id: entId,
      titulo: str(tender.title) ?? "(sin título)",
      categoria: str(tender.mainProcurementCategory),
      modalidad: str(tender.procurementMethodDetails ?? tender.procurementMethod),
      estado: str(tender.statusDetails ?? tender.status),
      monto_estimado: num(tender.value?.amount),
      moneda: str(tender.value?.currency) ?? "PYG",
      fecha_publicacion: fechaISO(tender.datePublished ?? r.date),
      fecha_apertura: fechaISO(tender.tenderPeriod?.endDate),
      url_dncp: urlProceso(idLl),
    });

    const nOf = num(tender.numberOfTenderers) ?? (Array.isArray(r.bids?.details) ? r.bids.details.length : null);
    for (const [i, a] of (r.awards ?? []).entries()) {
      const sups: any[] = a.suppliers?.length ? a.suppliers : [null];
      for (const [j, s] of sups.entries()) {
        const ruc = limpiarRuc(s?.id ?? s?.identifier?.id);
        if (ruc && s?.name) prov.set(ruc, { ruc, nombre: String(s.name), es_persona_fisica: esPersonaFisica(ruc) });
        out.adjudicaciones.push({
          id: `${str(a.id) ?? `${ocid}-${i}`}${sups.length > 1 ? `:${j}` : ""}`,
          ocid, proveedor_ruc: ruc,
          monto: num(a.value?.amount), moneda: str(a.value?.currency) ?? "PYG",
          fecha: fechaISO(a.date), num_oferentes: nOf,
        });
      }
    }

    if (str(r.id)) out.versiones.push({ ocid, release_id: String(r.id), fecha: fechaISO(r.date) ?? new Date().toISOString(), etiquetas: Array.isArray(r.tag) ? r.tag : [] });
  }
  out.entidades = [...ent.values()];
  out.proveedores = [...prov.values()];
  return out;
}
