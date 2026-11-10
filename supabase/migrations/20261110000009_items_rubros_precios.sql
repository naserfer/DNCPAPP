-- =====================================================================
-- DNCPAPP · 009 · Ítems comprados: rubros y comparación de precios
--
-- Cada adjudicación trae sus ítems con código del catálogo de la DNCP
-- (basado en UNSPSC: los dos primeros dígitos son el rubro), unidad,
-- cantidad y precio unitario. Se guardan solo ítems en guaraníes.
--
--   rubros(dias)            → cuánto se compró por rubro
--   rubro(id, dias)         → productos, instituciones y proveedores de un rubro
--   producto(codigo, dias)  → qué pagó cada institución por el mismo producto
--   comparables(dias)       → productos comprados por varias instituciones a precios distintos
--   buscar_productos(q)
-- Idempotente.
-- =====================================================================

create table if not exists public.productos (
  codigo text primary key,
  nombre text not null,
  nombre_busqueda text generated always as (public.normalizar(nombre)) stored
);

create table if not exists public.items (
  adj_id   text not null,
  n        integer not null,
  ocid     text not null references public.procesos(ocid) on delete cascade,
  codigo   text not null,
  unidad   text,
  cantidad numeric,
  precio   numeric,
  primary key (adj_id, n)
);
create index if not exists items_codigo_idx on public.items (codigo);
create index if not exists items_ocid_idx on public.items (ocid);

alter table public.productos enable row level security;
alter table public.items enable row level security;
do $$ begin
  create policy "lectura publica" on public.productos for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "lectura publica" on public.items for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
revoke insert, update, delete, truncate on public.productos, public.items from anon, authenticated;
grant select on public.productos, public.items to anon, authenticated;

-- ---------- Parser: guardar ítems ----------
do $do$
declare d text;
begin
  select pg_get_functiondef('public.dncp_guardar_record(jsonb)'::regprocedure) into d;
  if position('public.items' in d) = 0 then
    d := replace(d, $x$  insert into public.versiones_proceso$x$, $x$  insert into public.productos (codigo, nombre)
  select distinct on (i->'classification'->>'id') i->'classification'->>'id', left(i->'classification'->>'description', 200)
  from jsonb_array_elements(aws) a, jsonb_array_elements(coalesce(a->'items', '[]')) i
  where i->'classification'->>'id' is not null and i->'classification'->>'description' is not null
  on conflict (codigo) do nothing;

  delete from public.items where ocid = v_ocid;
  insert into public.items (adj_id, n, ocid, codigo, unidad, cantidad, precio)
  select v_ocid || '/' || coalesce(a->>'id', ai::text), ii::integer, v_ocid,
         i->'classification'->>'id', left(i->'unit'->>'name', 80),
         public.a_numero(i->>'quantity'), public.a_numero(i->'unit'->'value'->>'amount')
  from jsonb_array_elements(aws) with ordinality aw(a, ai),
       jsonb_array_elements(coalesce(a->'items', '[]')) with ordinality it(i, ii)
  where coalesce(a->>'status', 'active') not in ('cancelled', 'unsuccessful')
    and i->'classification'->>'id' is not null
    and coalesce(i->'unit'->'value'->>'currency', 'PYG') = 'PYG'
  on conflict (adj_id, n) do nothing;

  insert into public.versiones_proceso$x$);
    execute d;
  end if;
end $do$;
revoke execute on function public.dncp_guardar_record(jsonb) from public, anon, authenticated;

-- ---------- Base: ítems con su adjudicación ----------
create or replace function public.items_base(p_desde timestamptz)
returns table (codigo text, unidad text, cantidad numeric, precio numeric, monto numeric, fecha timestamptz,
               entidad_id text, proveedor_ruc text, proveedor_nombre text, convenio_marco boolean, url_dncp text)
language sql stable security invoker set search_path = ''
as $$
  select i.codigo, i.unidad, i.cantidad, i.precio, i.cantidad * i.precio, m.fecha,
         m.entidad_id, m.proveedor_ruc, m.proveedor_nombre, m.convenio_marco, m.url_dncp
  from public.adj_mv m
  join public.items i on i.adj_id = m.adj_id
  where m.fecha >= p_desde and m.fecha <= now() and i.precio > 0 and i.cantidad > 0;
$$;
grant execute on function public.items_base(timestamptz) to anon, authenticated;

create or replace function public.ventana(dias integer)
returns timestamptz language sql stable security invoker set search_path = ''
as $$ select greatest(now() - make_interval(days => least(greatest(dias, 1), 90)), public.datos_desde()) $$;
grant execute on function public.ventana(integer) to anon, authenticated;

-- ---------- Rubros ----------
create or replace function public.rubros(dias integer default 30)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.monto desc), '[]'::jsonb) from (
    select left(codigo, 2) as id, sum(monto) as monto, count(*) as compras,
           count(distinct codigo) as productos, count(distinct entidad_id) as instituciones
    from public.items_base(public.ventana(dias)) group by 1) x;
$$;
grant execute on function public.rubros(integer) to anon, authenticated;

create or replace function public.rubro(p_id text, dias integer default 30)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  with u as (select * from public.items_base(public.ventana(dias)) where left(codigo, 2) = p_id)
  select jsonb_build_object(
    'id', p_id, 'desde', public.ventana(dias),
    'monto', (select coalesce(sum(monto), 0) from u),
    'compras', (select count(*) from u),
    'instituciones', (select count(distinct entidad_id) from u),
    'productos', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select u.codigo, max(p.nombre) as nombre, sum(u.monto) as monto, count(*) as compras, count(distinct u.entidad_id) as instituciones
        from u left join public.productos p on p.codigo = u.codigo group by u.codigo order by sum(u.monto) desc limit 15) x), '[]'::jsonb),
    'top_entidades', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select u.entidad_id as id, max(e.nombre) as nombre, sum(u.monto) as monto, count(*) as cantidad
        from u left join public.entidades e on e.id = u.entidad_id where u.entidad_id is not null
        group by u.entidad_id order by sum(u.monto) desc limit 5) x), '[]'::jsonb),
    'top_proveedores', coalesce((
      select jsonb_agg(x order by x.monto desc) from (
        select proveedor_ruc as id, max(proveedor_nombre) as nombre, sum(monto) as monto, count(*) as cantidad
        from u where proveedor_ruc is not null group by proveedor_ruc order by sum(monto) desc limit 5) x), '[]'::jsonb));
$$;
grant execute on function public.rubro(text, integer) to anon, authenticated;

-- ---------- Un producto: qué pagó cada institución ----------
create or replace function public.producto(p_codigo text, dias integer default 90)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  with todo as (select * from public.items_base(public.ventana(dias)) where codigo = p_codigo),
  -- se compara solo la presentación más frecuente (misma unidad de medida)
  uni as (select unidad from todo group by unidad order by count(*) desc, unidad limit 1),
  u as (select t.* from todo t, uni where t.unidad is not distinct from uni.unidad),
  por_ent as (
    select u.entidad_id as id, max(e.nombre) as nombre,
           sum(u.monto) / nullif(sum(u.cantidad), 0) as precio, min(u.precio) as precio_min, max(u.precio) as precio_max,
           sum(u.cantidad) as cantidad, sum(u.monto) as monto, count(*) as compras, max(u.fecha) as fecha,
           (array_agg(u.proveedor_nombre order by u.fecha desc))[1] as proveedor_nombre,
           (array_agg(u.proveedor_ruc order by u.fecha desc))[1] as proveedor_ruc,
           (array_agg(u.url_dncp order by u.fecha desc))[1] as url_dncp
    from u left join public.entidades e on e.id = u.entidad_id
    where u.entidad_id is not null group by u.entidad_id)
  select case when p.codigo is null then null else jsonb_build_object(
    'codigo', p.codigo, 'nombre', p.nombre, 'desde', public.ventana(dias),
    'unidad', (select unidad from uni),
    'otras_unidades', (select count(distinct unidad) - 1 from todo),
    'compras', (select count(*) from u),
    'monto', (select coalesce(sum(monto), 0) from u),
    'precio_min', (select min(precio) from por_ent),
    'precio_max', (select max(precio) from por_ent),
    'precio_mediano', (select percentile_cont(0.5) within group (order by precio) from por_ent),
    'instituciones', coalesce((select jsonb_agg(x order by x.precio desc) from (select * from por_ent order by precio desc limit 40) x), '[]'::jsonb)
  ) end
  from (select 1) uno left join public.productos p on p.codigo = p_codigo;
$$;
grant execute on function public.producto(text, integer) to anon, authenticated;

-- ---------- Productos comparables ----------
create or replace function public.comparables(dias integer default 90, limite integer default 12)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  with b as (select * from public.items_base(public.ventana(dias)) where entidad_id is not null),
  moda as (select distinct on (codigo) codigo, unidad from (select codigo, unidad, count(*) c from b group by 1, 2) q order by codigo, c desc, unidad),
  por_ent as (
    select b.codigo, b.entidad_id, sum(b.monto) / nullif(sum(b.cantidad), 0) as precio, sum(b.monto) as monto
    from b join moda m on m.codigo = b.codigo and m.unidad is not distinct from b.unidad
    group by b.codigo, b.entidad_id),
  g as (
    select codigo, count(*) as instituciones, min(precio) as precio_min, max(precio) as precio_max,
           percentile_cont(0.5) within group (order by precio) as precio_mediano, sum(monto) as monto
    from por_ent where precio > 0 group by codigo
    having count(*) >= 3 and max(precio) >= min(precio) * 1.2)
  select coalesce(jsonb_agg(x order by x.monto desc), '[]'::jsonb) from (
    select g.codigo, p.nombre, (select unidad from moda m where m.codigo = g.codigo) as unidad,
           g.instituciones, g.precio_min, g.precio_max, g.precio_mediano, g.monto
    from g join public.productos p on p.codigo = g.codigo
    order by g.monto desc limit least(greatest(limite, 1), 50)) x;
$$;
grant execute on function public.comparables(integer, integer) to anon, authenticated;

create or replace function public.buscar_productos(q text, limite integer default 8)
returns table (codigo text, nombre text)
language sql stable security invoker set search_path = public, extensions
as $$
  select p.codigo, p.nombre from public.productos p
  where length(trim(q)) >= 3
    and p.nombre_busqueda like '%' || replace(replace(public.normalizar(trim(q)), '%', ''), '_', ' ') || '%'
    and exists (select 1 from public.items i where i.codigo = p.codigo)
  order by length(p.nombre), p.nombre limit least(greatest(limite, 1), 30);
$$;
grant execute on function public.buscar_productos(text, integer) to anon, authenticated;

-- ---------- Reprocesar para traer los ítems (un poco más rápido: 14 pedidos/min, el límite es 15) ----------
select cron.schedule('dncp-tick', '* * * * *', $$select public.dncp_tick(14)$$);
update public.ingesta_cola set estado = 'pendiente', intentos = 0, detalle = null, actualizado = now() where estado <> 'pedido';
notify pgrst, 'reload schema';
