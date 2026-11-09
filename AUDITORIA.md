# Auditoría de PLAN.md (v1 → v2)

Fecha: 9 de noviembre de 2026.
Alcance: coherencia interna, supuestos sin verificar, competencia, viabilidad técnica de "costo cero", métricas y riesgos legales.

---

## Veredicto

El plan v1 estaba bien estructurado (fases, puertas go/no-go, Given/When/Then), pero **partía de un supuesto falso**: que nadie ofrece alertas de licitaciones en Paraguay. La propia DNCP ya tiene tres mecanismos oficiales de alertas. Eso no mata la idea, pero obliga a redefinir el diferencial antes de escribir código. La v2 reordena la fase 0 alrededor de esa pregunta.

---

## Hallazgos críticos

### C1. La DNCP ya ofrece alertas (no estaba en el plan)
- **Suscripción por correo a un llamado:** las páginas de llamados del portal ofrecen "Suscribirse para recibir modificaciones de este llamado a su correo electrónico".
- **App "Contrataciones PY"** (oficial, Android): acceso diario a licitaciones y alertas de modificaciones en las licitaciones que el usuario marca como interesantes. Fuente: datos.gov.py.
- **App "DNCP Notificaciones"** (oficial): el usuario elige un tipo de información y recibe un aviso con cada publicación nueva de ese tipo. Última actualización en Play Store: 28 de abril de 2024; más de 1.000 descargas.
- **Sistema de alarmas con IA de la DNCP:** reportado como experimental, para detectar comportamientos sospechosos de instituciones y proveedores. *(fecha de la nota sin confirmar)*

**Impacto:** H1 ("hay gente que quiere alertas") no alcanza. La pregunta correcta es **qué necesidad no cubren las herramientas oficiales**.

**Huecos posibles (supuestos a validar):**
- Alertas por **proveedor/RUC** a través de todas las instituciones (las oficiales parecen centradas en llamados o tipos de información).
- **Contexto** en cada alerta: monto comparado con procesos similares, número de oferentes, oferente único, plazos cortos.
- **Canal**: Telegram o WhatsApp, y canales públicos por institución que un medio puede seguir.
- **Digest** semanal para periodistas, en lugar de una notificación por cada evento.

### C2. Otros actores no considerados
- **Control Cívico**: cuenta en Twitter/X creada por dos informáticos paraguayos que usa machine learning para detectar desviaciones en montos de compras públicas y publicarlas. *(no verifiqué si sigue activa)*
- **Control Ciudadano (IDEA)**: confirmado como portal de exploración de datos, compras COVID y declaraciones juradas. **No pude revisar el repositorio**: GitHub bloqueó la consulta y el pedido de acceso fue rechazado por el clasificador de seguridad. Sigue pendiente.

### C3. "Costo cero" no estaba verificado y tiene trampas
| Servicio | Límite gratuito relevante | Consecuencia para el plan |
|---|---|---|
| Resend (correo) | 3.000/mes y **100 por día** | Con 100 suscriptores, una alerta por día ya agota el cupo. Obliga a usar digest o Telegram. |
| Cloudflare Workers | 100.000 solicitudes/día; **10 ms de CPU** por ejecución en el plan gratuito, también en cron | No alcanza para procesar la ingesta OCDS. Sirve para el bot o la página de suscripción. |
| Cloudflare D1 | 500 MB por base, 5 GB por cuenta, 50 consultas por invocación | Hay que guardar solo campos necesarios, no los OCDS completos. |
| Supabase | 500 MB; **pausa tras 7 días sin actividad** | La sincronización diaria evita la pausa, pero un fallo de una semana la activa. |
| Telegram Bot API | Gratis, sin cupo diario comparable | Mejor canal principal para el MVP. |
| GitHub Actions | Gratis en repos públicos | Los cron de repos públicos se desactivan tras 60 días sin commits *(verificar)*. |

### C4. Métricas que no se pueden medir así
- **"Tasa de apertura 30%"**: en Telegram no existe; en correo, el píxel de apertura es poco confiable y choca con la política de minimización. **Cambio:** medir **clics** al enlace de la DNCP mediante redirección propia sin datos personales.
- **"100 suscriptores activos a 30 días"** con un piloto de **3 semanas**: imposible por calendario. **Cambio:** piloto de 4 semanas y métrica a 28 días.

---

## Hallazgos importantes

| # | Problema en v1 | Corrección en v2 |
|---|---|---|
| I1 | Calendario: piloto en semanas 6–8, pero métricas revisadas en semana 9 y lanzamiento solapado con piloto | Calendario rehecho a 10 semanas, sin solapes contradictorios |
| I2 | Fase 1 asumía "15 llamados/min sin clave" para producción; ese límite es "para testing" | Producción solo con clave OAuth; límite real con clave a medir en fase 0 |
| I3 | No había decisión de stack ni ADR | Fase 0 produce ADR-001 (construir/contribuir) y ADR-002 (stack) |
| I4 | Sección 6: "el historial de procesos se conserva porque es público", sin considerar proveedores que son personas físicas | Minimización también sobre datos públicos; no generar perfiles de personas físicas |
| I5 | El checklist legal se cerraba en fase 3, después de mostrar la demo a socios | Mostrar la demo solo con descargo, atribución y política de privacidad listos |
| I6 | Faltaba licencia del propio código | Publicar como código abierto (sugerencia: AGPL-3.0 o MIT), que suma visibilidad y facilita contribuir con Control Ciudadano |
| I7 | Faltaban riesgos: competencia oficial, abandono de la DNCP de sus apps, alertas que se lean como acusaciones | Agregados al registro |
| I8 | No había Definition of Ready ni criterios para cerrar el proyecto | Agregados |
| I9 | Punto único de falla: una sola persona | Documentación de operación y runbook mínimo en fase 5 |
| I10 | Riesgo de que "contexto" (monto alto, oferente único) se lea como señal de corrupción | Lenguaje neutral obligatorio; las alertas describen hechos, no calificaciones |

---

## Lo que no pude verificar
- Actividad y funcionalidades del repositorio de Control Ciudadano (acceso bloqueado).
- Campos exactos y límite con clave de la API v3 de la DNCP (la documentación remite al manual).
- Página legal y aviso legal del portal de datos de la DNCP (no respondieron).
- Si la app "Contrataciones PY" sigue publicada y qué filtros ofrece.
- Vigencia de la cuenta Control Cívico.

## Fuentes
- Portal DNCP, página de llamados (suscripción por correo): https://www.contrataciones.gov.py/sicp/llamado/llamadosPublicados.seam
- Contrataciones PY en datos.gov.py: https://www.datos.gov.py/contrataciones-py-0
- DNCP Notificaciones en Google Play: https://play.google.com/store/apps/details?id=py.gov.dncp.notificaciones
- Términos y condiciones DNCP (app Contrataciones PY): https://www.contrataciones.gov.py/dncp/terminos-y-condiciones-de-uso/version-actual-actualizado-a-13-11-2017/
- Sistema de alarmas de la DNCP (Última Hora): https://www.ultimahora.com/contrataciones-desarrolla-sistema-detectar-licitaciones-sospechosas-n2925569
- Bot Control Cívico (DPL News): https://dplnews.com/?p=85474
- Control Ciudadano: https://controlciudadanopy.org/about
- API v3 DNCP: https://contrataciones.gov.py/datos/api/v3/doc/
- Releases y records OCDS: https://standard.open-contracting.org/latest/en/primer/releases_and_records/
- Límites de Resend: https://flexprice.io/blog/detailed-resend-pricing-guide
- Límites de Cloudflare D1: https://developers.cloudflare.com/d1/platform/limits
- Límites de Cloudflare Workers: https://developers.cloudflare.com/workers/platform/limits/
- Pausa de Supabase: https://supabase.com/docs/guides/platform/free-project-pausing
