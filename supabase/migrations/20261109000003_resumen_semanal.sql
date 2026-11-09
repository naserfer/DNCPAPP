-- =====================================================================
-- DNCPAPP · 003 · Resumen semanal (portada)
-- Uso: supabase.rpc('resumen_semanal')  → JSON con los últimos 7 días.
-- Idempotente.
-- =====================================================================

create index if not exists adjudicaciones_fecha_idx on public.adjudicaciones (fecha desc);

create or replace function public.resumen_semanal(dias integer default 7)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select least(greatest(dias, 1), 31) as d,
           now() - make_interval(days => least(greatest(dias, 1), 31)) as desde
  ),
  adj as (
    select a.*, regexp_replace(a.id, ':\d+$', '') as adj_id, p.titulo, p.entidad_id, p.url_dncp, e.nombre as entidad_nombre, pr.nombre as proveedor_nombre
    from public.adjudicaciones a
    join public.procesos p on p.ocid = a.ocid
    left join public.entidades e on e.id = p.entidad_id
    left join public.proveedores pr on pr.ruc = a.proveedor_ruc
    , params
    where a.fecha >= params.desde and a.fecha <= now() and coalesce(a.moneda, 'PYG') = 'PYG'
  ),
  -- una fila por adjudicación (los consorcios tienen una fila por proveedor)
  unicas as (
    select adj_id, max(monto) as monto, max(fecha) as fecha, max(num_oferentes) as num_oferentes,
           max(titulo) as titulo, max(url_dncp) as url_dncp, max(entidad_id) as entidad_id,
           max(entidad_nombre) as entidad_nombre, max(ocid) as ocid,
           min(proveedor_ruc) as proveedor_ruc,
           string_agg(proveedor_nombre, ' + ' order by proveedor_nombre) as proveedor_nombre
    from adj group by adj_id
  )
  select jsonb_build_object(
    'desde', (select desde from params),
    'hasta', now(),
    'adjudicaciones', (select count(*) from unicas),
    'monto_total', (select coalesce(sum(monto), 0) from unicas),
    'procesos_adjudicados', (select count(distinct ocid) from adj),
    'un_solo_oferente', (select count(distinct ocid) from adj where num_oferentes = 1),
    'con_dato_oferentes', (select count(distinct ocid) from adj where num_oferentes is not null),
    'procesos_publicados', (select count(*) from public.procesos, params
                            where fecha_publicacion >= params.desde and fecha_publicacion <= now()),
    'top_entidades', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select entidad_id as id, max(entidad_nombre) as nombre, sum(monto) as monto, count(*) as cantidad
        from unicas where entidad_id is not null group by entidad_id order by sum(monto) desc nulls last limit 5
      ) x), '[]'::jsonb),
    'top_proveedores', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select proveedor_ruc as ruc, max(proveedor_nombre) as nombre, sum(monto) as monto, count(*) as cantidad
        from adj where proveedor_ruc is not null group by proveedor_ruc order by sum(monto) desc nulls last limit 5
      ) x), '[]'::jsonb),
    'mayores', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select titulo, monto, fecha, num_oferentes, url_dncp, entidad_id, entidad_nombre,
               proveedor_ruc, proveedor_nombre
        from unicas where monto is not null order by monto desc limit 5
      ) x), '[]'::jsonb),
    'actualizado', (select max(actualizado_en) from public.procesos)
  );
$$;

grant execute on function public.resumen_semanal(integer) to anon, authenticated;
