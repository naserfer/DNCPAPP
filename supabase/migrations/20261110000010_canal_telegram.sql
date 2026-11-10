-- =====================================================================
-- DNCPAPP · 010 · Canal de avisos por Telegram (gratis, sin guardar datos de nadie)
--
-- Cada lunes a las 9:00 (hora de Paraguay) se publica el resumen de la semana
-- en un canal de Telegram. Queda inactivo hasta que se configure:
--
--   1. En Telegram, hablar con @BotFather → /newbot → copiar el token.
--   2. Crear un canal público y agregar el bot como administrador.
--   3. En el SQL Editor de Supabase (NO en un chat), ejecutar:
--        select vault.create_secret('EL_TOKEN_DEL_BOT', 'telegram_bot_token');
--        select public.config_poner('telegram_chat', '@nombre_del_canal');
--        select public.config_poner('telegram_canal', 'https://t.me/nombre_del_canal');
--   4. Probar:  select public.telegram_publicar();
-- Idempotente.
-- =====================================================================

create table if not exists public.config (clave text primary key, valor text not null);
alter table public.config enable row level security;
do $$ begin
  create policy "lectura publica" on public.config for select to anon, authenticated
    using (clave in ('telegram_canal'));
exception when duplicate_object then null; end $$;
revoke insert, update, delete, truncate on public.config from anon, authenticated;
grant select on public.config to anon, authenticated;

create or replace function public.config_poner(p_clave text, p_valor text)
returns void language sql set search_path = '' as $$
  insert into public.config (clave, valor) values (p_clave, p_valor)
  on conflict (clave) do update set valor = excluded.valor;
$$;
revoke execute on function public.config_poner(text, text) from public, anon, authenticated;

create or replace function public.monto_corto(m numeric)
returns text language sql immutable set search_path = '' as $$
  select 'Gs. ' || case
    when m >= 1e12 then replace(to_char(m / 1e12, 'FM999990.0'), '.', ',') || ' billones'
    when m >= 1e9  then replace(to_char(m / 1e9,  'FM999990.0'), '.', ',') || ' mil millones'
    when m >= 1e6  then to_char(round(m / 1e6), 'FM999G999') || ' millones'
    else to_char(round(m), 'FM999G999G999') end;
$$;

-- Texto del resumen semanal (HTML simple de Telegram).
create or replace function public.telegram_resumen()
returns text language plpgsql stable set search_path = '' as $$
declare r jsonb := public.resumen_semanal(7); c jsonb; t text; sitio constant text := 'https://contratos-abiertos.pages.dev';
  esc text;
begin
  if (r->>'adjudicaciones')::int = 0 then return null; end if;
  t := '<b>Contratos Abiertos · resumen de la semana</b>' || E'\n\n'
    || 'El Estado paraguayo adjudicó <b>' || public.monto_corto((r->>'monto_total')::numeric) || '</b> en '
    || (r->>'adjudicaciones') || ' adjudicaciones de ' || (r->>'instituciones') || ' instituciones a '
    || (r->>'proveedores') || ' proveedores.';
  c := r->'mayores'->0;
  if c is not null then
    esc := replace(replace(replace(left(coalesce(c->>'titulo', 'Compra pública'), 140), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
    t := t || E'\n\n' || '<b>La compra más grande:</b> ' || public.monto_corto((c->>'monto')::numeric) || E'\n' || esc
      || E'\n' || replace(coalesce(c->>'entidad_nombre', ''), '&', '&amp;') || ' → ' || replace(coalesce(c->>'proveedor_nombre', ''), '&', '&amp;');
  end if;
  if (r->>'con_dato_oferentes')::int >= 5 then
    t := t || E'\n\n' || 'En ' || round(100.0 * (r->>'un_solo_oferente')::int / (r->>'con_dato_oferentes')::int)
      || ' % de las licitaciones con dato se presentó un solo oferente.';
  end if;
  return t || E'\n\n' || 'Mirá el detalle: ' || sitio;
end $$;
revoke execute on function public.telegram_resumen() from public, anon, authenticated;

create or replace function public.telegram_publicar()
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text; v_chat text; v_texto text; rid bigint;
begin
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v_token using 'telegram_bot_token';
  exception when others then v_token := null; end;
  select valor into v_chat from public.config where clave = 'telegram_chat';
  if v_token is null or v_chat is null then return 'sin configurar'; end if;
  v_texto := public.telegram_resumen();
  if v_texto is null then return 'sin datos'; end if;
  rid := net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object('chat_id', v_chat, 'text', v_texto, 'parse_mode', 'HTML'),
    headers := '{"Content-Type": "application/json"}'::jsonb);
  return 'enviado (pedido ' || rid || ')';
end $$;
revoke execute on function public.telegram_publicar() from public, anon, authenticated;

-- Lunes 12:00 UTC = 9:00 en Paraguay
select cron.schedule('telegram-semanal', '0 12 * * 1', $$select public.telegram_publicar()$$);
notify pgrst, 'reload schema';
