-- =====================================================================
-- DNCPAPP · 004 · Altas de funcionarios (nómina SFP / MEF-VCHGO)
-- Fuente: datos.sfp.gov.py (API pública de la nómina mensual, sin credenciales).
--
-- Privacidad: solo se guardan registros con año de ingreso = año del mes,
-- la cédula se guarda como hash (para comparar meses) y NO se publican
-- nombres, cédulas, fechas de nacimiento ni datos de discapacidad.
-- Lo público son agregados por institución.
--
--   Diario 06:13  → se encolan el mes actual y los tres anteriores
--   Cada minuto   → se descargan hasta 2 páginas de 500 registros
--   Uso web       → supabase.rpc('altas_funcionarios')
-- Idempotente.
-- =====================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;
create extension if not exists pgcrypto with schema extensions;

-- ---------- Datos privados ----------
create table if not exists public.sfp_ingresos (
  anho        integer not null,
  mes         integer not null,
  oee         text not null,               -- nivel-entidad-oee
  oee_nombre  text not null,
  doc_hash    text not null,
  estado      text,                        -- CONTRATADO / PERMANENTE / COMISIONADO
  devengado   numeric(16,0) not null default 0,
  primary key (anho, mes, oee, doc_hash)
);

create table if not exists public.sfp_paginas (
  anho        integer not null,
  mes         integer not null,
  inicio      integer not null,
  estado      text not null default 'pendiente' check (estado in ('pendiente','pedido','ok','error')),
  intentos    integer not null default 0,
  total       integer,
  actualizado timestamptz not null default now(),
  primary key (anho, mes, inicio)
);

create table if not exists public.sfp_pedidos (
  request_id bigint primary key,
  anho integer not null, mes integer not null, inicio integer not null,
  creado timestamptz not null default now()
);

alter table public.sfp_ingresos enable row level security;
alter table public.sfp_paginas  enable row level security;
alter table public.sfp_pedidos  enable row level security;
revoke all on public.sfp_ingresos, public.sfp_paginas, public.sfp_pedidos from anon, authenticated;

-- ---------- URL de la API (formato DataTables) ----------
create or replace function public.sfp_url(p_anho integer, p_mes integer, p_inicio integer, p_largo integer default 500)
returns text language plpgsql immutable set search_path = '' as $$
declare
  cols text[] := array['anho','mes','nivel','descripcionNivel','entidad','descripcionEntidad','oee','descripcionOee',
    'documento','nombres','apellidos','presupuestado','devengado','sexo','estado','anhoIngreso','discapacidad',
    'tipoDiscapacidad','fechaNacimiento','cargaHoraria'];
  s text := 'draw=1';
  c text; i integer := 0; v text; ex text;
begin
  foreach c in array cols loop
    v  := case c when 'anho' then p_anho::text when 'mes' then p_mes::text when 'anhoIngreso' then p_anho::text else '' end;
    ex := case c when 'descripcionNivel' then 'nivel' when 'descripcionEntidad' then 'entidad' when 'descripcionOee' then 'oee' else '' end;
    s := s || format('&columns%%5B%s%%5D%%5Bdata%%5D=%s&columns%%5B%s%%5D%%5Bname%%5D=&columns%%5B%s%%5D%%5Bsearchable%%5D=true'
                     '&columns%%5B%s%%5D%%5Borderable%%5D=true&columns%%5B%s%%5D%%5Bsearch%%5D%%5Bvalue%%5D=%s'
                     '&columns%%5B%s%%5D%%5Bsearch%%5D%%5Bregex%%5D=false&columns%%5B%s%%5D%%5BextraData%%5D=%s',
                     i, c, i, i, i, i, v, i, i, ex);
    i := i + 1;
  end loop;
  s := s || format('&order%%5B0%%5D%%5Bcolumn%%5D=0&order%%5B0%%5D%%5Bdir%%5D=desc&start=%s&length=%s&search%%5Bvalue%%5D=&search%%5Bregex%%5D=false',
                   p_inicio, p_largo);
  return 'https://datos.sfp.gov.py/api/rest/funcionarios/data?' || s;
end $$;

-- ---------- Guardar una página ----------
create or replace function public.sfp_guardar_pagina(p_anho integer, p_mes integer, j jsonb)
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  insert into public.sfp_ingresos (anho, mes, oee, oee_nombre, doc_hash, estado, devengado)
  select p_anho, p_mes, oee, max(oee_nombre), doc_hash, max(estado), sum(dev)
  from (
    select concat_ws('-', d->>'nivel', d->>'entidad', d->>'oee') as oee,
           coalesce(d->>'descripcionOee', 'Sin nombre') as oee_nombre,
           encode(extensions.digest('dncpapp:' || (d->>'documento'), 'sha256'), 'hex') as doc_hash,
           upper(d->>'estado') as estado,
           coalesce(nullif(regexp_replace(coalesce(d->>'devengado', '0'), '[^0-9]', '', 'g'), '')::numeric, 0) as dev
    from jsonb_array_elements(coalesce(j->'data', '[]')) d
    where d->>'documento' is not null
      and (d->>'anhoIngreso')::text = p_anho::text
  ) x
  group by oee, doc_hash
  on conflict (anho, mes, oee, doc_hash) do update set
    oee_nombre = excluded.oee_nombre, estado = excluded.estado, devengado = excluded.devengado;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Encolar meses ----------
create or replace function public.sfp_encolar_mes(p_anho integer, p_mes integer)
returns void language sql set search_path = '' as $$
  insert into public.sfp_paginas (anho, mes, inicio) values (p_anho, p_mes, 0)
  on conflict (anho, mes, inicio) do update set estado = 'pendiente', intentos = 0, actualizado = now()
    where public.sfp_paginas.estado <> 'pedido';
$$;

create or replace function public.sfp_encolar_recientes()
returns void language plpgsql set search_path = '' as $$
declare d date;
begin
  for d in select (date_trunc('month', current_date) - make_interval(months => k))::date from generate_series(0, 3) k loop
    perform public.sfp_encolar_mes(extract(year from d)::integer, extract(month from d)::integer);
  end loop;
end $$;

-- ---------- Tick ----------
create or replace function public.sfp_tick(paginas integer default 2)
returns text language plpgsql set search_path = '' as $$
declare r record; j jsonb; tot integer; n_ok integer := 0; n_env integer := 0; rid bigint; k integer;
begin
  if not pg_try_advisory_xact_lock(4343) then return 'ocupado'; end if;

  for r in
    select p.*, h.status_code, h.content
    from public.sfp_pedidos p join net._http_response h on h.id = p.request_id
  loop
    if r.status_code = 200 and left(ltrim(coalesce(r.content, '')), 1) = '{' then
      begin
        j := r.content::jsonb;
        perform public.sfp_guardar_pagina(r.anho, r.mes, j);
        tot := (j->>'recordsFiltered')::integer;
        update public.sfp_paginas set estado = 'ok', total = tot, actualizado = now()
        where anho = r.anho and mes = r.mes and inicio = r.inicio;
        -- la primera página encola el resto
        if r.inicio = 0 and tot is not null then
          k := 500;
          while k < tot loop
            insert into public.sfp_paginas (anho, mes, inicio) values (r.anho, r.mes, k)
            on conflict (anho, mes, inicio) do update set estado = 'pendiente', intentos = 0, actualizado = now()
              where public.sfp_paginas.estado <> 'pedido';
            k := k + 500;
          end loop;
        end if;
        n_ok := n_ok + 1;
      exception when others then
        update public.sfp_paginas set estado = 'error', intentos = intentos + 1, actualizado = now()
        where anho = r.anho and mes = r.mes and inicio = r.inicio;
      end;
    else
      update public.sfp_paginas
      set estado = case when intentos < 5 then 'pendiente' else 'error' end, intentos = intentos + 1, actualizado = now()
      where anho = r.anho and mes = r.mes and inicio = r.inicio;
    end if;
    delete from public.sfp_pedidos where request_id = r.request_id;
    begin delete from net._http_response where id = r.request_id; exception when others then null; end;
  end loop;

  for r in delete from public.sfp_pedidos where creado < now() - interval '15 minutes' returning anho, mes, inicio loop
    update public.sfp_paginas set estado = 'pendiente', actualizado = now()
    where anho = r.anho and mes = r.mes and inicio = r.inicio;
  end loop;

  for r in
    select anho, mes, inicio from public.sfp_paginas where estado = 'pendiente'
    order by anho desc, mes desc, inicio limit paginas
  loop
    rid := net.http_get(url := public.sfp_url(r.anho, r.mes, r.inicio), timeout_milliseconds := 120000);
    insert into public.sfp_pedidos (request_id, anho, mes, inicio) values (rid, r.anho, r.mes, r.inicio);
    update public.sfp_paginas set estado = 'pedido', actualizado = now()
    where anho = r.anho and mes = r.mes and inicio = r.inicio;
    n_env := n_env + 1;
  end loop;

  return format('paginas_ok=%s pedidos=%s', n_ok, n_env);
end $$;

revoke execute on function public.sfp_url(integer, integer, integer, integer), public.sfp_guardar_pagina(integer, integer, jsonb),
  public.sfp_encolar_mes(integer, integer), public.sfp_encolar_recientes(), public.sfp_tick(integer)
  from public, anon, authenticated;

-- ---------- Público: altas por institución (solo agregados) ----------
-- Alta = persona con año de ingreso = año del mes que figura en el mes y no figuraba en el anterior
-- (en enero, todas las que ingresaron ese año). Solo se consideran meses completamente descargados.
create or replace function public.altas_funcionarios(p_anho integer default null, p_mes integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_anho integer := p_anho; v_mes integer := p_mes; pa integer; pm integer; res jsonb;
begin
  if v_anho is null then
    -- último mes con todas sus páginas descargadas y con al menos 95% del volumen del mes anterior
    select m.anho, m.mes into v_anho, v_mes
    from (select anho, mes, bool_and(estado = 'ok') as completo, max(total) as total
          from public.sfp_paginas group by anho, mes) m
    left join (select anho, mes, max(total) as total from public.sfp_paginas group by anho, mes) prev
      on (prev.anho, prev.mes) = (case when m.mes = 1 then m.anho - 1 else m.anho end, case when m.mes = 1 then 12 else m.mes - 1 end)
    where m.completo and coalesce(m.total, 0) > 0 and (prev.total is null or m.mes = 1 or m.total >= prev.total * 0.95)
    order by m.anho desc, m.mes desc limit 1;
  end if;
  if v_anho is null then return null; end if;

  pa := case when v_mes = 1 then v_anho - 1 else v_anho end;
  pm := case when v_mes = 1 then 12 else v_mes - 1 end;

  with actual as (select * from public.sfp_ingresos where anho = v_anho and mes = v_mes),
  previo as (select oee, doc_hash from public.sfp_ingresos where anho = pa and mes = pm and v_mes <> 1),
  oee_prev as (select distinct oee from previo),
  altas as (
    select a.* from actual a
    where not exists (select 1 from previo p where p.oee = a.oee and p.doc_hash = a.doc_hash)
      and (v_mes = 1 or exists (select 1 from oee_prev o where o.oee = a.oee))
  ),
  por_oee as (
    select oee, max(oee_nombre) as nombre, count(*) as altas,
           count(*) filter (where estado = 'CONTRATADO') as contratados,
           count(*) filter (where estado = 'PERMANENTE') as permanentes,
           sum(devengado) as devengado
    from altas group by oee
  )
  select jsonb_build_object(
    'anho', v_anho, 'mes', v_mes,
    'total', (select count(*) from altas),
    'contratados', (select count(*) from altas where estado = 'CONTRATADO'),
    'permanentes', (select count(*) from altas where estado = 'PERMANENTE'),
    'devengado', (select coalesce(sum(devengado), 0) from altas),
    'instituciones', (select count(*) from por_oee),
    'sin_comparacion', (select count(distinct oee) from actual a where v_mes <> 1 and not exists (select 1 from oee_prev o where o.oee = a.oee)),
    'top', coalesce((select jsonb_agg(x order by x.altas desc) from (select * from por_oee order by altas desc limit 10) x), '[]'::jsonb)
  ) into res;
  return res;
end $$;

grant execute on function public.altas_funcionarios(integer, integer) to anon, authenticated;

-- ---------- Programación ----------
select cron.schedule('sfp-tick',    '* * * * *',  $$select public.sfp_tick()$$);
select cron.schedule('sfp-encolar', '13 6 * * *', $$select public.sfp_encolar_recientes()$$);
select public.sfp_encolar_recientes();
