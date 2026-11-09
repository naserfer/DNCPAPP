# PLAN.md: Alertas de contrataciones públicas de Paraguay (v2)

Estado general: **PENDIENTE**. Ninguna fase está ejecutada.
Versión 2, auditada el 9 de noviembre de 2026. Ver `AUDITORIA.md` para los cambios y sus motivos.

---

## 1. Resumen ejecutivo

- **Problema:** la DNCP publica todo y ya ofrece alertas oficiales (suscripción por llamado, app Contrataciones PY, app DNCP Notificaciones). Lo que falta, *(supuesto a validar)*, es seguir a un **proveedor** a través de todas las instituciones, recibir **contexto** con cada aviso y usar canales que medios y ciudadanos ya usan.
- **Usuarios:** periodistas de investigación, organizaciones de transparencia, ciudadanos interesados, proveedores pequeños.
- **Propuesta de valor:** una **web app de acceso inmediato** (sin descargar nada, funciona en el navegador del celular) con una interfaz simple para buscar y seguir un proveedor, institución o rubro, ver qué publicó o ganó con contexto neutral (monto, oferentes, plazos) y llegar al proceso oficial. Avisos opcionales por correo (resumen) y notificaciones push del navegador.
- **Principio de diseño:** cualquier persona entiende la pantalla en menos de 10 segundos, sin registrarse para buscar.
- **Modelo:** gratuito y de código abierto. Costo: tiempo de desarrollo de Ardentium. Visibilidad negociada por escrito con socios.
- **Criterio de éxito (fin del piloto):** 2 socios con carta de intención, 100 suscriptores activos a 28 días, y 25% de alertas con clic al proceso oficial.
- **Criterio de cierre:** si la fase 0 muestra que las herramientas oficiales o Control Ciudadano ya cubren el hueco, se contribuye a ellas o se descarta, sin construir.

---

## 2. Hipótesis a validar

| # | Hipótesis | Cómo se comprueba | Éxito | Fracaso |
|---|---|---|---|---|
| H0 | Las herramientas oficiales de la DNCP **no** permiten alertas por proveedor ni dan contexto | Instalar y usar Contrataciones PY, DNCP Notificaciones y la suscripción por correo durante 3 días; documentar filtros | Al menos uno de los huecos confirmado | Las oficiales ya cubren proveedor y contexto: descartar o pivotar |
| H1 | Los usuarios objetivo quieren lo que falta (no "alertas" en general) | 5 entrevistas: 3 periodistas/ONG, 2 proveedores; mostrar las apps oficiales y preguntar qué les falta | 3 de 5 nombran el mismo hueco sin que se lo sugieras | Menos de 2 de 5 |
| H2 | La API permite detectar cambios diarios dentro de los límites | Prueba con clave OAuth real | Detección de un cambio en menos de 24 h | Límites o campos que lo impiden |
| H3 | Control Ciudadano no ofrece alertas y su proyecto está activo o inactivo de forma documentable | Revisión del repositorio y del sitio | Estado documentado con evidencia | Ya tiene alertas: contribuir |
| H4 | Un socio aceptaría usar o mencionar la herramienta | Conversaciones tras la demo | 1 carta de intención firmada | Ninguna respuesta positiva en 3 semanas |
| H5 | Las alertas son útiles y no ruidosas | Clics al proceso oficial y bajas en el piloto | Clics en 25% o más; bajas menores al 10% | Clics menores al 10% |

**Supuestos a validar:**
- La API admite consultas incrementales por fecha de actualización.
- Los datos de adjudicación incluyen monto, proveedor (RUC) y entidad convocante.
- El límite de llamados con clave es suficiente para la sincronización diaria.
- La licencia CC BY 4.0 aplica a todo el conjunto *(verificado en la portada del portal; páginas legales sin revisar)*.

---

## 3. Metodología

- **Discovery continuo:** cada fase empieza con preguntas y termina con una decisión registrada. El riesgo principal es de valor (ya hay herramientas oficiales), no técnico.
- **MVP:** lo mínimo que prueba H2 y H5: ingesta confiable y una web app simple donde buscar y seguir un proveedor, con avisos por correo o push.
- **Sprints de 2 semanas:** objetivo, historias cortas y revisión al cierre. Adecuado para una sola persona.
- **Given/When/Then:** cada historia se escribe como prueba verificable.
- **Puertas go/no-go:** avanzar, ajustar o detener al final de cada fase, para no acumular costo hundido.
- **Registro de decisiones (ADR):** toda decisión de arquitectura o de alcance queda escrita con alternativas descartadas.
- **Definition of Ready:** una historia entra al sprint solo si tiene criterio de aceptación, datos de prueba identificados y dependencias resueltas.

---

## 4. Fases

### Fase 0: Descubrimiento y diferenciación
- **Objetivo:** decidir construir, contribuir o descartar, con evidencia.
- **Duración:** 1,5 semanas.
- **Tareas:**
  - Usar las tres herramientas oficiales de la DNCP y documentar qué filtros y canales ofrecen (H0).
  - Revisar el repositorio de Control Ciudadano: último commit, issues abiertos, licencia, si tiene alertas (H3).
  - Verificar si la cuenta Control Cívico sigue activa.
  - Registrar una aplicación en el portal de datos de la DNCP *(hecho: credenciales en `.env`)*; probar la API con clave; medir el límite real y documentar los campos de llamados y adjudicaciones (H2).
  - Estimar el tamaño en Postgres de 12 meses de procesos y adjudicaciones (debe quedar bajo 300 MB) y verificar si una Edge Function de Supabase puede completar la ingesta diaria dentro de sus límites.
  - Leer la página legal, el aviso legal y el manual de la DNCP.
  - Entrevistar a 5 usuarios objetivo (H1).
  - Escribir ADR-001 (construir / contribuir / descartar) y ADR-002 (stack).
- **Entregables:** informe de 2 páginas, matriz comparativa con las herramientas existentes, ADR-001 y ADR-002, lista de campos verificados.
- **Criterios de aceptación:**
  - *Dado* las tres herramientas oficiales instaladas, *cuando* se documentan sus filtros, *entonces* la matriz indica para cada hueco si está cubierto o no.
  - *Dado* la clave activa, *cuando* se consultan adjudicaciones, *entonces* se obtienen monto, RUC del proveedor y entidad.
- **Puerta go/no-go:** construir solo si H0, H1 y H2 se cumplen. Si las oficiales cubren el hueco, cerrar. Si Control Ciudadano está activo, contribuir.
- **Riesgos:** la competencia oficial ya cubre la necesidad; la API no da los campos.

### Fase 1: Ingesta de datos
- **Objetivo:** copia local mínima y sincronizada de procesos y adjudicaciones.
- **Duración:** 2 semanas.
- **Tareas:**
  - Carga inicial desde los CSV de descarga masiva (solo los últimos 12 meses, *a confirmar según tamaño*).
  - Sincronización incremental diaria con clave OAuth, renovando el token cada 15 minutos.
  - Guardar solo los campos necesarios, no el OCDS completo, para entrar en 500 MB.
  - Historial de versiones por proceso (OCID + fecha de release).
  - Validación de esquema, reintentos con espera creciente, registro de ejecuciones.
- **Criterios de aceptación:**
  - *Dado* un proceso modificado, *cuando* corre la sincronización, *entonces* se guarda una versión nueva sin borrar la anterior.
  - *Dado* un error de red, *cuando* se reintenta, *entonces* no se duplican registros.
- **Puerta go/no-go:** 7 días seguidos sin errores no resueltos y base por debajo del 60% del cupo gratuito.
- **Riesgos:** cambios de formato, cupo de almacenamiento, datos incompletos.

### Fase 2: Motor de alertas con contexto
- **Objetivo:** convertir cambios en avisos relevantes y neutrales.
- **Duración:** 2 semanas.
- **Tareas:**
  - Suscripciones por proveedor (RUC), institución o rubro.
  - Detección de eventos: publicación, modificación, adjudicación.
  - Contexto calculado: monto, número de oferentes, plazo entre publicación y apertura. Sin calificaciones como "sospechoso".
  - Deduplicación y agrupación en digest diario o semanal.
  - Pruebas con procesos reales conocidos.
- **Criterios de aceptación:**
  - *Dado* un suscriptor de un RUC, *cuando* ese proveedor gana en cualquier institución, *entonces* recibe una sola alerta con monto y enlace.
  - *Dado* un proceso sin cambios, *cuando* corre el motor, *entonces* no hay alerta.
  - *Dado* cualquier alerta, *cuando* se revisa su texto, *entonces* no contiene adjetivos valorativos.
- **Puerta go/no-go:** cero duplicados y cero textos valorativos en el conjunto de prueba.
- **Riesgos:** ruido; contexto que se lea como acusación.

### Fase 3: Web app y avisos
- **Objetivo:** que cualquier persona busque, entienda y siga un proveedor o institución desde el navegador, sin instalar nada.
- **Duración:** 2 semanas.
- **Tareas:**
  - Web app responsive y mobile-first con el stack de la sección 5; instalable como PWA de forma opcional (nunca obligatoria).
  - Pantalla principal con un solo buscador (proveedor por nombre o RUC, institución, rubro) y resultados en lenguaje claro: "Ganó X licitaciones por Gs. Y en los últimos 12 meses".
  - Ficha de proceso con monto, oferentes, fechas y botón "Ver en la DNCP".
  - Botón "Seguir": aviso por correo (resumen diario o semanal, por el límite de 100 envíos por día) o push del navegador.
  - Buscar sin registro; correo solo para seguir.
  - Accesibilidad básica: contraste, tamaño de letra legible, funciona con conexión lenta.
  - Atribución a la DNCP, descargo y política de privacidad visibles.
  - Redirección propia para contar clics sin guardar datos personales.
- **Criterios de aceptación:**
  - *Dado* un visitante nuevo en el celular, *cuando* abre la web, *entonces* encuentra un proveedor y ve sus adjudicaciones en menos de 3 toques y sin registrarse.
  - *Dado* un usuario que sigue un proveedor, *cuando* este gana un proceso, *entonces* recibe el aviso en el siguiente resumen y puede darse de baja en un clic.
  - *Dado* una conexión 3G simulada, *cuando* carga la página principal, *entonces* es usable en menos de 3 segundos.
  - *Dado* un aviso, *cuando* el usuario hace clic, *entonces* llega al proceso oficial y se registra un clic anónimo.
- **Prueba de usabilidad:** 5 personas no técnicas usan la web sin ayuda; al menos 4 completan la búsqueda solas.
- **Puerta go/no-go:** checklist legal (sección 7) completo **antes** de mostrar la demo a cualquier socio.
- **Riesgos:** baja adopción; errores de envío.

### Fase 4: Piloto con socios
- **Objetivo:** validar uso real con 1 o 2 socios.
- **Duración:** 4 semanas.
- **Precondición:** carta de intención firmada; consulta legal sobre la ley 7363/2024 si el socio es una ONG.
- **Tareas:** onboarding, medición semanal, encuesta breve, ajuste de reglas de contexto.
- **Criterios de aceptación:** *dado* el piloto activo, *cuando* termina la semana 4, *entonces* las métricas de la sección 8 están documentadas.
- **Puerta go/no-go:** cumplir el criterio de éxito; si no, ajustar una vez o cerrar.
- **Riesgos:** socio que no usa; restricciones de la ley de ONG.

### Fase 5: Lanzamiento y operación
- **Objetivo:** operar sin costo y sin depender de memoria del autor.
- **Duración:** 1 semana; luego mantenimiento.
- **Tareas:** monitoreo con aviso al autor, verificación de cupos gratuitos, runbook (qué hacer si cae la API, si se agota un cupo, si se pausa la base), canal de reporte de errores, publicación del código.
- **Criterios de aceptación:** *dado* un fallo de ingesta, *cuando* ocurre, *entonces* el autor recibe aviso en menos de 1 hora.
- **Puerta go/no-go:** revisión mensual; mantener, reducir o cerrar.
- **Riesgos:** agotamiento del autor; cron desactivado por inactividad del repositorio.

---

## 5. Stack (decidido: Supabase + Cloudflare; formalizar en ADR-002)

### Arquitectura
La web es una SPA estática en **Cloudflare Pages**. Los datos viven en **Supabase (Postgres)**. La clave de la DNCP solo existe en Supabase (secretos de Edge Functions), nunca en el navegador.

```
Supabase                                      Cloudflare Pages
  pg_cron (diario) ─► Edge Function "ingest"     SPA (React)
     - lee secretos DNCP                           │ supabase-js con anon key
     - API v3 / CSV de la DNCP                     ▼
     - upsert en tablas                       Supabase REST (PostgREST)
  Postgres: procesos, adjudicaciones,            - lectura pública con RLS
            proveedores, entidades, versiones    - sin escritura anónima
  [post-MVP] tabla seguimientos + Edge Function "avisos" (Resend / Web Push)
```

**Por qué así:**
1. La API de la DNCP exige OAuth con secreto: debe quedar del lado del servidor.
2. Supabase sí admite pedidos desde el navegador (CORS), así que la SPA consulta y filtra datos sin backend propio.
3. La ingesta diaria escribe en la base, lo que evita la pausa por 7 días de inactividad del plan gratuito.
4. Los avisos post-MVP corren en Supabase sin depender de que alguien tenga la página abierta.

**Plan B de ingesta:** si una Edge Function no alcanza para la descarga (límites de tiempo o memoria del plan gratuito *a verificar en fase 0*), la ingesta pasa a GitHub Actions, que escribe en Supabase con la `service_role` guardada en GitHub Secrets.

**Reglas de seguridad de datos:**
- RLS activado en todas las tablas. Política pública solo de `SELECT` en tablas de datos públicos de la DNCP.
- Tablas de suscriptores (post-MVP) sin lectura pública; solo Edge Functions con `service_role`.
- La `anon key` es pública por diseño; la `service_role` nunca va al frontend ni al repositorio.
- Índices y vistas para búsqueda por nombre y RUC (por ejemplo `pg_trgm` para búsqueda difusa) *(evaluar)*.
- Guardar solo los campos necesarios para entrar en 500 MB.

### Frontend (stack de referencia de Ardentium)
- **Build:** Vite + React 19 + TypeScript, SPA estática.
- **Estilos:** Tailwind CSS v4 (`@tailwindcss/vite`), colores oklch, dark mode por clase `.dark`.
- **Componentes:** shadcn/ui sobre Radix (Accordion, Collapsible, Dialog, Popover, Select, RadioGroup, Label, Toggle). Para el buscador: Command (cmdk) si hace falta autocompletar *(evaluar)*.
- **Utilidades:** class-variance-authority + clsx + tailwind-merge (`cn()`).
- **Íconos:** lucide-react.
- **Fuentes:** Geist y Geist Mono self-hosted (`@fontsource-variable/geist`).
- **Validación:** Zod v4, formularios con estado controlado (sin react-hook-form). Zod también valida las respuestas de Supabase.
- **Formatos:** `Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG' })` y `Intl.DateTimeFormat('es-PY')`, sin librerías de fechas.
- **Tema:** `theme-init.js` inline en `<head>` que aplica dark/light antes del render; preferencia en localStorage (con try/catch).
- **Extras:** botón "Copiar" (Clipboard API) para compartir un resultado; link "Saltar al contenido"; aria-labels; meta OG/Twitter con og-image 1200x630.
- **Datos:** `@supabase/supabase-js` con la anon key; consultas paginadas y búsqueda en la base (no se descarga todo al navegador). Zod valida las respuestas.

### Datos y procesos
| Pieza | Opción | Límite gratuito a tener en cuenta |
|---|---|---|
| Base de datos | Supabase Postgres | 500 MB; 5 GB de transferencia/mes; pausa tras 7 días sin actividad (la ingesta diaria lo evita) |
| Ingesta programada | Supabase pg_cron + Edge Function | Límites de tiempo y memoria de Edge Functions *(verificar)*; plan B: GitHub Actions |
| Hosting | Cloudflare Pages | Estático gratis; 500 builds/mes |
| Analítica | Cloudflare Web Analytics | Sin cookies |
| "Seguir" (post-MVP) | Tabla en Supabase + Edge Function | 500.000 invocaciones/mes *(verificar)* |
| Correo (post-MVP) | Resend desde Edge Function | 3.000/mes, 100/día |
| Push (post-MVP) | Web Push | En iPhone solo si la web se agrega a la pantalla de inicio |

### Seguridad (archivo `public/_headers`)
```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://<proyecto>.supabase.co https://cloudflareinsights.com; img-src 'self' data:; style-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```
- **Excepciones necesarias a `default-src 'self'`:** el dominio del proyecto de Supabase en `connect-src` (reemplazar `<proyecto>`), y Cloudflare Web Analytics, que carga un script de `static.cloudflareinsights.com` y envía a `cloudflareinsights.com`.
- **`theme-init.js` inline:** con `script-src 'self'` un script inline se bloquea. Opciones: servirlo como archivo `/theme-init.js` cargado sin `defer` en el `<head>`, o agregar su hash `sha256-...` a la CSP. Preferir el archivo externo.
- **Enlaces a la DNCP:** son navegación, no requieren cambios en la CSP. Usar `rel="noopener noreferrer"`.
- El navegador nunca llama a la API de la DNCP: solo a Supabase.

### Estructura de repositorio sugerida
```
appdncp/
  apps/web/                SPA (Vite + React)
  apps/web/public/         _headers, og-image.png, theme-init.js
  supabase/migrations/     esquema, índices, políticas RLS
  supabase/functions/      ingest/, [post-MVP] avisos/
  packages/schema/         esquemas Zod compartidos
  docs/                    campos-api.md, ADRs
```

---

## 6. Estrategia de pruebas

- **Unitarias:** detección de eventos, deduplicación, reglas de suscripción y de contexto.
- **Con datos reales:** snapshots versionados de procesos de la DNCP; pruebas sin red.
- **De lenguaje:** lista de palabras prohibidas en textos de alerta ("sospechoso", "irregular", "corrupción").
- **De límites:** simular el peor día de cambios contra el cupo de API, base y envíos.
- **Regresión:** el conjunto de casos conocidos corre en cada cambio (CI).

---

## 7. Seguridad, privacidad y lenguaje

- Claves en variables de entorno o secretos de CI; nunca en el repositorio.
- Datos de suscriptores: solo correo o suscripción push del navegador, y lo que sigue cada persona. Se borran con la baja.
- Sin píxeles de apertura; solo clics anónimos agregados.
- Proveedores personas físicas: no construir perfiles ni rankings; mostrar solo lo que el portal muestra para ese proceso.
- Política de privacidad breve y pública.
- Toda alerta dice "según datos publicados por la DNCP" y enlaza al original.

---

## 8. Checklist legal (antes de la demo a socios)

- [ ] Atribución a la DNCP (CC BY 4.0) en alertas, página y repositorio.
- [ ] Revisión de la página legal y el aviso legal de la DNCP.
- [ ] Descargo: la herramienta reproduce datos oficiales y no afirma irregularidades.
- [ ] Ley 7593/2025 (datos personales): no vigente; aplicar minimización igual y revisar artículo 24.
- [ ] Ley 7363/2024 (ONG): consulta legal antes de firmar con una ONG.
- [ ] Licencia del código propio definida (AGPL-3.0 o MIT).

---

## 9. Métricas

| Fase | Métrica | Umbral | Revisión |
|---|---|---|---|
| 0 | Huecos confirmados frente a las herramientas oficiales | 1 o más | Semana 2 |
| 0 | Entrevistados que nombran el mismo hueco | 3 de 5 | Semana 2 |
| 1 | Días seguidos de ingesta sin error | 7 | Semana 4 |
| 1 | Uso de almacenamiento | Menos del 60% del cupo | Semana 4 |
| 2 | Duplicados y textos valorativos | 0 | Semana 5 |
| 3 | Checklist legal | Completo | Semana 6 |
| 4 | Suscriptores activos a 28 días | 100 | Semana 11 |
| 4 | Alertas con clic al proceso oficial | 25% | Semana 11 |
| 4 | Bajas | Menos del 10% | Semana 11 |
| 4 | Cartas de intención | 2 | Semana 11 |
| 5 | Costo mensual | 0 | Mensual |

---

## 10. Registro de riesgos

| Riesgo | Prob. | Impacto | Señal temprana | Respuesta |
|---|---|---|---|---|
| Las herramientas oficiales ya cubren la necesidad | Media | Alto | Matriz de fase 0 | Cerrar o pivotar a contexto/periodistas |
| La DNCP lanza alertas por proveedor | Media | Alto | Novedades en el portal o en sus apps | Integrarse o cerrar; el código abierto queda como aporte |
| Control Ciudadano ya tiene alertas | Media | Alto | Revisión de fase 0 | Contribuir |
| Cambio en la API | Media | Alto | Errores o cambios de formato | Adaptador aislado; descarga masiva como respaldo |
| Cupos gratuitos agotados | Media | Medio | Uso cerca del 80% | Resumen semanal en lugar de diario, recorte de historial, priorizar push |
| Supabase pausado o ingesta detenida | Media | Medio | Sin registros nuevos en 48 h | Monitoreo externo que avisa al autor; la ingesta diaria mantiene la base activa; plan B en GitHub Actions |
| Alertas leídas como acusación | Media | Alto | Reclamos de terceros | Lenguaje neutral, enlace al original, canal de corrección |
| Socio que no firma | Alta | Medio | Sin respuesta en 3 semanas | Otro socio o lanzamiento propio |
| Ley de ONG complica el acuerdo | Media | Medio | Consulta del socio | Consulta legal; acuerdo con un medio en su lugar |
| Cambio de licencia de los datos | Baja | Alto | Nuevo aviso legal | Pausar y revisar |
| Agotamiento del autor | Media | Alto | Dos sprints atrasados | Reducir alcance a fases 1 a 3 |

---

## 11. Registro de decisiones (plantilla)

```
### ADR-000: [título]
- Fecha:
- Estado: propuesta | aceptada | reemplazada
- Contexto:
- Decisión:
- Alternativas descartadas:
- Consecuencias:
```

Pendientes: **ADR-001** construir / contribuir / descartar; **ADR-002** stack.

---

## 12. Definition of Done por fase

- **Fase 0:** matriz comparativa, informe, ADR-001 y ADR-002, campos de API verificados.
- **Fase 1:** ingesta documentada, pruebas con snapshots, 7 días sin errores, uso de cupo medido.
- **Fase 2:** motor probado, cero duplicados, cero textos valorativos.
- **Fase 3:** web app funcionando en celular, prueba de usabilidad aprobada, avisos operativos, checklist legal completo.
- **Fase 4:** informe de piloto, métricas, decisión de continuidad.
- **Fase 5:** runbook, monitoreo, código publicado, costo verificado en cero.

---

## 13. Calendario orientativo (11 semanas)

| Semana | Trabajo | Nota |
|---|---|---|
| 1–2 | Fase 0 | Sin solape; termina con go/no-go |
| 2–3 | Fase 1 | Arranca solo si la fase 0 dice "construir" |
| 4–5 | Fase 2 | Puede empezar en la semana 3 con datos parciales |
| 6–7 | Fase 3 (web app) + checklist legal + contacto con socios | La demo se muestra al final de la semana 7 |
| 8–11 | Fase 4 (piloto de 4 semanas) | Requiere carta de intención firmada |
| 11+ | Fase 5 | Solo si el piloto pasa su puerta |

---

## 14. Preguntas abiertas antes de la fase 1

1. ¿Qué hueco concreto dejan las herramientas oficiales? (fase 0)
2. ¿Control Ciudadano está activo y tiene alertas? (fase 0)
3. ¿Qué campos y límites da la API con clave? (fase 0)
4. ¿Los usuarios entrevistados prefieren aviso por correo o push del navegador? ¿Les basta con entrar a la web?
5. ¿Cuántas horas semanales puedes dedicar sin afectar tu trabajo principal?
6. ¿Socio prioritario: un medio o una ONG? (cambia el riesgo legal)
7. ¿Licencia del código: AGPL-3.0 o MIT?
