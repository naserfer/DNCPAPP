# Despliegue

## Datos (ya funcionando)
La ingesta corre **dentro de Supabase** (migración `002`): pg_cron cada minuto + pg_net contra la API pública de la DNCP (sin credenciales, 15 llamadas/min). No hay secretos en GitHub ni en el frontend.

- Estado: SQL Editor → `select * from public.ingesta_estado;`
- Carga histórica: `select public.dncp_cargar_desde('2026-01-01');`
- Errores: `select ocid, detalle from public.ingesta_cola where estado = 'error';`

Capacidad: ~12 procesos/min (~17.000/día). Los últimos 30 días se completan en pocas horas.

## Web (Cloudflare Pages)

En producción: https://contratos-abiertos.pages.dev (proyecto `contratos-abiertos`, subida directa).
El build listo está en `apps/web/dist` (generado con esbuild; el CI valida además el build con Vite).
Configuración pública en `apps/web/.env.production` (URL y clave publishable, protegidas por RLS).

- Subida directa: Workers & Pages → Create → Pages → Upload assets → proyecto `contratos-abiertos` → subir `apps/web/dist`.
- Automático (opcional): Connect to Git → repo `DNCPAPP`, root `apps/web`, build `npm install && npm run build`, output `dist`.
