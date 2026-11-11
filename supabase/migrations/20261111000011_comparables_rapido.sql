-- Comparación de precios: solo bienes y precalculada.
--  * En servicios y obras (códigos 70 en adelante) cada contrato es distinto: el precio unitario no es comparable.
--  * Si entre el menor y el mayor precio hay más de 20 veces, casi seguro son presentaciones distintas
--    cargadas con la misma unidad; no se muestran como comparables.
--  * Se calcula cada 15 minutos sobre los últimos 90 días (antes tardaba 1 a 3 segundos por visita).
create materialized view if not exists public.comparables_mv as
  with b as (select * from public.items_base(public.ventana(90)) where entidad_id is not null and codigo < '70'),
  moda as (select distinct on (codigo) codigo, unidad from (select codigo, unidad, count(*) c from b group by 1, 2) q order by codigo, c desc, unidad),
  por_ent as (
    select b.codigo, b.entidad_id, sum(b.monto) / nullif(sum(b.cantidad), 0) as precio, sum(b.monto) as monto
    from b join moda m on m.codigo = b.codigo and m.unidad is not distinct from b.unidad
    group by b.codigo, b.entidad_id),
  g as (
    select codigo, count(*) as instituciones, min(precio) as precio_min, max(precio) as precio_max,
           percentile_cont(0.5) within group (order by precio) as precio_mediano, sum(monto) as monto
    from por_ent where precio > 0 group by codigo
    having count(*) >= 3 and max(precio) >= min(precio) * 1.2 and max(precio) <= min(precio) * 20)
  select g.codigo, p.nombre, m.unidad, g.instituciones, g.precio_min, g.precio_max, g.precio_mediano, g.monto
  from g join public.productos p on p.codigo = g.codigo left join moda m on m.codigo = g.codigo;
create unique index if not exists comparables_mv_codigo on public.comparables_mv (codigo);
grant select on public.comparables_mv to anon, authenticated;

create or replace function public.comparables(dias integer default 90, limite integer default 12)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.monto desc), '[]'::jsonb) from (
    select * from public.comparables_mv order by monto desc limit least(greatest(limite, 1), 50)) x;
$$;
grant execute on function public.comparables(integer, integer) to anon, authenticated;

select cron.schedule('comparables-mv', '*/15 * * * *', $$refresh materialized view concurrently public.comparables_mv$$);
notify pgrst, 'reload schema';
