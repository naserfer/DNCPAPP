-- =====================================================================
-- DNCPAPP · 005 · Compradores reales, buscador y resúmenes
--
-- 1. En convenios marco la DNCP figura como convocante, pero cada compra
--    la hace otra institución (awards[].buyer). Se guarda el comprador.
-- 2. Compras por convenio marco sin sección "tender": se arma un título
--    con los ítems y se usa el comprador como institución.
-- 3. Enlace directo al proceso en la DNCP cuando se puede construir.
-- 4. Buscador: coincidencias exactas primero, sin ruido.
-- 5. resumen_semanal (comprador real, compras con un solo oferente) y
--    resumen_entidad (ficha de institución / "Mi municipalidad").
-- 6. Se pausa la descarga de la nómina SFP (certificado TLS incompleto).
-- Idempotente.
-- =====================================================================

alter table public.adjudicaciones add column if not exists comprador_id text references public.entidades(id);
alter table public.adjudicaciones add column if not exists detalle text;
alter table public.adjudicaciones add column if not exists convenio_marco boolean not null default false;
create index if not exists adjudicaciones_comprador_idx on public.adjudicaciones (comprador_id, fecha desc);

-- ---------- Parser ----------
create or replace function public.dncp_guardar_record(j jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  rec   jsonb := j->'records'->0;
  cr    jsonb := coalesce(j->'records'->0->'compiledRelease', j);
  t     jsonb := cr->'tender';
  aws   jsonb := coalesce(cr->'awards', '[]'::jsonb);
  v_ocid text := cr->>'ocid';
  v_ent  text := t->'procuringEntity'->>'id';
  v_idll text;
  v_nof  integer;
  v_cm   boolean;
  v_item text;
  v_url  text;
begin
  if v_ocid is null then raise exception 'record sin ocid'; end if;

  v_idll := coalesce(substring(v_ocid from '^ocds-[^-]+-(\d+)'), substring(t->>'id' from '^(\d+)'));
  -- convenio marco: las adjudicaciones traen su propio comprador
  v_cm := exists (select 1 from jsonb_array_elements(aws) a where a->'buyer'->>'id' is not null);
  v_nof := coalesce(
    (t->>'numberOfTenderers')::integer,
    case when jsonb_typeof(t->'tenderers') = 'array' then jsonb_array_length(t->'tenderers') end,
    nullif((select count(*) from jsonb_array_elements(coalesce(cr->'parties','[]')) p
            where p->'roles' ? 'tenderer'), 0)::integer
  );

  -- Instituciones: convocante y compradores
  insert into public.entidades (id, nombre)
  select distinct on (id) id, nombre from (
    select v_ent as id, coalesce(t->'procuringEntity'->>'name', v_ent) as nombre where v_ent is not null
    union all
    select a->'buyer'->>'id', coalesce(a->'buyer'->>'name', a->'buyer'->>'id')
    from jsonb_array_elements(aws) a where a->'buyer'->>'id' is not null
  ) e
  on conflict (id) do update set nombre = excluded.nombre, actualizado_en = now();

  if v_ent is null then
    select a->'buyer'->>'id' into v_ent from jsonb_array_elements(aws) a where a->'buyer'->>'id' is not null limit 1;
  end if;

  select nullif(trim(i->>'description'), '') into v_item
  from jsonb_array_elements(aws) a, jsonb_array_elements(coalesce(a->'items', '[]')) i limit 1;

  v_url := case
    when t->>'id' is not null and v_cm then 'https://www.contrataciones.gov.py/convenios-marco/convocatoria/' || (t->>'id') || '.html'
    when t->>'id' is not null then 'https://www.contrataciones.gov.py/licitaciones/convocatoria/' || (t->>'id') || '.html'
    when v_idll is not null then 'https://www.contrataciones.gov.py/buscador/licitaciones.html?nro_nombre_licitacion=' || v_idll
  end;

  insert into public.procesos (ocid, id_llamado, entidad_id, titulo, categoria, modalidad, estado,
                               monto_estimado, moneda, fecha_publicacion, fecha_apertura, url_dncp)
  values (
    v_ocid, v_idll, v_ent,
    coalesce(t->>'title', 'Compra por convenio marco' || coalesce(': ' || v_item, ''), '(sin título)'),
    t->>'mainProcurementCategory',
    coalesce(t->>'procurementMethodDetails', t->>'procurementMethod', case when v_cm then 'Convenio marco' end),
    coalesce(t->>'statusDetails', t->>'status'),
    public.a_numero(t->'value'->>'amount'),
    coalesce(t->'value'->>'currency', 'PYG'),
    public.a_fecha(coalesce(t->>'datePublished', cr->>'date')),
    public.a_fecha(t->'tenderPeriod'->>'endDate'),
    v_url
  )
  on conflict (ocid) do update set
    id_llamado = excluded.id_llamado, entidad_id = excluded.entidad_id, titulo = excluded.titulo,
    categoria = excluded.categoria, modalidad = excluded.modalidad, estado = excluded.estado,
    monto_estimado = excluded.monto_estimado, moneda = excluded.moneda,
    fecha_publicacion = excluded.fecha_publicacion, fecha_apertura = excluded.fecha_apertura,
    url_dncp = excluded.url_dncp, actualizado_en = now();

  insert into public.proveedores (ruc, nombre, es_persona_fisica)
  select distinct on (ruc) ruc, nombre, (split_part(ruc, '-', 1)::bigint < 80000000)
  from (
    select coalesce(substring(s->>'id' from '(\d+-\d)\s*$'), s->>'id') as ruc, s->>'name' as nombre
    from jsonb_array_elements(aws) a, jsonb_array_elements(coalesce(a->'suppliers','[]')) s
  ) x
  where ruc ~ '^\d+-\d$' and nombre is not null
  on conflict (ruc) do update set nombre = excluded.nombre, actualizado_en = now();

  insert into public.adjudicaciones (id, ocid, proveedor_ruc, monto, moneda, fecha, num_oferentes,
                                     comprador_id, detalle, convenio_marco)
  select distinct on (id) id, v_ocid, ruc, monto, moneda, fecha,
         case when es_cm then null else v_nof end, coalesce(comprador, v_ent), detalle, es_cm
  from (
    select v_ocid || '/' || coalesce(a->>'id', ai::text) || case when ns > 1 then ':' || si else '' end as id,
           case when ruc_raw ~ '^\d+-\d$' then ruc_raw end as ruc,
           public.a_numero(a->'value'->>'amount') as monto,
           coalesce(a->'value'->>'currency', 'PYG') as moneda,
           public.a_fecha(a->>'date') as fecha,
           a->'buyer'->>'id' as comprador,
           (a->'buyer'->>'id' is not null) as es_cm,
           (select nullif(trim(i->>'description'), '') ||
                   case jsonb_array_length(a->'items') when 1 then '' when 2 then ' y 1 ítem más'
                        else ' y ' || (jsonb_array_length(a->'items') - 1) || ' ítems más' end
            from jsonb_array_elements(coalesce(a->'items', '[]')) i limit 1) as detalle
    from jsonb_array_elements(aws) with ordinality aw(a, ai)
    cross join lateral (select greatest(jsonb_array_length(coalesce(a->'suppliers','[]')), 1) as ns) n
    cross join lateral (
      select coalesce(substring(s->>'id' from '(\d+-\d)\s*$'), s->>'id') as ruc_raw, si
      from jsonb_array_elements(case when jsonb_array_length(coalesce(a->'suppliers','[]')) = 0
                                     then '[null]'::jsonb else a->'suppliers' end) with ordinality sp(s, si)
    ) sup
    where coalesce(a->>'status', 'active') not in ('cancelled', 'unsuccessful')
  ) x
  on conflict (id) do update set
    proveedor_ruc = excluded.proveedor_ruc, monto = excluded.monto, moneda = excluded.moneda,
    fecha = excluded.fecha, num_oferentes = excluded.num_oferentes, comprador_id = excluded.comprador_id,
    detalle = excluded.detalle, convenio_marco = excluded.convenio_marco, actualizado_en = now();

  insert into public.versiones_proceso (ocid, release_id, fecha, etiquetas)
  select v_ocid,
         coalesce(r->>'id', regexp_replace(r->>'url', '^.*/', '')),
         coalesce(public.a_fecha(r->>'date'), now()),
         coalesce(array(select jsonb_array_elements_text(coalesce(r->'tag','[]'))), '{}')
  from jsonb_array_elements(coalesce(rec->'releases','[]')) r
  where coalesce(r->>'id', r->>'url') is not null
  on conflict (ocid, release_id) do nothing;
end $$;

revoke execute on function public.dncp_guardar_record(jsonb) from public, anon, authenticated;

-- ---------- Vista común: una fila por adjudicación (consorcios unificados) ----------
create or replace view public.adjudicaciones_unicas with (security_invoker = true) as
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
where coalesce(a.moneda, 'PYG') = 'PYG'
group by 1;

grant select on public.adjudicaciones_unicas to anon, authenticated;

-- ---------- Resumen del período (portada) ----------
create or replace function public.resumen_semanal(dias integer default 7)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (select now() - make_interval(days => least(greatest(dias, 1), 31)) as desde),
  u as (
    select x.*, e.nombre as entidad_nombre
    from public.adjudicaciones_unicas x
    left join public.entidades e on e.id = x.entidad_id, params
    where x.fecha >= params.desde and x.fecha <= now()
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
  with u as (
    select * from public.adjudicaciones_unicas
    where entidad_id = p_id and fecha >= now() - interval '12 months' and fecha <= now()
  )
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

-- ---------- Buscador ----------
drop function if exists public.buscar(text, integer);
create function public.buscar(q text, limite integer default 20)
returns table (tipo text, id text, nombre text, similitud real)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with p as (
    select public.normalizar(trim(q)) as qn, trim(q) as qr,
           replace(replace(replace(public.normalizar(trim(q)), '\', ''), '%', ''), '_', ' ') as ql,
           regexp_replace(public.normalizar(trim(q)), '([^a-z0-9 ])', '\\\1', 'g') as qre
  ),
  cand as (
    select 'proveedor'::text as tipo, pr.ruc as id, pr.nombre, pr.nombre_busqueda as nb, pr.ruc as ruc
    from public.proveedores pr
    union all
    select 'entidad', e.id, e.nombre, e.nombre_busqueda, null from public.entidades e
  ),
  punt as (
    select c.tipo, c.id, c.nombre,
      (case
        when c.ruc is not null and p.qr ~ '^\d' and (c.ruc = p.qr or split_part(c.ruc, '-', 1) = p.qr) then 4.0
        when c.ruc is not null and p.qr ~ '^\d{4,}' and c.ruc like p.qr || '%' then 3.5
        when length(p.ql) >= 2 and c.nb ~ ('(^|[^a-z0-9])' || p.qre || '([^a-z0-9]|$)') then 3.0
        when length(p.ql) >= 3 and c.nb ~ ('(^|[^a-z0-9])' || p.qre) then 2.5
        when length(p.ql) >= 6 and c.nb like '%' || p.ql || '%' then 2.0
        when length(p.ql) >= 4 and word_similarity(p.qn, c.nb) >= 0.6 then word_similarity(p.qn, c.nb)
        else 0 end)::real as s
    from cand c, p
    where length(p.ql) >= 2
  )
  select tipo, id, nombre, s
  from punt where s > 0
  order by s desc, (tipo = 'entidad') desc, length(nombre), nombre
  limit least(greatest(limite, 1), 50);
$$;

grant execute on function public.buscar(text, integer) to anon, authenticated;

-- ---------- Nómina SFP en pausa (su servidor no envía el certificado intermedio) ----------
do $$ begin perform cron.unschedule('sfp-tick'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('sfp-encolar'); exception when others then null; end $$;

-- ---------- Reprocesar todo con el parser nuevo ----------
update public.ingesta_cola set estado = 'pendiente', intentos = 0, detalle = null, actualizado = now()
where estado <> 'pedido';
