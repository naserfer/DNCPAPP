-- =====================================================================
-- 012 · Licitaciones abiertas ahora + con qué plata se paga cada compra
--
-- 1. llamados: los llamados que hoy reciben ofertas (misma API de la DNCP,
--    búsqueda por fecha de entrega de ofertas). Se renuevan cada 3 horas.
-- 2. financiamiento: fuente de financiamiento de cada adjudicación, tal como
--    la DNCP la publica en el contrato (10 Tesoro, 20 crédito público,
--    30 recursos institucionales). Requiere volver a pasar los procesos.
-- Idempotente.
-- =====================================================================

-- ---------- 1. Llamados abiertos ----------
create table if not exists public.llamados (
  ocid           text primary key,
  id_llamado     text,
  titulo         text not null,
  entidad_id     text,
  entidad_nombre text,
  monto          numeric,
  moneda         text,
  modalidad      text,
  categoria      text,
  rubro          text,
  publicado      timestamptz,
  cierre         timestamptz not null,
  url_dncp       text,
  visto          timestamptz not null default now()
);
create index if not exists llamados_cierre_idx on public.llamados (cierre);
create table if not exists public.llamados_pedidos (
  request_id bigint primary key,
  pagina     integer not null,
  creado     timestamptz not null default now()
);
alter table public.llamados enable row level security;
alter table public.llamados_pedidos enable row level security;
do $$ begin
  create policy "lectura publica" on public.llamados for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
revoke all on public.llamados_pedidos from anon, authenticated;
revoke insert, update, delete, truncate on public.llamados from anon, authenticated;
grant select on public.llamados to anon, authenticated;

create or replace function public.llamados_url(pagina integer)
returns text language sql stable set search_path = ''
as $$
  select 'https://www.contrataciones.gov.py/datos/api/v3/doc/search/processes?tipo_fecha=entrega_ofertas&items_per_page=200'
      || '&fecha_desde=' || (now() at time zone 'America/Asuncion')::date
      || '&fecha_hasta=' || ((now() at time zone 'America/Asuncion')::date + 60) || '&page=' || pagina;
$$;

create or replace function public.llamados_pedir()
returns text language plpgsql set search_path = ''
as $$
declare rid bigint;
begin
  if exists (select 1 from public.llamados_pedidos where creado > now() - interval '20 minutes') then return 'en curso'; end if;
  delete from public.llamados_pedidos;
  rid := net.http_get(url := public.llamados_url(1), timeout_milliseconds := 60000);
  insert into public.llamados_pedidos (request_id, pagina) values (rid, 1);
  return 'pedido';
end $$;

create or replace function public.llamados_procesar()
returns text language plpgsql set search_path = ''
as $$
declare r record; j jsonb; v_tp integer; rid bigint; n integer := 0; fin boolean := false;
begin
  for r in
    select p.request_id, p.pagina, h.status_code, h.content
    from public.llamados_pedidos p join net._http_response h on h.id = p.request_id
  loop
    if r.status_code = 200 then
      begin
        j := r.content::jsonb;
        insert into public.llamados (ocid, id_llamado, titulo, entidad_id, entidad_nombre, monto, moneda, modalidad, categoria, rubro, publicado, cierre, url_dncp, visto)
        select distinct on (c->>'ocid')
          c->>'ocid',
          coalesce(substring(c->>'ocid' from '^ocds-[^-]+-(\d+)'), substring(t->>'id' from '^(\d+)')),
          left(coalesce(nullif(trim(t->>'title'), ''), '(sin título)'), 400),
          t->'procuringEntity'->>'id', t->'procuringEntity'->>'name',
          public.a_numero(t->'value'->>'amount'), coalesce(t->'value'->>'currency', 'PYG'),
          t->>'procurementMethodDetails', t->>'mainProcurementCategoryDetails',
          left(t->'items'->0->'classification'->>'id', 2),
          public.a_fecha(t->'tenderPeriod'->>'startDate'), public.a_fecha(t->'tenderPeriod'->>'endDate'),
          case when t->>'id' is not null then 'https://www.contrataciones.gov.py/licitaciones/convocatoria/' || (t->>'id') || '.html'
               else 'https://www.contrataciones.gov.py/buscador/licitaciones.html?nro_nombre_licitacion='
                    || coalesce(substring(c->>'ocid' from '^ocds-[^-]+-(\d+)'), '') end,
          now()
        from jsonb_array_elements(coalesce(j->'records', '[]')) x,
             lateral (select x->'compiledRelease' as c) cc, lateral (select c->'tender' as t) tt
        where c->>'ocid' is not null and t->>'status' = 'active'
          and public.a_fecha(t->'tenderPeriod'->>'endDate') > now()
        on conflict (ocid) do update set
          titulo = excluded.titulo, entidad_id = excluded.entidad_id, entidad_nombre = excluded.entidad_nombre,
          monto = excluded.monto, moneda = excluded.moneda, modalidad = excluded.modalidad, categoria = excluded.categoria,
          rubro = excluded.rubro, publicado = excluded.publicado, cierre = excluded.cierre, url_dncp = excluded.url_dncp, visto = now();
        get diagnostics n = row_count;
        v_tp := (j->'pagination'->>'total_pages')::integer;
        if v_tp is not null and r.pagina < least(v_tp, 15) then
          rid := net.http_get(url := public.llamados_url(r.pagina + 1), timeout_milliseconds := 60000);
          insert into public.llamados_pedidos (request_id, pagina) values (rid, r.pagina + 1);
        else
          fin := true;
        end if;
      exception when others then null;
      end;
    elsif r.status_code = 404 then
      fin := true;
    end if;
    delete from public.llamados_pedidos where request_id = r.request_id;
    begin delete from net._http_response where id = r.request_id; exception when others then null; end;
  end loop;
  -- los que ya cerraron, o que dejaron de aparecer como abiertos (cancelados, suspendidos)
  delete from public.llamados where cierre < now();
  if fin then delete from public.llamados where visto < now() - interval '7 hours'; end if;
  return format('guardados=%s', n);
end $$;
revoke execute on function public.llamados_pedir(), public.llamados_procesar(), public.llamados_url(integer) from public, anon, authenticated;

create or replace function public.llamados_abiertos(p_rubro text default null, p_q text default null, limite integer default 60)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  with b as (select * from public.llamados where cierre > now()),
  f as (
    select * from b
    where (p_rubro is null or rubro = p_rubro)
      and (p_q is null or length(trim(p_q)) < 3
           or public.normalizar(titulo || ' ' || coalesce(entidad_nombre, '')) like '%' || replace(replace(public.normalizar(trim(p_q)), '%', ''), '_', ' ') || '%'))
  select jsonb_build_object(
    'total', (select count(*) from b),
    'monto', (select coalesce(sum(monto), 0) from b where moneda = 'PYG'),
    'esta_semana', (select count(*) from b where cierre < now() + interval '7 days'),
    'actualizado', (select max(visto) from b),
    'rubros', (select coalesce(jsonb_agg(x order by x.cantidad desc), '[]'::jsonb)
               from (select rubro as id, count(*) as cantidad from b where rubro is not null group by 1) x),
    'encontrados', (select count(*) from f),
    'lista', (select coalesce(jsonb_agg(y order by y.cierre), '[]'::jsonb) from (
        select ocid, titulo, entidad_id, entidad_nombre, monto, moneda, modalidad, categoria, rubro, publicado, cierre, url_dncp
        from f order by cierre limit least(greatest(limite, 1), 200)) y));
$$;
grant execute on function public.llamados_abiertos(text, text, integer) to anon, authenticated;

select cron.schedule('llamados-pedir', '23 */3 * * *', $$select public.llamados_pedir()$$);
select cron.schedule('llamados-procesar', '*/2 * * * *', $$select public.llamados_procesar()$$);
select public.llamados_pedir();

-- ---------- 2. Fuente de financiamiento ----------
create table if not exists public.financiamiento (
  adj_id text not null,
  ocid   text not null,
  fuente text not null,
  monto  numeric not null,
  primary key (adj_id, fuente)
);
create index if not exists financiamiento_ocid_idx on public.financiamiento (ocid);
alter table public.financiamiento enable row level security;
do $$ begin
  create policy "lectura publica" on public.financiamiento for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
revoke insert, update, delete, truncate on public.financiamiento from anon, authenticated;
grant select on public.financiamiento to anon, authenticated;

do $do$
declare d text;
begin
  select pg_get_functiondef('public.dncp_guardar_record(jsonb)'::regprocedure) into d;
  if position('public.financiamiento' in d) = 0 then
    d := replace(d, $x$  insert into public.versiones_proceso$x$, $x$  delete from public.financiamiento where ocid = v_ocid;
  insert into public.financiamiento (adj_id, ocid, fuente, monto)
  select v_ocid || '/' || (k->>'awardID'), v_ocid, b->'classifications'->>'fuente_financiamiento',
         sum(public.a_numero(b->'measures'->>'monto_a_utilizar'))
  from jsonb_array_elements(coalesce(cr->'contracts', '[]')) k,
       jsonb_array_elements(coalesce(k->'implementation'->'financialProgress'->'breakdown', '[]')) b
  where k->>'awardID' is not null and coalesce(k->>'status', 'active') <> 'cancelled'
    and b->'classifications'->>'fuente_financiamiento' is not null
    and public.a_numero(b->'measures'->>'monto_a_utilizar') > 0
  group by 1, 2, 3
  on conflict (adj_id, fuente) do nothing;

  insert into public.versiones_proceso$x$);
    execute d;
  end if;
end $do$;
revoke execute on function public.dncp_guardar_record(jsonb) from public, anon, authenticated;

-- Totales por fuente, solo sobre adjudicaciones que están en el período.
create or replace function public.fuentes(dias integer default 30)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.monto desc), '[]'::jsonb) from (
    select f.fuente as id, sum(f.monto) as monto, count(distinct f.adj_id) as compras
    from public.financiamiento f
    join (select distinct adj_id from public.adj_mv where fecha >= public.ventana(dias) and fecha <= now()) m on m.adj_id = f.adj_id
    group by 1) x;
$$;
grant execute on function public.fuentes(integer) to anon, authenticated;

-- Volver a pasar los procesos ya cargados para traer la fuente de financiamiento.
update public.ingesta_cola set estado = 'pendiente', intentos = 0, detalle = null, actualizado = now() where estado in ('ok', 'error');
notify pgrst, 'reload schema';
