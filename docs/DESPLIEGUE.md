# Despliegue

Todo corre en planes gratuitos.

- **Sitio:** Cloudflare Pages, proyecto `contratos-abiertos`, conectado a este repositorio. Cada `push` a `main` publica solo
  (carpeta `apps/web`, comando `npm install && npm run build`, salida `dist`).
- **Datos:** Supabase. La carga desde la DNCP corre dentro de la base (pg_cron + pg_net), no hay servidores aparte.
  Las migraciones de `supabase/migrations` se aplican a mano, en orden, desde el editor SQL.
- **Caché:** `apps/web/public/_worker.js` guarda unos minutos las consultas públicas (`/api/...`) y arma la vista previa de cada ficha.
  Si el caché falla, el sitio consulta directo a Supabase.
- **Imágenes de vista previa:** el flujo `Vistas previas` (GitHub Actions) las genera todos los días y las publica en la release `og`.
- **Visitas:** Cloudflare Web Analytics (sin cookies), activado en el proyecto de Pages.
- **Canal de Telegram:** pasos en la cabecera de `supabase/migrations/20261110000010_canal_telegram.sql`. El token va solo en el Vault de Supabase.

Nunca se sube el archivo `.env`. Las únicas claves en el código son las públicas (protegidas por RLS).
