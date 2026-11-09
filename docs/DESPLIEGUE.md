# Puesta en marcha (solo clics, sin comandos)

## 1. Secretos de la ingesta (GitHub)
Repo → **Settings → Secrets and variables → Actions → New repository secret**. Crear:

| Nombre | Valor |
|---|---|
| `DNCP_REQUEST_TOKEN` | el "Request token" de tu aplicación en el portal de datos de la DNCP |
| `DNCP_TOKEN_URL` | `https://contrataciones.gov.py/datos/api/oauth/token` |
| `SUPABASE_URL` | `https://egvcqupndjmuybiteioj.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | la clave secreta (rotada) de Supabase |

Luego **Actions → Ingesta DNCP → Run workflow**. Dejar "desde" vacío para la prueba (últimos 2 días). Si termina en verde, hay datos en Supabase; después correrlo con `2026-01-01` para la carga histórica.
Si falla, el error queda en la tabla `ingestas` (columna `detalle`) y en el log del workflow.

## 2. Publicar la web (Cloudflare Pages)
Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → repo `DNCPAPP`.
- Build command: `npm install && npm run build`
- Build output directory: `dist`
- Root directory: `apps/web`
- Variables: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (la clave publishable).

Cada push a `main` publica solo.
