-- =====================================================================
-- DNCPAPP · 001 · Esquema inicial
-- Pegar completo en Supabase → SQL Editor → Run.
-- Es idempotente: se puede ejecutar más de una vez sin romper nada.
--
-- Nota: los campos son una versión inicial. Se ajustarán cuando la
-- fase 0 confirme qué devuelve la API v3 de la DNCP (docs/campos-api.md).
-- =====================================================================

-- ---------- Extensiones ----------
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Normaliza texto para búsqueda: minúsculas y sin acentos.
-- Wrapper IMMUTABLE para poder usarlo en columnas generadas e índices.
create or replace function public.normalizar(texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(texto, '')));
$$;

-- ---------- Entidades convocantes (instituciones) ----------
create table if not exists public.entidades (
  id              text primary key,             -- id de la entidad en la DNCP
  nombre          text not null,
  nombre_busqueda text generated always as (public.normalizar(nombre)) stored,
  actualizado_en  timestamptz not null default now()
);

-- ---------- Proveedores ----------
create table if not exists public.proveedores (
  ruc               text primary key,
  nombre            text not null,
  es_persona_fisica boolean,                    -- para minimizar exposición (ver PLAN.md §7)
  nombre_busqueda   text generated always as (public.normalizar(nombre)) stored,
  actualizado_en    timestamptz not null default now()
);

-- ---------- Procesos de contratación (llamados) ----------
create table if not exists public.procesos (
  ocid              text primary key,           -- identificador OCDS
  id_llamado        text,                       -- id del llamado en el portal DNCP
  entidad_id        text references public.entidades(id),
  titulo            text not null,
  titulo_busqueda   text generated always as (public.normalizar(titulo)) stored,
  categoria         text,
  modalidad         text,
  estado            text,
  monto_estimado    numeric(20,2),
  moneda            text default 'PYG',
  fecha_publicacion timestamptz,
  fecha_apertura    timestamptz,
  url_dncp          text,                       -- enlace al proceso oficial
  actualizado_en    timestamptz not null default now()
);

-- ---------- Adjudicaciones ----------
create table if not exists public.adjudicaciones (
  id             text primary key,              -- id de la adjudicación (award) en OCDS
  ocid           text not null references public.procesos(ocid) on delete cascade,
  proveedor_ruc  text references public.proveedores(ruc),
  monto          numeric(20,2),
  moneda         text default 'PYG',
  fecha          timestamptz,
  num_oferentes  integer,
  actualizado_en timestamptz not null default now()
);

-- ---------- Historial de versiones (releases OCDS) ----------
-- Sirve para detectar cambios entre corridas de la ingesta.
create table if not exists public.versiones_proceso (
  ocid        text not null references public.procesos(ocid) on delete cascade,
  release_id  text not null,
  fecha       timestamptz not null,
  etiquetas   text[] not null default '{}',     -- tags OCDS: tender, award, contract...
  registrado_en timestamptz not null default now(),
  primary key (ocid, release_id)
);

-- ---------- Registro de corridas de ingesta (privado) ----------
create table if not exists public.ingestas (
  id           bigint generated always as identity primary key,
  inicio       timestamptz not null default now(),
  fin          timestamptz,
  estado       text not null default 'en_curso' check (estado in ('en_curso','ok','error')),
  registros    integer default 0,
  detalle      text
);

-- ---------- Índices ----------
create index if not exists entidades_nombre_trgm   on public.entidades   using gin (nombre_busqueda extensions.gin_trgm_ops);
create index if not exists proveedores_nombre_trgm on public.proveedores using gin (nombre_busqueda extensions.gin_trgm_ops);
create index if not exists procesos_titulo_trgm    on public.procesos    using gin (titulo_busqueda extensions.gin_trgm_ops);

create index if not exists procesos_entidad_idx    on public.procesos (entidad_id);
create index if not exists procesos_fecha_pub_idx  on public.procesos (fecha_publicacion desc);
create index if not exists adjud_ocid_idx          on public.adjudicaciones (ocid);
create index if not exists adjud_proveedor_idx     on public.adjudicaciones (proveedor_ruc);
create index if not exists adjud_fecha_idx         on public.adjudicaciones (fecha desc);
create index if not exists versiones_fecha_idx     on public.versiones_proceso (fecha desc);

-- ---------- Seguridad: RLS ----------
alter table public.entidades         enable row level security;
alter table public.proveedores       enable row level security;
alter table public.procesos          enable row level security;
alter table public.adjudicaciones    enable row level security;
alter table public.versiones_proceso enable row level security;
alter table public.ingestas          enable row level security;  -- sin políticas: solo service_role

-- Lectura pública (datos abiertos de la DNCP). Nadie anónimo puede escribir.
drop policy if exists "lectura publica" on public.entidades;
create policy "lectura publica" on public.entidades         for select to anon, authenticated using (true);
drop policy if exists "lectura publica" on public.proveedores;
create policy "lectura publica" on public.proveedores       for select to anon, authenticated using (true);
drop policy if exists "lectura publica" on public.procesos;
create policy "lectura publica" on public.procesos          for select to anon, authenticated using (true);
drop policy if exists "lectura publica" on public.adjudicaciones;
create policy "lectura publica" on public.adjudicaciones    for select to anon, authenticated using (true);
drop policy if exists "lectura publica" on public.versiones_proceso;
create policy "lectura publica" on public.versiones_proceso for select to anon, authenticated using (true);

-- Defensa extra: quitar permisos de escritura a los roles públicos.
revoke insert, update, delete, truncate on
  public.entidades, public.proveedores, public.procesos,
  public.adjudicaciones, public.versiones_proceso
from anon, authenticated;
revoke all on public.ingestas from anon, authenticated;

-- ---------- Vista: resumen por proveedor ----------
create or replace view public.resumen_proveedor
with (security_invoker = true) as
select
  p.ruc,
  p.nombre,
  count(a.id)                                         as adjudicaciones_12m,
  coalesce(sum(a.monto) filter (where a.moneda = 'PYG'), 0) as monto_pyg_12m,
  max(a.fecha)                                        as ultima_adjudicacion
from public.proveedores p
left join public.adjudicaciones a
  on a.proveedor_ruc = p.ruc
 and a.fecha >= now() - interval '12 months'
group by p.ruc, p.nombre;

-- ---------- Función de búsqueda (la usa el buscador de la web) ----------
-- Uso desde el frontend: supabase.rpc('buscar', { q: 'ministerio salud' })
create or replace function public.buscar(q text, limite integer default 20)
returns table (tipo text, id text, nombre text, similitud real)
language sql
stable
security invoker
set search_path = ''
as $$
  with consulta as (select public.normalizar(q) as t)
  (
    select 'proveedor', p.ruc, p.nombre,
           greatest(extensions.similarity(p.nombre_busqueda, c.t), case when p.ruc = trim(q) then 1 else 0 end)::real
    from public.proveedores p, consulta c
    where p.nombre_busqueda operator(extensions.%) c.t or p.nombre_busqueda like '%' || c.t || '%' or p.ruc = trim(q)
  )
  union all
  (
    select 'entidad', e.id, e.nombre, extensions.similarity(e.nombre_busqueda, c.t)::real
    from public.entidades e, consulta c
    where e.nombre_busqueda operator(extensions.%) c.t or e.nombre_busqueda like '%' || c.t || '%'
  )
  order by 4 desc
  limit least(greatest(limite, 1), 50);
$$;

grant execute on function public.buscar(text, integer) to anon, authenticated;
grant select on public.resumen_proveedor to anon, authenticated;
