-- 013 · Llamados abiertos: la búsqueda de la DNCP devuelve un resumen (sin estado OCDS, monto ni ítems).
-- Se filtra por el estado en texto y el monto y el rubro se completan pidiendo cada proceso (4 cada 2 minutos).
alter table public.llamados add column if not exists detalle_ok boolean not null default false;
alter table public.llamados add column if not exists intentos integer not null default 0;
alter table public.llamados_pedidos add column if not exists ocid text;

create or replace function public.llamados_procesar()
returns text language plpgsql set search_path = ''
as $$
declare r record; j jsonb; t jsonb; v_tp integer; rid bigint; n integer := 0; m integer := 0; fin boolean := false;
begin
  if not pg_try_advisory_xact_lock(4243) then return 'ocupado'; end if;
  for r in
    select p.request_id, p.pagina, p.ocid, h.status_code, h.content
    from public.llamados_pedidos p join net._http_response h on h.id = p.request_id
  loop
    if r.ocid is not null then
      -- detalle de un llamado
      if r.status_code = 200 then
        begin
          j := r.content::jsonb;
          t := coalesce(j->'records'->0->'compiledRelease', j)->'tender';
          update public.llamados set
            monto = coalesce(public.a_numero(t->'value'->>'amount'), monto),
            moneda = coalesce(t->'value'->>'currency', moneda, 'PYG'),
            rubro = coalesce(left(t->'items'->0->'classification'->>'id', 2), rubro),
            detalle_ok = true
          where ocid = r.ocid;
          m := m + 1;
        exception when others then
          update public.llamados set intentos = intentos + 1 where ocid = r.ocid;
        end;
      else
        update public.llamados set intentos = intentos + 1 where ocid = r.ocid;
      end if;
    elsif r.status_code = 200 then
      begin
        j := r.content::jsonb;
        insert into public.llamados (ocid, id_llamado, titulo, entidad_id, entidad_nombre, modalidad, categoria, publicado, cierre, url_dncp, visto)
        select distinct on (c->>'ocid')
          c->>'ocid',
          coalesce(substring(c->>'ocid' from '^ocds-[^-]+-(\d+)'), substring(tt.t->>'id' from '^(\d+)')),
          left(coalesce(nullif(trim(tt.t->>'title'), ''), '(sin título)'), 400),
          tt.t->'procuringEntity'->>'id', tt.t->'procuringEntity'->>'name',
          tt.t->>'procurementMethodDetails', tt.t->>'mainProcurementCategoryDetails',
          public.a_fecha(tt.t->'tenderPeriod'->>'startDate'), public.a_fecha(tt.t->'tenderPeriod'->>'endDate'),
          case when tt.t->>'id' is not null then 'https://www.contrataciones.gov.py/licitaciones/convocatoria/' || (tt.t->>'id') || '.html'
               else 'https://www.contrataciones.gov.py/buscador/licitaciones.html?nro_nombre_licitacion='
                    || coalesce(substring(c->>'ocid' from '^ocds-[^-]+-(\d+)'), '') end,
          now()
        from jsonb_array_elements(coalesce(j->'records', '[]')) x,
             lateral (select x->'compiledRelease' as c) cc, lateral (select cc.c->'tender' as t) tt
        where c->>'ocid' is not null
          and (tt.t->>'status' = 'active' or tt.t->>'statusDetails' ilike 'En Convocatoria%')
          and public.a_fecha(tt.t->'tenderPeriod'->>'endDate') > now()
        on conflict (ocid) do update set
          titulo = excluded.titulo, entidad_id = excluded.entidad_id, entidad_nombre = excluded.entidad_nombre,
          modalidad = excluded.modalidad, categoria = excluded.categoria,
          publicado = excluded.publicado, cierre = excluded.cierre, url_dncp = excluded.url_dncp, visto = now();
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
  delete from public.llamados_pedidos where creado < now() - interval '15 minutes';
  delete from public.llamados where cierre < now();
  if fin then delete from public.llamados where visto < now() - interval '7 hours'; end if;

  -- completar monto y rubro de a poco, para no pasar el límite de la DNCP
  for r in
    select l.ocid from public.llamados l
    where not l.detalle_ok and l.intentos < 4
      and not exists (select 1 from public.llamados_pedidos p where p.ocid = l.ocid)
    order by l.cierre limit 4
  loop
    rid := net.http_get(url := 'https://www.contrataciones.gov.py/datos/api/v3/doc/ocds/record/' || r.ocid, timeout_milliseconds := 60000);
    insert into public.llamados_pedidos (request_id, pagina, ocid) values (rid, 0, r.ocid);
  end loop;
  return format('llamados=%s detalles=%s', n, m);
end $$;
revoke execute on function public.llamados_procesar() from public, anon, authenticated;

create or replace function public.llamados_pedir()
returns text language plpgsql set search_path = ''
as $$
declare rid bigint;
begin
  if exists (select 1 from public.llamados_pedidos where ocid is null and creado > now() - interval '20 minutes') then return 'en curso'; end if;
  rid := net.http_get(url := public.llamados_url(1), timeout_milliseconds := 60000);
  insert into public.llamados_pedidos (request_id, pagina) values (rid, 1);
  return 'pedido';
end $$;
revoke execute on function public.llamados_pedir() from public, anon, authenticated;

-- 12 + 2 por minuto para los llamados: bajo el límite de 15.
select cron.schedule('dncp-tick', '* * * * *', $$select public.dncp_tick(12)$$);
select public.llamados_pedir();
