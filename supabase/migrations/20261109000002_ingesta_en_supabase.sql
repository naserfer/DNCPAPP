-- =====================================================================
-- DNCPAPP · 002 · Ingesta automática DENTRO de Supabase
-- Pegar completo en Supabase → SQL Editor → Run. Idempotente.
--
-- La API v3 de la DNCP responde sin credenciales (límite 15 llamadas/min),
-- así que la ingesta no necesita secretos: pg_cron dispara cada minuto,
-- pg_net hace las llamadas HTTP y plpgsql guarda los datos.
--
--   Cada hora      → se encolan las búsquedas de ayer y hoy
--   Cada minuto    → se procesan respuestas y se piden hasta 12 procesos
--   Carga histórica → select public.dncp_cargar_desde('2026-01-01');
--   Estado         → select * from public.ingesta_estado;
-- =====================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- Colas (privadas: RLS sin políticas) ----------
create table if not exists public.ingesta_busquedas (
  fecha       date not null,
  pagina      integer not null default 1,
  estado      text not null default 'pendiente' check (estado in ('pendiente','pedido','ok','error')),
  intentos    integer not null default 0,
  actualizado timestamptz not null default now(),
  primary key (fecha, pagina)
);

create table if not exists public.ingesta_cola (
  ocid        text primary key,
  estado      text not null default 'pendiente' check (estado in ('pendiente','pedido','ok','error')),
  intentos    integer not null default 0,
  detalle     text,
  actualizado timestamptz not null default now()
);
create index if not exists ingesta_cola_pend_idx on public.ingesta_cola (actualizado) where estado = 'pendiente';

create table if not exists public.ingesta_pedidos (
  request_id bigint primary key,
  tipo       text not null check (tipo in ('busqueda','record')),
  clave      text not null,
  creado     timestamptz not null default now()
);

alter table public.ingesta_busquedas enable row level security;
alter table public.ingesta_cola      enable row level security;
alter table public.ingesta_pedidos   enable row level security;
revoke all on public.ingesta_busquedas, public.ingesta_cola, public.ingesta_pedidos from anon, authenticated;

-- ---------- Utilidades ----------
create or replace function public.a_numero(t text) returns numeric
language plpgsql immutable set search_path = '' as $$
begin return t::numeric; exception when others then return null; end $$;

create or replace function public.a_fecha(t text) returns timestamptz
language plpgsql immutable set search_path = '' as $$
begin return t::timestamptz; exception when others then return null; end $$;

-- ---------- Parser de un record OCDS (respuesta de /ocds/record/{ocid}) ----------
create or replace function public.dncp_guardar_record(j jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  rec   jsonb := j->'records'->0;
  cr    jsonb := coalesce(j->'records'->0->'compiledRelease', j);
  t     jsonb := cr->'tender';
  v_ocid text := cr->>'ocid';
  v_ent  text := t->'procuringEntity'->>'id';
  v_idll text;
  v_nof  integer;
begin
  if v_ocid is null then raise exception 'record sin ocid'; end if;

  v_idll := coalesce(substring(t->>'id' from '^(\d+)'), substring(v_ocid from '-(\d+)$'));
  v_nof := coalesce(
    (t->>'numberOfTenderers')::integer,
    case when jsonb_typeof(t->'tenderers') = 'array' then jsonb_array_length(t->'tenderers') end,
    nullif((select count(*) from jsonb_array_elements(coalesce(cr->'parties','[]')) p
            where p->'roles' ? 'tenderer'), 0)::integer
  );

  if v_ent is not null then
    insert into public.entidades (id, nombre)
    values (v_ent, coalesce(t->'procuringEntity'->>'name', v_ent))
    on conflict (id) do update set nombre = excluded.nombre, actualizado_en = now();
  end if;

  insert into public.procesos (ocid, id_llamado, entidad_id, titulo, categoria, modalidad, estado,
                               monto_estimado, moneda, fecha_publicacion, fecha_apertura, url_dncp)
  values (
    v_ocid, v_idll, v_ent,
    coalesce(t->>'title', '(sin título)'),
    t->>'mainProcurementCategory',
    coalesce(t->>'procurementMethodDetails', t->>'procurementMethod'),
    coalesce(t->>'statusDetails', t->>'status'),
    public.a_numero(t->'value'->>'amount'),
    coalesce(t->'value'->>'currency', 'PYG'),
    public.a_fecha(coalesce(t->>'datePublished', cr->>'date')),
    public.a_fecha(t->'tenderPeriod'->>'endDate'),
    case when v_idll is not null
      then 'https://www.contrataciones.gov.py/buscador/licitaciones.html?nro_nombre_licitacion=' || v_idll end
  )
  on conflict (ocid) do update set
    id_llamado = excluded.id_llamado, entidad_id = excluded.entidad_id, titulo = excluded.titulo,
    categoria = excluded.categoria, modalidad = excluded.modalidad, estado = excluded.estado,
    monto_estimado = excluded.monto_estimado, moneda = excluded.moneda,
    fecha_publicacion = excluded.fecha_publicacion, fecha_apertura = excluded.fecha_apertura,
    url_dncp = excluded.url_dncp, actualizado_en = now();

  -- Proveedores adjudicados
  insert into public.proveedores (ruc, nombre, es_persona_fisica)
  select distinct on (ruc) ruc, nombre,
         (split_part(ruc, '-', 1)::bigint < 80000000)
  from (
    select coalesce(substring(s->>'id' from '(\d+-\d)\s*$'), s->>'id') as ruc, s->>'name' as nombre
    from jsonb_array_elements(coalesce(cr->'awards','[]')) a,
         jsonb_array_elements(coalesce(a->'suppliers','[]')) s
  ) x
  where ruc ~ '^\d+-\d$' and nombre is not null
  on conflict (ruc) do update set nombre = excluded.nombre, actualizado_en = now();

  -- Adjudicaciones (una fila por adjudicación y proveedor)
  insert into public.adjudicaciones (id, ocid, proveedor_ruc, monto, moneda, fecha, num_oferentes)
  select distinct on (id) id, v_ocid, ruc, monto, moneda, fecha, v_nof
  from (
    select v_ocid || '/' || coalesce(a->>'id', ai::text) || case when ns > 1 then ':' || si else '' end as id,
           case when ruc_raw ~ '^\d+-\d$' then ruc_raw end as ruc,
           public.a_numero(a->'value'->>'amount') as monto,
           coalesce(a->'value'->>'currency', 'PYG') as moneda,
           public.a_fecha(a->>'date') as fecha
    from jsonb_array_elements(coalesce(cr->'awards','[]')) with ordinality aw(a, ai)
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
    fecha = excluded.fecha, num_oferentes = excluded.num_oferentes, actualizado_en = now();

  -- Historial de versiones
  insert into public.versiones_proceso (ocid, release_id, fecha, etiquetas)
  select v_ocid,
         coalesce(r->>'id', regexp_replace(r->>'url', '^.*/', '')),
         coalesce(public.a_fecha(r->>'date'), now()),
         coalesce(array(select jsonb_array_elements_text(coalesce(r->'tag','[]'))), '{}')
  from jsonb_array_elements(coalesce(rec->'releases','[]')) r
  where coalesce(r->>'id', r->>'url') is not null
  on conflict (ocid, release_id) do nothing;
end $$;

-- ---------- Encolar búsquedas ----------
create or replace function public.dncp_encolar_dias(desde date, hasta date default current_date)
returns integer language sql set search_path = '' as $$
  with ins as (
    insert into public.ingesta_busquedas (fecha, pagina)
    select d::date, 1 from generate_series(desde, hasta, interval '1 day') d
    on conflict (fecha, pagina) do update set estado = 'pendiente', intentos = 0, actualizado = now()
      where public.ingesta_busquedas.estado <> 'pedido'
    returning 1)
  select count(*)::integer from ins;
$$;

create or replace function public.dncp_cargar_desde(desde date)
returns integer language sql set search_path = '' as $$
  select public.dncp_encolar_dias(desde, current_date);
$$;

-- ---------- Tick: procesa respuestas y emite nuevos pedidos ----------
create or replace function public.dncp_tick(presupuesto integer default 12)
returns text
language plpgsql
set search_path = ''
as $$
declare
  base constant text := 'https://www.contrataciones.gov.py/datos/api/v3/doc';
  r record;
  j jsonb;
  v_fecha date; v_pag integer; v_tp integer;
  n_ok integer := 0; n_err integer := 0; n_env integer := 0;
  rid bigint;
begin
  if not pg_try_advisory_xact_lock(4242) then return 'ocupado'; end if;

  -- 1) Respuestas recibidas
  for r in
    select p.request_id, p.tipo, p.clave, h.status_code, h.content, h.timed_out, h.error_msg
    from public.ingesta_pedidos p
    join net._http_response h on h.id = p.request_id
  loop
    if r.tipo = 'busqueda' then
      v_fecha := split_part(r.clave, '|', 1)::date;
      v_pag   := split_part(r.clave, '|', 2)::integer;
      if r.status_code = 200 then
        begin
          j := r.content::jsonb;
          insert into public.ingesta_cola (ocid)
          select distinct x->>'ocid' from jsonb_array_elements(coalesce(j->'records','[]')) x
          where x->>'ocid' is not null
          on conflict (ocid) do update set estado = 'pendiente', intentos = 0, detalle = null, actualizado = now()
            where public.ingesta_cola.estado <> 'pedido';
          v_tp := (j->'pagination'->>'total_pages')::integer;
          if v_tp is not null and v_pag < v_tp then
            insert into public.ingesta_busquedas (fecha, pagina) values (v_fecha, v_pag + 1)
            on conflict (fecha, pagina) do update set estado = 'pendiente', actualizado = now();
          end if;
          update public.ingesta_busquedas set estado = 'ok', actualizado = now() where fecha = v_fecha and pagina = v_pag;
        exception when others then
          update public.ingesta_busquedas set estado = 'error', intentos = intentos + 1, actualizado = now()
          where fecha = v_fecha and pagina = v_pag;
        end;
      else
        update public.ingesta_busquedas
        set estado = case when intentos < 5 then 'pendiente' else 'error' end, intentos = intentos + 1, actualizado = now()
        where fecha = v_fecha and pagina = v_pag;
      end if;
    else
      if r.status_code = 200 then
        begin
          perform public.dncp_guardar_record(r.content::jsonb);
          update public.ingesta_cola set estado = 'ok', detalle = null, actualizado = now() where ocid = r.clave;
          n_ok := n_ok + 1;
        exception when others then
          update public.ingesta_cola set estado = 'error', intentos = intentos + 1, detalle = left(sqlerrm, 300), actualizado = now()
          where ocid = r.clave;
          n_err := n_err + 1;
        end;
      else
        update public.ingesta_cola
        set estado = case when intentos < 5 then 'pendiente' else 'error' end, intentos = intentos + 1,
            detalle = coalesce('HTTP ' || r.status_code, r.error_msg, 'sin respuesta'), actualizado = now()
        where ocid = r.clave;
      end if;
    end if;
    delete from public.ingesta_pedidos where request_id = r.request_id;
    begin delete from net._http_response where id = r.request_id; exception when others then null; end;
  end loop;

  -- 2) Pedidos colgados (> 15 min sin respuesta) vuelven a la cola
  for r in delete from public.ingesta_pedidos where creado < now() - interval '15 minutes' returning tipo, clave loop
    if r.tipo = 'record' then
      update public.ingesta_cola set estado = 'pendiente', actualizado = now() where ocid = r.clave;
    else
      update public.ingesta_busquedas set estado = 'pendiente', actualizado = now()
      where fecha = split_part(r.clave, '|', 1)::date and pagina = split_part(r.clave, '|', 2)::integer;
    end if;
  end loop;

  -- 3) Nuevos pedidos, respetando el límite de la DNCP (15/min)
  for r in
    select fecha, pagina from public.ingesta_busquedas where estado = 'pendiente'
    order by fecha desc, pagina limit least(3, presupuesto)
  loop
    rid := net.http_get(
      url := base || '/search/processes?tipo_fecha=fecha_release&items_per_page=1000'
             || '&fecha_desde=' || r.fecha || '&fecha_hasta=' || r.fecha || '&page=' || r.pagina,
      timeout_milliseconds := 60000);
    insert into public.ingesta_pedidos (request_id, tipo, clave) values (rid, 'busqueda', r.fecha || '|' || r.pagina);
    update public.ingesta_busquedas set estado = 'pedido', actualizado = now() where fecha = r.fecha and pagina = r.pagina;
    n_env := n_env + 1;
  end loop;

  for r in
    select ocid from public.ingesta_cola where estado = 'pendiente'
    order by actualizado limit greatest(presupuesto - n_env, 0)
  loop
    rid := net.http_get(url := base || '/ocds/record/' || r.ocid, timeout_milliseconds := 60000);
    insert into public.ingesta_pedidos (request_id, tipo, clave) values (rid, 'record', r.ocid);
    update public.ingesta_cola set estado = 'pedido', actualizado = now() where ocid = r.ocid;
    n_env := n_env + 1;
  end loop;

  return format('guardados=%s errores=%s pedidos=%s', n_ok, n_err, n_env);
end $$;

revoke execute on function public.dncp_guardar_record(jsonb), public.dncp_tick(integer),
  public.dncp_encolar_dias(date, date), public.dncp_cargar_desde(date) from public, anon, authenticated;

-- ---------- Estado de la ingesta (solo para el panel de Supabase) ----------
create or replace view public.ingesta_estado with (security_invoker = true) as
select 'procesos' as cola, estado, count(*) as cantidad, max(actualizado) as ultimo from public.ingesta_cola group by estado
union all
select 'busquedas', estado, count(*), max(actualizado) from public.ingesta_busquedas group by estado;
revoke all on public.ingesta_estado from anon, authenticated;

-- ---------- Programación ----------
select cron.schedule('dncp-tick',    '* * * * *', $$select public.dncp_tick()$$);
select cron.schedule('dncp-buscar',  '7 * * * *', $$select public.dncp_encolar_dias(current_date - 1)$$);

-- Primera carga: últimos 30 días
select public.dncp_encolar_dias(current_date - 30);
