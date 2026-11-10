-- DNCPAPP · 006 · Resúmenes más rápidos: se filtra por fecha/institución antes de agrupar. Idempotente.
create index if not exists adjudicaciones_fecha_idx on public.adjudicaciones (fecha desc);

-- ---------- Resumen del período (portada) ----------
create or replace function public.resumen_semanal(dias integer default 7)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (select now() - make_interval(days => least(greatest(dias, 1), 31)) as desde),
  base as (
    select regexp_replace(a.id, ':\d+$', '') as adj_id,
           max(a.ocid) as ocid, max(a.monto) as monto, max(a.fecha) as fecha,
           max(a.num_oferentes) as num_oferentes, bool_or(a.convenio_marco) as convenio_marco,
           max(coalesce(a.comprador_id, p.entidad_id)) as entidad_id,
           max(case when a.convenio_marco then coalesce(a.detalle, p.titulo) else p.titulo end) as titulo,
           max(p.modalidad) as modalidad, max(p.url_dncp) as url_dncp,
           min(a.proveedor_ruc) as proveedor_ruc,
           string_agg(pr.nombre, ' + ' order by pr.nombre) as proveedor_nombre
    from public.adjudicaciones a
    join public.procesos p on p.ocid = a.ocid
    left join public.proveedores pr on pr.ruc = a.proveedor_ruc
    where coalesce(a.moneda, 'PYG') = 'PYG' and a.fecha >= (select desde from params) and a.fecha <= now()
    group by 1
  ),
  u as (
    select x.*, e.nombre as entidad_nombre
    from base x left join public.entidades e on e.id = x.entidad_id
  ),
  fila as (
    select titulo, monto, fecha, num_oferentes, convenio_marco, url_dncp, entidad_id, entidad_nombre,
           proveedor_ruc, proveedor_nombre from u
  )
  select jsonb_build_object(
    'desde', (select desde from params),
    'hasta', now(),
    'adjudicaciones', (select count(*) from u),
    'monto_total', (select coalesce(sum(monto), 0) from u),
    'instituciones', (select count(distinct entidad_id) from u),
    'proveedores', (select count(distinct proveedor_ruc) from u),
    'un_solo_oferente', (select count(distinct ocid) from u where num_oferentes = 1),
    'con_dato_oferentes', (select count(distinct ocid) from u where num_oferentes is not null),
    'monto_un_oferente', (select coalesce(sum(monto), 0) from u where num_oferentes = 1),
    'top_entidades', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select entidad_id as id, max(entidad_nombre) as nombre, sum(monto) as monto, count(*) as cantidad
        from u where entidad_id is not null group by entidad_id order by sum(monto) desc nulls last limit 5
      ) x), '[]'::jsonb),
    'top_proveedores', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select proveedor_ruc as ruc, max(proveedor_nombre) as nombre, sum(monto) as monto, count(*) as cantidad
        from u where proveedor_ruc is not null group by proveedor_ruc order by sum(monto) desc nulls last limit 5
      ) x), '[]'::jsonb),
    'mayores', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select * from fila where monto is not null order by monto desc limit 5) x), '[]'::jsonb),
    'un_oferente', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select * from fila where monto is not null and num_oferentes = 1 order by monto desc limit 3) x), '[]'::jsonb),
    'actualizado', (select max(actualizado_en) from public.procesos)
  );
$$;

grant execute on function public.resumen_semanal(integer) to anon, authenticated;

-- ---------- Ficha de institución ----------
create or replace function public.resumen_entidad(p_id text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select regexp_replace(a.id, ':\d+$', '') as adj_id,
           max(a.ocid) as ocid, max(a.monto) as monto, max(a.fecha) as fecha,
           max(a.num_oferentes) as num_oferentes, bool_or(a.convenio_marco) as convenio_marco,
           max(coalesce(a.comprador_id, p.entidad_id)) as entidad_id,
           max(case when a.convenio_marco then coalesce(a.detalle, p.titulo) else p.titulo end) as titulo,
           max(p.modalidad) as modalidad, max(p.url_dncp) as url_dncp,
           min(a.proveedor_ruc) as proveedor_ruc,
           string_agg(pr.nombre, ' + ' order by pr.nombre) as proveedor_nombre
    from public.adjudicaciones a
    join public.procesos p on p.ocid = a.ocid
    left join public.proveedores pr on pr.ruc = a.proveedor_ruc
    where coalesce(a.moneda, 'PYG') = 'PYG' and a.fecha >= now() - interval '12 months' and a.fecha <= now()
      and (a.comprador_id = p_id or (a.comprador_id is null and p.entidad_id = p_id))
    group by 1
  ),
  u as (select * from base)
  select case when e.id is null then null else jsonb_build_object(
    'id', e.id, 'nombre', e.nombre,
    'adjudicaciones', (select count(*) from u),
    'monto_total', (select coalesce(sum(monto), 0) from u),
    'proveedores', (select count(distinct proveedor_ruc) from u),
    'un_solo_oferente', (select count(distinct ocid) from u where num_oferentes = 1),
    'con_dato_oferentes', (select count(distinct ocid) from u where num_oferentes is not null),
    'top_proveedores', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select proveedor_ruc as ruc, max(proveedor_nombre) as nombre, sum(monto) as monto, count(*) as cantidad
        from u where proveedor_ruc is not null group by proveedor_ruc order by sum(monto) desc nulls last limit 5
      ) x), '[]'::jsonb),
    'recientes', coalesce((
      select jsonb_agg(x order by x.fecha desc) from (
        select titulo, monto, fecha, num_oferentes, convenio_marco, url_dncp, modalidad, proveedor_ruc, proveedor_nombre
        from u order by fecha desc nulls last limit 30
      ) x), '[]'::jsonb)
  ) end
  from (select 1) uno left join public.entidades e on e.id = p_id;
$$;

grant execute on function public.resumen_entidad(text) to anon, authenticated;

notify pgrst, 'reload schema';
