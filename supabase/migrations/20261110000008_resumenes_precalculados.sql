-- =====================================================================
-- DNCPAPP · 008 · Adjudicaciones únicas precalculadas
-- Los resúmenes recalculaban el agrupado en cada visita (~1,8 s).
-- Ahora se lee de una vista materializada que se refresca cada 5 minutos.
-- Idempotente.
-- =====================================================================

create materialized view if not exists public.adj_mv as
select regexp_replace(a.id, ':\d+$', '') as adj_id,
       max(a.ocid) as ocid, max(a.monto) as monto, max(a.fecha) as fecha,
       max(a.num_oferentes) as num_oferentes, bool_or(a.convenio_marco) as convenio_marco,
       max(coalesce(a.comprador_id, p.entidad_id)) as entidad_id,
       max(case when a.convenio_marco then coalesce(a.detalle, p.titulo) else p.titulo end) as titulo,
       max(p.modalidad) as modalidad, max(p.url_dncp) as url_dncp,
       min(a.proveedor_ruc) as proveedor_ruc,
       string_agg(pr.nombre, ' + ' order by pr.nombre) as proveedor_nombre,
       array_remove(array_agg(distinct a.proveedor_ruc), null) as rucs
from public.adjudicaciones a
join public.procesos p on p.ocid = a.ocid
left join public.proveedores pr on pr.ruc = a.proveedor_ruc
where coalesce(a.moneda, 'PYG') = 'PYG' and a.fecha is not null
group by 1;

create unique index if not exists adj_mv_id_idx on public.adj_mv (adj_id);
create index if not exists adj_mv_fecha_idx on public.adj_mv (fecha desc);
create index if not exists adj_mv_entidad_idx on public.adj_mv (entidad_id, fecha desc);
create index if not exists adj_mv_rucs_idx on public.adj_mv using gin (rucs);
grant select on public.adj_mv to anon, authenticated;

create or replace function public.adj_base(p_desde timestamptz, p_entidad text default null, p_ruc text default null)
returns table (adj_id text, ocid text, monto numeric, fecha timestamptz, num_oferentes integer, convenio_marco boolean,
               entidad_id text, titulo text, modalidad text, url_dncp text, proveedor_ruc text, proveedor_nombre text)
language sql stable security invoker set search_path = ''
as $$
  select m.adj_id, m.ocid, m.monto, m.fecha, m.num_oferentes, m.convenio_marco, m.entidad_id, m.titulo,
         m.modalidad, m.url_dncp, case when p_ruc is null then m.proveedor_ruc else p_ruc end, m.proveedor_nombre
  from public.adj_mv m
  where m.fecha >= p_desde and m.fecha <= now()
    and (p_entidad is null or m.entidad_id = p_entidad)
    and (p_ruc is null or m.rucs @> array[p_ruc]);
$$;
grant execute on function public.adj_base(timestamptz, text, text) to anon, authenticated;

refresh materialized view public.adj_mv;
select cron.schedule('adj-mv', '*/5 * * * *', $$refresh materialized view concurrently public.adj_mv$$);
notify pgrst, 'reload schema';
