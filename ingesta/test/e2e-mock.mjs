// Simula DNCP y Supabase para probar ingestar.ts de punta a punta.
import http from "node:http";
import { spawn } from "node:child_process";
const release = { ocid: "ocds-03ad3f-193399-1", id: "r1", date: "2026-11-08T10:00:00Z", tag: ["award"],
  tender: { id: "193399", title: "Insumos", numberOfTenderers: 2, procuringEntity: { id: "E1", name: "Ministerio X" } },
  awards: [{ id: "aw1", value: { amount: 100, currency: "PYG" }, date: "2026-11-08T00:00:00Z", suppliers: [{ id: "PY-RUC-80012345-6", name: "Prov S.A." }] }] };
const escrituras = {}; let ingestaId = 1;
const srv = http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    const u = new URL(req.url, "http://x"); const j = (o, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (u.pathname === "/oauth/token") return j({ access_token: "t" });
    if (u.pathname === "/doc/search/processes") return j(u.searchParams.get("page") === "1" ? { pagination: { total_pages: 1 }, list: [release] } : { list: [] });
    if (u.pathname.startsWith("/rest/v1/ingestas")) { if (req.method === "POST") return j([{ id: ingestaId }], 201); if (req.method === "GET") return j([]); escrituras.ingestaFinal = JSON.parse(body); res.writeHead(204); return res.end(); }
    const t = u.pathname.split("/").pop(); escrituras[t] = JSON.parse(body); res.writeHead(201); res.end();
  });
}).listen(0, async () => {
  const p = srv.address().port;
  const env = { PATH: process.env.PATH, DNCP_REQUEST_TOKEN: "x", DNCP_TOKEN_URL: `http://localhost:${p}/oauth/token`, DNCP_BASE: `http://localhost:${p}/doc`, SUPABASE_URL: `http://localhost:${p}`, SUPABASE_SERVICE_ROLE_KEY: "k", DESDE: "2026-11-08" };
  const c = spawn("node", ["ingesta/ingestar.ts"], { env });
  let out = ""; c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (out += d));
  const code = await new Promise((r) => c.on("close", r));
  console.log(out);
  console.log(JSON.stringify({ tablas: Object.keys(escrituras), adj: escrituras.adjudicaciones?.[0], final: escrituras.ingestaFinal }));
  srv.close(); process.exit(code);
});
