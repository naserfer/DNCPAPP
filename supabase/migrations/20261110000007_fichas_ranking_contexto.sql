-- =====================================================================
-- DNCPAPP · 007 · Contexto: fichas completas, ranking, comparación y cobertura real
--
-- 1. Compras sin sección "tender" (órdenes de convenio marco): el número de
--    oferentes no aplica; se marcan como convenio marco.
-- 2. adj_base(): una fila por adjudicación, base común de todos los resúmenes.
-- 3. datos_desde() / estado_datos(): desde qué fecha los datos están completos
--    (máx. 90 días), para no prometer períodos que no tenemos.
-- 4. resumen_semanal: comparación con el período anterior, serie diaria,
--    compras repetidas agrupadas, "un solo oferente" solo en licitaciones
--    reales desde un monto mínimo.
-- 5. ficha_entidad / ficha_proveedor: resumen, puesto, serie semanal, contrapartes.
-- 6. ranking() y novedades().
-- 7. Carga de 90 días de historia.
-- Idempotente.
-- =====================================================================

-- ---------- 1. Parser: sin "tender" => convenio marco, sin dato de oferentes ----------
do $do$
declare d text;
begin
  select pg_get_functiondef('public.dncp_guardar_record(jsonb)'::regprocedure) into d;
  if position('or t is null' in d) = 0 then
    d := replace(d,
      $x$v_cm := exists (select 1 from jsonb_array_elements(aws) a where a->'buyer'->>'id' is not null);$x$,
      $x$v_cm := exists (select 1 from jsonb_array_elements(aws) a where a->'buyer'->>'id' is not null) or t is null;$x$);
    d := replace(d, $x$(a->'buyer'->>'id' is not null) as es_cm,$x$, $x$(a->'buyer'->>'id' is not null or t is null) as es_cm,$x$);
    execute d;
  end if;
end $do$;

update public.adjudicaciones a set convenio_marco = true, num_oferentes = null
from public.procesos p
where p.ocid = a.ocid and (p.modalidad = 'Convenio marco' or p.titulo like 'Compra por convenio marco%' or p.titulo = '(sin título)')
  and (a.convenio_marco is not true or a.num_oferentes is not null);

-- ---------- 2. Base común ----------
create or replace function public.adj_base(p_desde timestamptz, p_entidad text default null, p_ruc text default null)
returns table (adj_id text, ocid text, monto numeric, fecha timestamptz, num_oferentes integer, convenio_marco boolean,
               entidad_id text, titulo text, modalidad text, url_dncp text, proveedor_ruc text, proveedor_nombre text)
language sql stable security invoker set search_path = ''
as $$
  select regexp_replace(a.id, ':\d+$', ''),
         max(a.ocid), max(a.monto), max(a.fecha), max(a.num_oferentes), bool_or(a.convenio_marco),
         max(coalesce(a.comprador_id, p.entidad_id)),
         max(case when a.convenio_marco then coalesce(a.detalle, p.titulo) else p.titulo end),
         max(p.modalidad), max(p.url_dncp), min(a.proveedor_ruc),
         string_agg(pr.nombre, ' + ' order by pr.nombre)
  from public.adjudicaciones a
  join public.procesos p on p.ocid = a.ocid
  left join public.proveedores pr on pr.ruc = a.proveedor_ruc
  where coalesce(a.moneda, 'PYG') = 'PYG' and a.fecha >= p_desde and a.fecha <= now()
    and (p_entidad is null or a.comprador_id = p_entidad or (a.comprador_id is null and p.entidad_id = p_entidad))
    and (p_ruc is null or a.proveedor_ruc = p_ruc)
  group by 1;
$$;
grant execute on function public.adj_base(timestamptz, text, text) to anon, authenticated;

-- ---------- 3. Cobertura real de los datos ----------
create or replace function public.datos_desde()
returns timestamptz language sql stable security definer set search_path = ''
as $$
  select greatest(
    now() - interval '90 days',
    coalesce((
      select min(b.fecha)::timestamptz from public.ingesta_busquedas b
      where b.fecha < current_date - 1
        and not exists (select 1 from public.ingesta_busquedas x
                        where x.fecha >= b.fecha and x.fecha < current_date - 1 and x.estado <> 'ok')
    ), now() - interval '30 days'));
$$;
grant execute on function public.datos_desde() to anon, authenticated;

create or replace function public.estado_datos()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'desde', public.datos_desde(),
    'cargando', exists (select 1 from public.ingesta_busquedas where fecha < current_date - 1 and estado in ('pendiente', 'pedido'))
                or (select count(*) from public.ingesta_cola where estado in ('pendiente', 'pedido')) > 200,
    'actualizado', (select max(actualizado_en) from public.procesos));
$$;
grant execute on function public.estado_datos() to anon, authenticated;

-- ---------- 4. Portada ----------
create or replace function public.resumen_semanal(dias integer default 7)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  with params as (
    select least(greatest(dias, 1), 31) as d,
           now() - make_interval(days => least(greatest(dias, 1), 31)) as desde,
           now() - make_interval(days => 2 * least(greatest(dias, 1), 31)) as desde2
  ),
  todo as (select b.* from params, public.adj_base(params.desde2) b),
  u as (select t.*, e.nombre as entidad_nombre from todo t left join public.entidades e on e.id = t.entidad_id, params
        where t.fecha >= params.desde),
  -- la misma compra repetida (mismo comprador, proveedor y descripción) se muestra una sola vez
  grupos as (
    select titulo, entidad_id, max(entidad_nombre) as entidad_nombre, proveedor_ruc, max(proveedor_nombre) as proveedor_nombre,
           sum(monto) as monto, count(*) as compras, max(fecha) as fecha, min(num_oferentes) as num_oferentes,
           bool_or(convenio_marco) as convenio_marco, max(url_dncp) as url_dncp
    from u where monto is not null group by titulo, entidad_id, proveedor_ruc
  )
  select jsonb_build_object(
    'desde', (select desde from params), 'hasta', now(),
    'adjudicaciones', (select count(*) from u),
    'monto_total', (select coalesce(sum(monto), 0) from u),
    'monto_anterior', (select coalesce(sum(monto), 0) from todo, params where todo.fecha < params.desde),
    'anterior_completo', (select public.datos_desde() <= (select desde2 from params)),
    'instituciones', (select count(distinct entidad_id) from u),
    'proveedores', (select count(distinct proveedor_ruc) from u),
    'un_solo_oferente', (select count(distinct ocid) from u where num_oferentes = 1 and not convenio_marco),
    'con_dato_oferentes', (select count(distinct ocid) from u where num_oferentes is not null and not convenio_marco),
    'monto_un_oferente', (select coalesce(sum(monto), 0) from u where num_oferentes = 1 and not convenio_marco),
    'serie', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'monto', monto) order by dia) from (
        select g.dia::date as dia, coalesce(sum(t.monto), 0) as monto
        from params, generate_series(date_trunc('day', (select desde2 from params) at time zone 'America/Asuncion') + interval '1 day',
                                     date_trunc('day', now() at time zone 'America/Asuncion'), interval '1 day') g(dia)
        left join todo t on date_trunc('day', t.fecha at time zone 'America/Asuncion') = g.dia
        group by g.dia) s), '[]'::jsonb),
    'top_entidades', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select entidad_id as id, max(entidad_nombre) as nombre, sum(monto) as monto, count(*) as cantidad
        from u where entidad_id is not null group by entidad_id order by sum(monto) desc nulls last limit 5) x), '[]'::jsonb),
    'top_proveedores', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select proveedor_ruc as ruc, max(proveedor_nombre) as nombre, sum(monto) as monto, count(*) as cantidad
        from u where proveedor_ruc is not null group by proveedor_ruc order by sum(monto) desc nulls last limit 5) x), '[]'::jsonb),
    'mayores', coalesce((select jsonb_agg(x order by x.monto desc) from (select * from grupos order by monto desc limit 6) x), '[]'::jsonb),
    'un_oferente', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select * from grupos where num_oferentes = 1 and not convenio_marco and monto >= 50000000 order by monto desc limit 3) x), '[]'::jsonb),
    'actualizado', (select max(actualizado_en) from public.procesos)
  );
$$;
grant execute on function public.resumen_semanal(integer) to anon, authenticated;

-- ---------- 5. Fichas ----------
create or replace function public.ficha_entidad(p_id text)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  with d as (select public.datos_desde() as desde),
  todo as (select b.* from d, public.adj_base(d.desde) b),
  u as (select * from todo where entidad_id = p_id),
  puestos as (select entidad_id, rank() over (order by sum(monto) desc nulls last) as puesto from todo where entidad_id is not null group by entidad_id),
  grupos as (
    select titulo, proveedor_ruc, max(proveedor_nombre) as proveedor_nombre, sum(monto) as monto, count(*) as compras,
           max(fecha) as fecha, min(num_oferentes) as num_oferentes, bool_or(convenio_marco) as convenio_marco,
           max(url_dncp) as url_dncp, max(modalidad) as modalidad
    from u group by titulo, proveedor_ruc)
  select case when e.id is null then null else jsonb_build_object(
    'id', e.id, 'nombre', e.nombre, 'desde', (select desde from d),
    'adjudicaciones', (select count(*) from u),
    'monto_total', (select coalesce(sum(monto), 0) from u),
    'proveedores', (select count(distinct proveedor_ruc) from u),
    'un_solo_oferente', (select count(distinct ocid) from u where num_oferentes = 1 and not convenio_marco),
    'con_dato_oferentes', (select count(distinct ocid) from u where num_oferentes is not null and not convenio_marco),
    'puesto', (select puesto from puestos where entidad_id = p_id),
    'de', (select count(*) from puestos),
    'serie', coalesce((
      select jsonb_agg(jsonb_build_object('semana', s, 'monto', m) order by s) from (
        select g.s::date as s, coalesce(sum(x.monto), 0) as m
        from d, generate_series(date_trunc('week', (select desde from d)), date_trunc('week', now()), interval '1 week') g(s)
        left join u x on date_trunc('week', x.fecha) = g.s group by g.s) q), '[]'::jsonb),
    'top_proveedores', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select proveedor_ruc as ruc, max(proveedor_nombre) as nombre, sum(monto) as monto, count(*) as cantidad
        from u where proveedor_ruc is not null group by proveedor_ruc order by sum(monto) desc nulls last limit 5) x), '[]'::jsonb),
    'recientes', coalesce((select jsonb_agg(x order by x.fecha desc) from (select * from grupos order by fecha desc nulls last limit 30) x), '[]'::jsonb)
  ) end
  from (select 1) uno left join public.entidades e on e.id = p_id;
$$;
grant execute on function public.ficha_entidad(text) to anon, authenticated;

create or replace function public.ficha_proveedor(p_ruc text)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  with d as (select public.datos_desde() as desde),
  todo as (select b.* from d, public.adj_base(d.desde) b),
  u as (select b.*, e.nombre as entidad_nombre from d, public.adj_base(d.desde, null, p_ruc) b left join public.entidades e on e.id = b.entidad_id),
  puestos as (select proveedor_ruc, rank() over (order by sum(monto) desc nulls last) as puesto from todo where proveedor_ruc is not null group by proveedor_ruc),
  grupos as (
    select titulo, entidad_id, max(entidad_nombre) as entidad_nombre, sum(monto) as monto, count(*) as compras,
           max(fecha) as fecha, min(num_oferentes) as num_oferentes, bool_or(convenio_marco) as convenio_marco,
           max(url_dncp) as url_dncp, max(modalidad) as modalidad
    from u group by titulo, entidad_id)
  select case when pr.ruc is null then null else jsonb_build_object(
    'ruc', pr.ruc, 'nombre', pr.nombre, 'desde', (select desde from d),
    'adjudicaciones', (select count(*) from u),
    'monto_total', (select coalesce(sum(monto), 0) from u),
    'instituciones', (select count(distinct entidad_id) from u),
    'un_solo_oferente', (select count(distinct ocid) from u where num_oferentes = 1 and not convenio_marco),
    'con_dato_oferentes', (select count(distinct ocid) from u where num_oferentes is not null and not convenio_marco),
    'puesto', (select puesto from puestos where proveedor_ruc = p_ruc),
    'de', (select count(*) from puestos),
    'serie', coalesce((
      select jsonb_agg(jsonb_build_object('semana', s, 'monto', m) order by s) from (
        select g.s::date as s, coalesce(sum(x.monto), 0) as m
        from d, generate_series(date_trunc('week', (select desde from d)), date_trunc('week', now()), interval '1 week') g(s)
        left join u x on date_trunc('week', x.fecha) = g.s group by g.s) q), '[]'::jsonb),
    'top_entidades', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select entidad_id as id, max(entidad_nombre) as nombre, sum(monto) as monto, count(*) as cantidad
        from u where entidad_id is not null group by entidad_id order by sum(monto) desc nulls last limit 5) x), '[]'::jsonb),
    'recientes', coalesce((select jsonb_agg(x order by x.fecha desc) from (select * from grupos order by fecha desc nulls last limit 30) x), '[]'::jsonb)
  ) end
  from (select 1) uno left join public.proveedores pr on pr.ruc = p_ruc;
$$;
grant execute on function public.ficha_proveedor(text) to anon, authenticated;

-- ---------- 6. Ranking y novedades ----------
create or replace function public.ranking(tipo text default 'entidad', dias integer default 30, limite integer default 20)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  with u as (select b.* from public.adj_base(greatest(now() - make_interval(days => least(greatest(dias, 1), 90)), public.datos_desde())) b),
  g as (
    select case when tipo = 'proveedor' then proveedor_ruc else entidad_id end as id,
           sum(monto) as monto, count(*) as cantidad,
           count(distinct ocid) filter (where num_oferentes = 1 and not convenio_marco) as un_oferente
    from u group by 1)
  select coalesce(jsonb_agg(x order by x.monto desc), '[]'::jsonb) from (
    select g.id, coalesce(e.nombre, pr.nombre) as nombre, g.monto, g.cantidad, g.un_oferente
    from g
    left join public.entidades e on tipo <> 'proveedor' and e.id = g.id
    left join public.proveedores pr on tipo = 'proveedor' and pr.ruc = g.id
    where g.id is not null and g.monto is not null
    order by g.monto desc limit least(greatest(limite, 1), 50)) x;
$$;
grant execute on function public.ranking(text, integer, integer) to anon, authenticated;

create or replace function public.novedades(p_desde timestamptz, p_entidad text default null)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('adjudicaciones', count(*), 'monto', coalesce(sum(monto), 0))
  from public.adj_base(greatest(p_desde, now() - interval '31 days'), p_entidad);
$$;
grant execute on function public.novedades(timestamptz, text) to anon, authenticated;

-- ---------- 7. Historia: 90 días ----------
insert into public.ingesta_busquedas (fecha, pagina)
select d::date, 1 from generate_series(current_date - 92, current_date - 31, interval '1 day') d
on conflict (fecha, pagina) do nothing;

notify pgrst, 'reload schema';
