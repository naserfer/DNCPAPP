import { test } from "node:test";
import assert from "node:assert/strict";
import { extraerReleases, mapear, limpiarRuc, idLlamado, totalPaginas } from "../ocds.ts";

const release = {
  ocid: "ocds-03ad3f-193399-1", id: "193399-1-rel", date: "2026-10-20T10:00:00-03:00", tag: ["award"],
  tender: { id: "193399", title: "Adquisición de insumos", mainProcurementCategory: "goods",
    procurementMethodDetails: "Licitación Pública Nacional", statusDetails: "Adjudicada",
    value: { amount: 1500000000, currency: "PYG" }, numberOfTenderers: 3,
    procuringEntity: { id: "PY-ENT-123", name: "Ministerio de Ejemplo" },
    tenderPeriod: { endDate: "2026-09-01T09:00:00-03:00" } },
  awards: [{ id: "193399-aw-1", date: "2026-10-19T00:00:00-03:00", value: { amount: 1250000000, currency: "PYG" },
    suppliers: [{ id: "PY-RUC-80012345-6", name: "Proveedor Ejemplo S.A." }] }],
};

test("extrae releases de distintos envoltorios", () => {
  assert.equal(extraerReleases({ list: [release] }).length, 1);
  assert.equal(extraerReleases([release]).length, 1);
  assert.equal(extraerReleases({ records: [{ compiledRelease: release }] }).length, 1);
  assert.equal(extraerReleases(null).length, 0);
});

test("mapea proceso, entidad, proveedor y adjudicación", () => {
  const m = mapear([release]);
  assert.equal(m.procesos[0].id_llamado, "193399");
  assert.equal(m.procesos[0].url_dncp, "https://www.contrataciones.gov.py/licitaciones/convocatoria/193399.html");
  assert.equal(m.entidades[0].nombre, "Ministerio de Ejemplo");
  assert.equal(m.proveedores[0].ruc, "80012345-6");
  assert.equal(m.adjudicaciones[0].monto, 1250000000);
  assert.equal(m.adjudicaciones[0].num_oferentes, 3);
  assert.equal(m.versiones[0].etiquetas[0], "award");
});

test("tolera datos faltantes", () => {
  const m = mapear([{ ocid: "ocds-x-1-1" }, { sin: "ocid" }]);
  assert.equal(m.procesos.length, 1);
  assert.equal(m.adjudicaciones.length, 0);
});

test("utilidades", () => {
  assert.equal(limpiarRuc("PY-RUC-80012345-6"), "80012345-6");
  assert.equal(idLlamado("ocds-03ad3f-555-2", {}), "555");
  assert.equal(totalPaginas({ pagination: { total_pages: 7 } }), 7);
});
