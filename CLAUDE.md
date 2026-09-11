# CLAUDE.md — KIDS2026

> Este archivo debe mantenerse PRECISO. En Mosaico quedó describiendo tablas
> inexistentes y causó fallas reales. Si cambias comportamiento, actualízalo.

## Qué es

Plataforma de gestión académica de **LGS Kids** (inglés para niños 6–13
años). Dominio: `lgskidsplataforma.com`. Multi-país: CL, CO, EC, PE.

**Modelo de cohortes con horario fijo**: el niño NO agenda; se matricula en
un salón y asiste a lo que el salón programe. La lista de sesión se deriva
del salón, nunca de una acción del estudiante.

## Estado actual

- **Fase 3 (identidad, acceso, auditoría) completada**: login por username
  (JWT 15 min + refresh rotativo con detección de reuso por familia), RBAC
  con alcance por país, auditoría, rate limiting persistido, UI /login y
  /panel con menú por permisos.
- **Esquema Prisma 7**: `prisma/schema.prisma` (URLs en `prisma.config.ts`,
  NO en el schema — cambio de Prisma 7). Migración inicial
  `20260723000000_identity_access_audit`. Todo instante es `timestamptz`.
- El acceso a datos usa SQL parametrizado vía `platform/db` (el client de
  Prisma se adoptará cuando aporte; CLI solo para esquema/migraciones).
- Rutas protegidas: `handlerWithAuth` + `getAccessProfile(...).requirePermission(...)`
  endpoint por endpoint. El autenticador se registra en `src/instrumentation.ts`
  (con guard `NEXT_RUNTIME === "nodejs"` — obligatorio para que el build Edge
  no intente compilar argon2/pg).
- Comandos nuevos: `pnpm seed` (países, roles, permisos, admin — exige
  SEED_ADMIN_PASSWORD), `pnpm migrate:dev|deploy`, `pnpm worker:dev`.
- **Fase 4 (`catalog`) completada**: migración `20260724000000_catalog`
  (campaña, curso, nivel, lección, cuestionario). Crear campaña genera EN
  UNA TRANSACCIÓN los cursos Junior+Youngster con **5 niveles** c/u
  (Rookie 2m · Champion 2m · Elite 3m · Legendary 3m · Ultimate Stage 2m = 12
  meses; `catalog_level.duracion_meses`), 4 lecciones por nivel (cuestionario
  de práctica c/u) y un Level Up por nivel: 2/10/40/50 filas. **Fechas (2026-08-24)**: la campaña pide `inicio`
  (comercial) + `inicio del curso`; `fin` = inicio + **12 meses** (EDITABLE
  vía `PATCH /api/catalog/campaigns/[id]` → `actualizarFechasCampania`; NO
  toca `final_curso`). `final_venta` (cierre de matrícula) = inicio del curso
  - **3 semanas**. El curso arranca en su fecha; `final_curso` = fin de campaña
    (nominal, NUNCA reescrito). Estado de campaña SIEMPRE derivado por fecha
    (nunca almacenado): **EN_MATRÍCULA** hasta `final_venta` (única visible en el
    wizard de contratos y en el intake, que ya filtran EN_MATRICULA) → **ACTIVA**
    → **CERRADA/Inactiva** al pasar `fin`. Fechas DATE puro leído con `::text`.
    Permisos: `catalogo.gestionar` (admin, coordinador) y `catalogo.ver`
    (+ guía). UI: /panel/campanias (wizard: campaña + crea JUNIOR/YOUNGSTER
    Salón 1–6 DESDE EL CATÁLOGO de horarios por número/grupo).
- **Referencia curricular (2026-08-25)**: evaluada la tabla plana `NIVELES` de
  MOSAICO; en KIDS se materializa como **tabla MAESTRA `catalog_curso`**
  (migraciones `20260825000001`/`...002`), INDEPENDIENTE de campañas: una fila
  por `(curso, nivel, unidad, leccion)` (la **unidad** agrupa las unidades del
  nivel) con `quiz` (JSONB, cuestionario, antes de `leccion`), `contenido`
  (temario md), `video`, `clubes`/`material_usuario`/`material_guia`/
  `actividades`/`recursos` (JSONB) + `orden`. El contenido de "Junior·Rookie·Lección 1" es el mismo en toda
  campaña → se carga UNA vez aquí. Es la fuente para paneles de alumno/guía y
  actividades de seguimiento (consumo aún pendiente). CRUD:
  `GET|POST /api/catalog/curso` + `GET|PUT|DELETE /api/catalog/curso/[id]`
  (`curso-referencia.ts`; único por curso·nivel·unidad·lección; ver=catalogo.ver,
  escribir=catalogo.gestionar). **Import CSV** (`POST /api/catalog/curso/bulk` →
  `importarCursoReferencia`, UPSERT por clave natural): UI `/panel/mantenimiento-cursos/subir-curso`
  parsea el CSV en el navegador, muestra un PREVIO validado (✔/✘ por fila) y solo
  al confirmar sube las válidas. **Separador autodetectado** (`detectarSeparador`
  cuenta `,` vs `;` SOLO en el encabezado: el Excel en español exporta con `;`) y
  `ULTIMATE STAGE` se acepta como `ULTIMATE`. Columnas obligatorias: **curso,
  nivel, unidad, leccion, orden**. Listas en CSV: ítems `Nombre|enlace` separados por `;`.
  **Gestión de Contenido** (`/panel/mantenimiento-cursos/gestion-contenido`, estilo
  MOSAICO): editor guiado por Curso→Nivel que edita el temario y la **evaluación de
  cada lección con VARIOS cuestionarios** (`quiz = { cuestionarios: [{titulo, minutos,
preguntas: [{tipo: opcion_multiple|verdadero_falso|respuesta_escrita, enunciado,
opciones[], correcta}] }] }`). El campo `quiz` de la API es JSON libre: cada editor
  define su forma (Referencia guarda un arreglo de preguntas; Gestión de Contenido, los
  cuestionarios). La migración `20260825000000` había puesto la
  referencia en `catalog_lesson` (por campaña) — se RETIRÓ (superada por
  `catalog_curso`); quedan como PENDIENTE (¿se necesitan?) las referencias de
  `catalog_level` (`descripcion`,`recursos`) y `catalog_quiz` (`modo`,`minutos`,
  preguntas en `contenido`) con `GET|PUT /api/catalog/{levels|quizzes}/[id]/referencia`.
- **Fase 5 (`people` + `contracts`) completada**: migración
  `20260725000000_people_contracts`. Persona (doc único por país+tipo+número,
  SIN unique de email), apoderado–niño, contrato con país (ADR-0009).
  **Vigencia: UNA función** (`contracts/domain/vigencia.ts`) + gemelo SQL
  `SQL_CONTRATO_VENCIDO` (+2 días de gracia) — NO reimplementar. Edad
  validada contra fecha de nacimiento a la fecha de inicio. **Aprobar
  contrato = ALTA ÚNICA transaccional** (credenciales autogeneradas +
  correo sintético + rol alumno por país; Fase 7 le sumará matrícula).
  OnHold/reactivar extiende `final_contrato` por los días pausados.
  Inactivar = cascada sincronizada (contrato+persona+credenciales+sesiones)
  solo si no hay otros contratos vivos. Worker: barrido de vencidos cada
  6 h. Permisos: personas.gestionar/ver, contratos.gestionar/ver.
  UI: /panel/personas y /panel/contratos.
- **Fase 6 (`scheduling`) completada**: migración `20260726000000_scheduling`
  (salón, slots, sesiones, feriados, suspensiones). Salón: zona operativa Y
  calendario de feriados configurables por salón; slots SESION/CLUB.
  **Generación determinística** (`scheduling/domain/generacion.ts`): conteo
  NOMINAL desde `(inicio, final_curso, díaSemana)`; feriados/suspensiones
  corren la sesión AL FINAL conservando el total; el fin real es la última
  sesión y `final_curso` jamás cambia (invariante probado: regenerar N
  veces = mismo conjunto). Feriados por CÓDIGO 4 países (computus de
  Pascua, Ley Emiliani CO, trasladables CL) + `feriados-extra.ts` curado
  que SOLO SUMA; se materializan en tabla antes de generar. Suspensión:
  motivo obligatorio, en tabla, con regeneración inmediata. Inserción de
  sesiones POR LOTES (unnest). `starts_at` = pared de reloj del salón →
  UTC (DST chileno probado). Permisos: salones.gestionar/ver.
  UI: /panel/salones (+ detalle con suspender/regenerar).
- **Fase 7 (`enrollment`) completada**: migración
  `20260727000000_enrollment_contract_numero` (matrículas + `numero` SERIAL
  en contratos). **La lista del salón se DERIVA de matrículas ACTIVAS** —
  no hay tabla de inscripciones que se desincronice. `matricularTx` es el
  núcleo único compartido por todos los caminos (matricular directo,
  aprobar contrato con salón, cambio académico): cupo con `FOR UPDATE`
  (sin carreras), tipo de curso validado, una ACTIVA por contrato.
  Cambio académico: cierra con motivo (historial) + crea nueva validando
  cupo, en una transacción. La cascada de inactivar contrato CANCELA la
  matrícula. Aprobar contrato acepta `classroomId` opcional (alta única
  completa). **Buscador global** en el panel (`/api/search` + /panel/buscar):
  N° de contrato, documento, nombre, apellido o username, respetando
  alcance por país. Permisos: matriculas.gestionar/ver (guía ve).
- **Fase 8 (`attendance` + `assessment`) completada**: migración
  `20260728000000_attendance_assessment`. Asistencia: UNA marca por
  (sesión, niño) con UPSERT — individual y masiva pasan por el MISMO
  camino (`marcarAsistencia`); JUSTIFICADO exige justificación; la lista
  muestra AVISO cuando la fecha es feriado en el país del NIÑO (política
  de docs/operacion/politica-feriados-asistencia.md). Cuestionarios:
  intentos con umbral 70/100 (PROVISIONAL — `assessment/domain/calificacion.ts`,
  reintentos ilimitados), validando matrícula activa en el curso del quiz.
  **Hooks de Fase 9**: `marcarAsistencia` y `registrarIntento` son LOS DOS
  únicos caminos que dispararán la función central de progresión.
  UI: clic en una sesión del salón → página de asistencia con quiz inline.
  `ver-base-datos.bat` abre Prisma Studio (puerto 5555). Permisos:
  asistencia.gestionar/ver, evaluaciones.gestionar/ver (guía gestiona).
- **Fase 9 (`progression`) completada**: migración `20260729000000_progression`.
  **LA FUNCIÓN CENTRAL** (`progression/application/recalcular.ts`):
  4 prácticas aprobadas + Level Up aprobado ⇒ nivel COMPLETADO ⇒ MEDALLA;
  TODOS los niveles del curso completados ⇒ DIPLOMA (derivado de los niveles
  reales del curso, agnóstico al conteo — hoy 5). DERIVADA de assessment (nada se edita a mano),
  IDEMPOTENTE (premios una sola vez) y RECUPERABLE (cualquier invocación
  re-deriva todo). NO cuenta sesiones asistidas. **Caminos que la
  disparan** (verificados por `progression/tests/caminos-progresion.test.ts`
  — agregar un camino nuevo EXIGE sumarlo ahí): 1) marcarAsistencia, 2) registrarIntento, 3) worker recalculo_global cada 12 h (red de
  seguridad). Awards con `notificado_en` NULL hasta que Fase 10 envíe por
  WhatsApp. UI: /panel/progreso/[childId] (enlace 📈 en el roster).
  Permiso: progresion.ver.
- **Fase 10 (`reporting` + `notifications` + `files`) completada**:
  migración `20260730000000_notifications_files`. Notifications: patrón
  OUTBOX (encolar barato; el worker despacha cada 5 min con reintentos,
  máx 5) — LogSender sin credenciales, WhatsAppCloudSender (Meta) cuando
  existan WHATSAPP_TOKEN/PHONE_ID; `notificarPremiosPendientes` cada 15
  min arma el mensaje de medalla/diploma al WhatsApp REAL del apoderado.
  Files: StoragePort + LocalStorage (STORAGE_DIR) — PRIVADO por defecto,
  descarga solo autenticada, MIME allowlist (pdf/jpg/png/webp), 10 MB máx,
  claves impredecibles; adaptador Spaces se enchufa en Fase 11. Reporting:
  asistencia por salón/mes con `AT TIME ZONE cl.timezone` EN SQL,
  ocupación de salones, contratos por país (con alcance). UI:
  /panel/reportes. Permisos: reportes.ver, archivos.gestionar/ver.
- Plan de fases: ver `PROMPT_KIDS2026.md` sección 11. Siguiente: Fase 11
  (despliegue DigitalOcean — requisitos en docs/runbooks/).

## Gestión de roles y permisos (2026-07-23)

- **Rol = conjunto de permisos marcables** (RBAC editable desde el panel).
  UI /panel/usuarios con 2 pestañas: Usuarios (crear staff con password
  inicial + asignar roles con alcance por país) y Roles (crear rol + marcar
  sus permisos con checkboxes). `superadmin` es INTOCABLE (siempre todos
  los permisos; la app y el seed lo fuerzan). El seed llena permisos de un
  rol NO-superadmin solo si está vacío → respeta ediciones del panel.
  Editar permisos de un rol invalida toda la caché de perfiles.
- Desde 2026-08-26 el árbol de permisos incluye los del MENÚ (`seccion.*` y
  `menu.*`), separados de los funcionales — ver "Menú por secciones y Tablero".

## Panel del alumno (2026-07-23)

- **Interfaz propia del niño** en `/mi-panel` (layout separado del /panel
  administrativo, decisión de diseño). `GET /api/student/dashboard` deriva
  TODO del usuario logueado (findPersonByUserId) — un niño solo ve SUS
  datos; compone people+enrollment+attendance+progression en la capa app.
  Muestra: próxima clase (con botón "Entrar a clase" si hay meeting_url),
  salón/guía/campaña, resumen de asistencia (asistidas/ausentes/
  justificadas/total), progreso por nivel con medallas y diploma, y agenda
  de próximas sesiones. Requiere permiso `panel.alumno`. El login enruta a
  /mi-panel si el usuario es alumno (y no staff), al /panel en otro caso.
- **Diseño (2026-08-25, estilo MOSAICO)**: /mi-panel a 2 columnas — izquierda:
  banner del curso + info + sesión próxima (link Zoom); derecha: Sesiones (tiles)
  - progreso + nivel anterior/actual/próximo + "¿Cómo voy?". **Imagen de portada
    por (curso, nivel)** (`/panel/mantenimiento-cursos/imagenes`): reutiliza el
    módulo `files` (entidad `catalog_imagen_curso`, entidadId `CURSO:NIVEL`, la
    última subida es la vigente); subir=`catalogo.gestionar`, servir=cualquier
    autenticado (arte curricular, no dato de menores). El dashboard resuelve
    `imagenCursoUrl` según el nivel actual; si falta, banner de color por nivel.
- **Nav superior + modales (2026-08-26, estilo MOSAICO)**: bajo el encabezado hay
  una barra (`NAV_ITEMS`) con botón verde **Inscripción Clubes** y accesos
  Actividades/Recursos/Material/**Historial**/**Avance**/**¿Cómo voy?**/Instructivos/
  Perfil. **¿Cómo voy?**, **Historial** y **Avance** abren MODAL (no viven en el
  cuerpo); el resto es acceso futuro. "¿Cómo voy?" = progreso del nivel + acordeón
  de niveles→Stages. El banner del curso ya no lleva texto (va en un encabezado
  aparte, 16:9) y hace lightbox al clic. **Mis próximas clases** vive en la columna
  derecha y muestra la **ventana de 14 días** (`agendaProximas(classroom, dias=14)`,
  incluye clubes). **Pie** con soporte por WhatsApp (Soporte Usuario/Académico/
  Finanzas; números en la constante `SOPORTE`, hoy placeholder).
- **Arte curricular por TIPO (2026-08-26)**: `imagen-curso.ts` se generalizó a
  `subirArte`/`arteId` con tipos **banner** (`catalog_imagen_curso` por CURSO:NIVEL,
  admite `NIVEL_TODOS`), **premio** (`catalog_premio_nivel` por CURSO:NIVEL),
  **mapa** (`catalog_mapa_curso` por curso) y **vobo** (`catalog_vobo`, GLOBAL).
  Todo se sirve por `/api/catalog/imagen-curso/[id]`. UI `/panel/mantenimiento-cursos/imagenes`
  gana selector de Tipo (previo cuadrado con tablero para PNG transparentes). En
  "¿Cómo voy?" el premio de cada nivel se muestra como imagen (respaldo emoji),
  sombreado→a color al completar.
- **Pantalla "Avance" + hotspots (2026-08-26, Fase B)**: migración
  `20260826000000_catalog_hotspots` (`catalog_arte_hotspot`, una fila por
  scope/curso/nivel, `data` JSONB con coordenadas % de unidades/premio/centro;
  scope **ISLA**=sobre el banner del nivel, **MAPA**=posición de esa isla sobre el
  mapa del curso). CRUD `GET|PUT /api/catalog/hotspots` (ver/gestionar catálogo);
  `getHotspotsCurso` alimenta el dashboard. **Editor** `/panel/mantenimiento-cursos/mapa`:
  clic sobre la imagen para marcar cada unidad 1–4 y el premio (ISLA) o el centro
  (MAPA). El **modal Avance** (ítem del nav) muestra el mapa del curso con VoBos en
  unidades vistas y VoBo grande en el centro de islas completas; clic a una isla la
  abre grande (bloqueada=sombreada, actual=VoBos en lo visto, completa=VoBo sobre el
  premio). El VoBo usa la imagen `vobo` (respaldo: check verde). Movimiento = CSS
  sobre los marcadores (no se anima el raster).
  **VoBo (2026-08-29)**: el sello dejó de ser un cuadrado (250×250) y pasó a ser el
  personaje con el visto verde, VERTICAL (2:3). Como se pinta con `objectFit: contain`
  en caja cuadrada, los tamaños de `voboEl(...)` en /mi-panel se subieron ~1,35×
  (2.2/4.2rem en el mapa, 2.8/3.8rem en la isla) para conservar la misma presencia.
  El PNG original traía el tablero de transparencia INCRUSTADO (colorType 2, sin
  alfa): se recortó por relleno desde el borde (candidato = min canal ≥ 232 y
  max−min ≤ 16, que puentea los dos grises del tablero sin comerse la ropa).
- **Mis talleres (2026-09-09)**: caja bajo "Sesión próxima" con los TALLERES del
  salón en la ventana de 14 días. El taller se crea como **evento ACADÉMICO** y dura
  **una o dos horas** (`DURACIONES_TALLER`, validado en `crearEvento`); sesiones y
  clubes conservan el rango abierto porque los fija el horario del salón. El modal
  cambia el campo de duración a un desplegable cuando el tipo es Taller.
  `agendaProximas` gana `observaciones`, `nivel` y `esEvento`; el dashboard expone
  `talleres`. Las dos columnas pasan a 5/4 por CSS (`.lgs-dos-col`, apiladas bajo
  62rem) y la última caja de la derecha lleva `flex: 1` para que ambos extremos
  inferiores coincidan. **Pendiente**: el alumno NO se inscribe — ve los talleres de
  su salón. La inscripción por el propio alumno chocaría con el modelo de cohortes
  ("el niño no agenda"); si el negocio la quiere, es decisión aparte.
- **Lámina y juegos por UNIDAD (2026-09-10)**: al tocar "Unidad N" sobre la isla se
  abre un modal con la **lámina** de esa unidad y sus **enlaces de juegos**. Antes los
  marcadores de unidad eran decorativos (`marca` pone `pointerEvents:none`); ahora el
  contenido es un botón que lo repone, y se pintan las 4 unidades —las vistas con
  VoBo, las que faltan con un aro punteado— porque la lámina se consulta aunque no se
  haya llegado.
  - **Arte tipo `unidad`** (`catalog_imagen_unidad`, clave `CURSO:NIVEL:N`) con su
    selector en `/panel/mantenimiento-cursos/imagenes`.
  - **Los juegos SON las actividades de la lección** (2026-09-11): se cargan UNA vez
    en Gestión de Contenido o por CSV (`catalog_curso.actividades`) y de ahí se leen.
    La tabla `catalog_unidad_juego`, que los guardaba por segunda vez, se eliminó
    (migración `20260911000000`): el mismo enlace en dos lugares era pedir que se
    desincronizaran. El editor `/panel/mantenimiento-cursos/juegos`
    (`catalogo.gestionar`, `GET|PUT /api/catalog/unidad-juegos`) ya no crea ni edita
    nada — solo decide DÓNDE va cada actividad sobre la lámina.
  - **De la unidad de texto a la casilla**: `catalog_curso.unidad` es texto libre y
    trae "Unidad 0", "Repaso 3" y erratas como "Evalucion 6". `unidadMapa`
    (`catalog/domain/unidad-mapa.ts`, con pruebas) es LA regla: solo "Unidad 1".."Unidad
    4" caen en el mapa; "Unidad 0" es el cartel WELCOME y repasos y evaluaciones no
    tienen casilla. Lo que no mapea no se pierde —sigue en su lección—, solo que no se
    abre desde el mapa. `UNIDADES_MAPA = 4` es la única constante (la reusa
    `imagen-curso.ts`).
  - **El enlace ES el cartel dibujado (2026-09-11)**: no se marca un punto sino una
    ZONA — `x`/`y` del centro más `w`/`h` del recuadro, todo en % de la imagen y
    guardado DENTRO de la actividad. El cartel ya está pintado en la lámina, así que
    ponerle encima un botón 🎮 tapaba el dibujo: ahora la zona va **transparente** y
    solo se enciende al pasarle por encima o enfocarla con el teclado (`.lgs-cartel`,
    un halo que late para decir "esto se toca", apagado con `prefers-reduced-motion`).
    En el editor se ARRASTRA sobre el cartel; un clic simple (< 1,5 % en cualquier eje)
    usa el tamaño estándar. Ese estándar (`ANCHO_ZONA`/`ALTO_ZONA`) viaja RESUELTO en
    la respuesta del GET y lo aplica el servidor al guardar, para que el cliente no
    copie la cifra.
  - El PUT recibe `posiciones` y reescribe `actividades` conservando nombre y enlace
    TAL CUAL, para que este editor no pueda estropear lo que se carga en Gestión de
    Contenido. Las dos coordenadas van juntas o ninguna, y un tamaño sin posición se
    RECHAZA: la ruta lo pasa todo tal cual para que la regla del dominio pueda
    contestar 400 — sanearlo en el borde perdía la zona en silencio. Quitar la zona
    borra las cuatro cifras, no solo el punto. En la lista de abajo del panel del niño
    quedan SOLO los juegos sin zona.
  - **El GET devuelve también `sinCasilla`**: las lecciones del nivel que TIENEN
    actividades pero cuya unidad no es casilla del mapa. Sin eso, cargar cinco juegos
    en una lección de "Unidad 0" y no verlos parecía un fallo — el editor solo podía
    decir "esta unidad no tiene juegos", que es cierto y no ayuda. Ahora los nombra y
    dice dónde cambiarlos.
  - **Trampa**: reimportar por CSV esa lección SOBRESCRIBE `actividades` y se lleva las
    posiciones; hay que volver a colocarlas.
  - El dashboard expone `unidades` y `juegosUnidad` por nivel.
- **Comentarios del guía (2026-08-28)**: bajo "Mis próximas clases", del más
  reciente al más antiguo (`comentariosDeGuia`). Devuelve SOLO `comentario_usuario`:
  la `nota_privada` de la misma fila es del equipo y NUNCA viaja al panel del niño.
- **Perfil (2026-08-26)**: foto (la primera vez pide subirla), apoderado, correo,
  teléfono y cumpleaños. La foto se sirve solo al dueño de la sesión, sin parámetro
  de id (regla 9: datos de menores).
- **Personajes (2026-08-26)**: `src/ui/Personaje.tsx` con 19 poses tipadas servidas
  desde `public/personajes/*.webp` (solo WebP, sin respaldo PNG). `poseZoom(estado)`
  traduce el estado de la ventana de Zoom a la pose de Rocky; `VacioConPersonaje`
  ilustra los estados vacíos. El arte de ORIGEN vive fuera del repositorio
  (ver `arte/README.md`).
- **Reinicio al entrar (2026-08-26)**: `src/ui/sesion.ts`. `cerrarSesion()` usa
  `window.location.replace`, NO `router.replace`: este último solo reemplaza la
  entrada actual del historial y el Router Cache de Next repintaba el panel anterior
  al volver. Se suma una guardia `pageshow` contra el bfcache y el login navega con
  `replace`. No volver a poner `router.replace` en el cierre de sesión.
- **Acceso a Zoom (2026-08-25, replicado de MOSAICO)**: lógica PURA en
  `src/ui/zoom-window.ts` (cliente): ventana de ingreso `[inicio − 5 min,
inicio + 15 min]`; tras entrar, **reconexión** hasta 10 min antes del fin
  (fin = inicio + `duracion_min`). Estados `espera → disponible → vencido |
cerrado`. Iconos en `src/ui/ZoomAccessButton.tsx`: cámara azul + check verde
  (disponible, enlace clicable) / cámara gris + reloj naranja (bloqueado), con
  mensaje por estado. Se compara contra el INSTANTE `starts_at` (UTC), no la
  hora local. El "entrar a tiempo" solo habilita la reconexión (recordada por
  sesión en `localStorage`; NO penaliza asistencia). Enlace = `meeting_url` del
  salón. El guía ve "🎥 Ir a Zoom" en la página de asistencia de la sesión
  (siempre, sin ventana). Pendiente: bitácora server-side de accesos
  (minutos-desde-inicio) para cruzar con el reporte de Zoom.

## Sitio público / landing (2026-07-23)

- **Landing de marketing en la raíz `/`** (`src/app/page.tsx`, cliente):
  ruta Next DELGADA, solo presentación, SIN reglas de negocio (respeta el
  monolito: la lógica vive en `modules/`, esto es `app/` puro). Estilos en
  `src/app/landing.css` AISLADOS con el prefijo `.lgs-landing` (no afectan
  login/panel); tema propio claro/oscuro con `.lgs-landing.dark|.light`.
  Contenido tomado de letsgospeak.cl/lgs-kids (6–13 años, en vivo, grupos
  1–9, niveles Rookie→Legendary, medallas, guías, LetsGoSpeak). La app vive
  en `/login` y `/panel`; el footer enlaza a `/login`.
- **Versión estática** en `landing-estatica/index.html`: el MISMO diseño en
  un HTML autocontenido para subir a **Hostinger** (hosting compartido) en
  lgskidsplataforma.com. La plataforma completa (Node + Postgres) irá a
  DigitalOcean, previsiblemente en `app.lgskidsplataforma.com`.
- **Tema WordPress (2026-08-25/26)**: lo que corre HOY en lgskidsplataforma.com es
  `landing-estatica/wp-theme/lgs-kids-landing/` — el mismo diseño como tema, para
  que la landing siga siendo mantenible desde WordPress (textos por el Customizer)
  en vez de un HTML plano. Se despliega con el **CLI de Hostinger** (`hostinger`,
  token en `~/.hostinger.yaml`).
  - `hostinger wordpress themes deploy` RENOMBRA el destino a `<slug>-old-<hash>`
    antes de mover; si algo falla queda un tema duplicado. Subir a la ruta limpia y
    activar con `wordpress themes activate`.
  - **Trampa de caché**: el hCDN cachea POR `Accept-Encoding`, así que un cambio de
    CSS puede seguir viéndose viejo en brotli aunque en gzip ya esté nuevo. Subir la
    `Version:` del tema (la URL del CSS la arma `wp_get_theme()->get('Version')`) y
    `hosting cache clear-website`. Verificar con `curl --compressed` y un perfil
    temporal de Chrome (`--user-data-dir`), no con recarga forzada.
- **Personajes en la landing (2026-08-25/26)**: cuatro personajes de **cuerpo entero**
  repartidos por el cuerpo de la página (la perrita se llama **Simba**). El arte
  desplegado vive en `wp-theme/lgs-kids-landing/assets/personajes/` (WebP + respaldo
  PNG); el de origen NO está en el repositorio (ver `arte/README.md`).
- **Sesión en el cliente**: las páginas del panel usan `@/ui/api-fetch`
  (`apiFetch`), que ante un 401 rota el refresh token y reintenta —así la
  sesión no se cae a los 15 min del access token. NO volver a poner
  `router.replace("/login")` directo sobre un 401 sin pasar por `apiFetch`.
- `pnpm demo:alumno` crea un alumno matriculado de punta a punta (con
  asistencia y medalla) e imprime usuario/clave para revisar `/mi-panel`.

## Vocabulario del negocio (obligatorio en código y UI)

**Guía** (no profesor) · **Sesión** (no clase) ·
**Salón** · **Campaña**. **Club** y **Taller** son tipos DISTINTOS de evento
(`scheduling_slot_tipo`) desde 2026-08-28 — antes esta guía decía "Club, no taller",
regla que dejó de valer cuando el negocio los separó. Niveles: Rookie → Champion → Elite → Legendary →
Ultimate Stage (5 niveles; duración 2/2/3/3/2 meses).

## Comandos

```bash
pnpm dev          # desarrollo
pnpm verify       # lint + tipos + pruebas + arquitectura + build (cierre de fase)
# OJO: `pnpm test` SALTA las pruebas de integración si faltan las variables.
# CI sí las corre, así que en local pueden verse 13/23 archivos "en verde"
# mientras CI está en rojo. Para correrlas de verdad:
INTEGRATION_TESTS=1 DATABASE_URL=postgresql://kids:kids_dev@localhost:5432/kids2026 pnpm test
pnpm test:arch    # solo límites de módulos (dependency-cruiser)
docker compose -f infra/docker/docker-compose.yml up -d   # Postgres local
```

## Estructura

- `src/modules/<m>/` — 14 módulos de negocio; anatomía
  domain/application/infrastructure/api/ui + `index.ts` (API pública, lo
  ÚNICO importable desde fuera; lo verifica `.dependency-cruiser.cjs`).
- `src/platform/` — técnico transversal SIN reglas de negocio: config (env
  con Zod), db (pool pg, max 8), errors, http (`handler`,
  `handlerWithAuth`), time (UTC ↔ zona operativa), ids, logging (JSON +
  correlation ID).
- `src/app/` — rutas Next.js delgadas. Health: `/api/health/live` (sin BD) y
  `/api/health/ready` (con BD).
- `worker/` — tareas programadas (esqueleto).
- `docs/adr/` — 9 ADRs vigentes. Léelos antes de decidir arquitectura.

## Reglas que NO se negocian (resumen; detalle en docs/architecture/overview.md)

1. `final_curso` NUNCA se reescribe; el fin real es la última sesión.
2. Suspensiones y feriados en tabla — la regeneración de un curso es
   destructiva y los recrea desde `(inicio, final, horario)`.
3. Instantes en UTC; zona operativa POR SALÓN; reportes con `AT TIME ZONE`
   en SQL. Nunca agrupar fechas en JS con la zona del cliente (ADR-0007).
4. UNA función central de progresión (4 lecciones + Level Up), disparada
   desde TODOS los caminos que registran asistencia o califican.
5. UN solo lugar transaccional donde nace un alumno (enrollment).
6. Autorización en el servidor, endpoint por endpoint (`handlerWithAuth`).
7. Login por username autogenerado; correo sintético para hermanos
   (`@alumnos.lgskidsplataforma.com`, no enrutable).
8. Campaña GLOBAL; el país vive en contrato/persona; calendario de feriados
   configurable por salón (ADR-0009 y
   `docs/operacion/politica-feriados-asistencia.md`).
9. Archivos privados por defecto (datos de menores).
10. `process.env` solo en `src/platform/config` (regla ESLint).
11. Operaciones multi-tabla SIEMPRE con `withTransaction`.

## Versiones (registradas 2026-07-22)

Node 24.11.0 · pnpm 11.16.0 · Next 16.3.4 · React 19.2.8 · TypeScript 5.9.3
(NO subir a TS 7: rompe Next/ESLint/depcruise) · ESLint 9.39.5 (NO subir a
10: eslint-plugin-react incompatible) · Zod 4.4.3 (API nueva: `z.url()`) ·
pg 8.22.0 · Vitest 4.1.10 · dependency-cruiser 18.1.0 · Prettier 3.9.6.

- **Next 16.3.4 (2026-09-10, subido desde 16.2.11 por seguridad)**: dos avisos
  CRÍTICOS publicados el 8-sep afectaban a >=16.0.0 <16.3.3 —
  `GHSA-p293-qw3h-jr36` (CVE-2026-75604): ejecución remota de código SIN
  autenticar en servidores sobre sistema de archivos **Windows**, sin mitigación
  conocida; y `GHSA-2xp9-vwfh-vxw4`: RCE en el optimizador de imágenes al procesar
  **AVIF** (el fallo está en `libheif`, vía `sharp`). El segundo nos rozaba apenas
  —`next/image` solo optimiza assets LOCALES, no hay `images.remotePatterns`, y el
  arte subido se sirve con `<img>` por `/api/catalog/imagen-curso/[id]`—, pero el
  primero sí, porque el entorno de desarrollo corre en Windows. `eslint-config-next`
  se sube a la par: van sincronizados.
- **`@prisma/client` es devDependency, no de producción**: nadie lo importa —el
  acceso a datos va por SQL parametrizado con `pg`— y como dependencia de
  producción arrastraba el CLI de Prisma y sus avisos de seguridad al grafo
  desplegado. Si algún día se adopta el client, hay que moverlo de vuelta.
- **Los overrides de pnpm viven en `pnpm-workspace.yaml`, NO en el campo `pnpm`
  de package.json**: pnpm 11 ignora ese campo (solo avisa). Ese archivo lleva
  también `allowBuilds`, la lista de paquetes autorizados a ejecutar scripts de
  instalación — no borrarla al editar.
- Al fijar un override, **acotar la línea de versión**: `nanoid: ">=3.3.18"`
  resuelve nanoid 6 y arrastra postcss a una versión anterior a la que otro
  override ya subía por seguridad. Va `^3.3.18`.

## Intake de beneficiarios desde LGS (2026-08-19, ADR-0010)

Entrada desde LGS/MOSAICO: un beneficiario niño se registra en KIDS contra una
campaña abierta + curso (por edad) + salón con cupo, reteniendo el cupo como
matrícula `RESERVADA` hasta aprobar (el alta única activa RESERVADA→ACTIVA).
`contracts_contract.external_ref` (N° LGS, idempotente) + `firmado`. Núcleo
único `crearReservaBeneficiario`. Dos puertas al mismo núcleo: el **wizard**
`/panel/reservas` (JWT) y la **puerta de servicio** módulo `intake`
(API-key `x-api-key` / `LGS_INTAKE_API_KEY`, `handlerWithServiceAuth`):
`GET /api/kids-intake/availability`, `POST /api/kids-intake/reservations`,
`POST /api/kids-intake/reservations/{externalRef}/approve`. Auditoría contra el
usuario de sistema `sistema-lgs`. **Catálogo de horarios** reutilizable por tipo
de curso, **grupo de país** (`scheduling_horario.grupo_pais`: `01`=Chile,
`02`=Colombia/Ecuador/Perú — por el desfase horario CL vs. el resto) y **salón**
(`salon_numero`: el horario COMPLETO es un salón — todos sus días son el mismo;
el 1er horario suele ser Salón 01, el 2º Salón 02). Unicidad de etiqueta por
(tipo, grupo, salón). Editable (`PUT /api/scheduling/horarios/[id]` →
`actualizarHorario`, reemplaza bloques), activable/desactivable (`PATCH`).
Mantenible en `/panel/horarios`, alimenta el selector al crear salón (materializa
`scheduling_slot`; NO es texto como Mosaico) y el wizard de campaña usa este
catálogo para generar JUNIOR/YOUNGSTER Salón 1–6 por grupo.
**Salón editable (2026-08-24)**: `PATCH /api/scheduling/classrooms/[id]` →
`editarSalon` (cupo, guía, `activo`); al **desactivar** un salón sale del wizard
de contratos y del intake (ambos filtran `activo`). `DELETE` → `eliminarSalon`
(borra salón+sesiones+slots+suspensiones; SE BLOQUEA con 409 si el salón tiene
matrículas — desactivar en su lugar). Su detalle muestra las fechas de la campaña
(editar fin/cierre desde ahí afecta a TODA la campaña). El **detalle de campaña**
(`/panel/campanias/[id]`) lista todos los salones en una tabla (Tipo, Salón,
Guía, Horario, Inicio/Final curso, Cierre matríc., Cupos, Estado, Acciones) y
tiene **"Generar salones del catálogo"** (`POST /api/scheduling/campaigns/[id]/generate`
→ `generarSalonesDesdeCatalogo`): crea un salón por cada horario activo del
catálogo (ambos grupos, ambos tipos) con **guía pendiente** y cupo 12,
idempotente por nombre. El menú lateral llama **"Calendario"** a `/panel/salones`.

## Alta del guía por enlace (2026-08-29)

- La CUENTA del guía se sigue creando en **Usuarios y roles** (usuario + rol con
  alcance por país). Lo nuevo es que administración no tiene que llenarle la ficha:
  desde **/panel/guias** emite un **enlace** y el guía carga sus propios datos en el
  wizard público **`/nuevo-guia`** (3 pasos, como MOSAICO): datos básicos → contacto
  → Zoom y foto.
- **Diferencia deliberada con MOSAICO**: allí `/nuevo-guia` es una página ABIERTA
  (cualquiera con la URL se da de alta como guía y crea su usuario). Aquí la página
  es pública pero la credencial es el **token del enlace**: 32 bytes al azar, ligado
  a UN guía activo, de **un solo uso** y con vencimiento (`DIAS_VIGENCIA_INVITACION`
  = 7). Migración `20260829000000_invitacion_guia` (`scheduling_guia_invitacion`).
- De la base solo sale el **hash** del token; el token vive únicamente en la URL. Por
  eso el enlace se muestra UNA vez, al emitirlo. Índice único parcial
  `scheduling_guia_invitacion_vigente`: **un solo enlace vivo por guía** — emitir uno
  nuevo revoca el anterior en la misma transacción.
- Reglas puras en `scheduling/domain/invitacion.ts` (token, hash, estado
  VIGENTE|USADA|REVOCADA|VENCIDA, vencimiento, armado del enlace) con pruebas en
  `tests/invitacion.test.ts`. Aplicación en `application/invitacion-guia.ts`.
- **Guardar la ficha y consumir el token van en la MISMA transacción**: si la ficha
  falla (por ejemplo, la sala de Zoom ya es de otro guía), el enlace tiene que seguir
  sirviendo. `guardarFichaGuia` acepta `client` para poder sumarse a esa transacción.
- Endpoints: `POST|DELETE /api/scheduling/guias/invitacion` (emitir/revocar,
  `usuarios.gestionar`) y la puerta pública `GET|POST /api/public/guia-invitacion`
  (sin sesión; el POST es multipart y acepta la **foto**, restringida a JPG/PNG/WebP
  porque `files` admite además PDF). La foto va al módulo `files`
  (entidad `scheduling_guia_foto`) y llena `scheduling_guia.foto_file_id`.
- `GET /api/scheduling/guias` devuelve además `enlaces` (estado del último por guía)
  y `diasVigencia`, para que la UI no copie la constante del dominio.

## Menú por secciones y Tablero (2026-08-26)

- El menú lateral se declara UNA vez en `SECCIONES_MENU` (`access/domain/permisos.ts`)
  como árbol padre→hijos: **Tablero** (suelto, primero) · **Académica** (Calendario,
  Mantenimiento Académico) · **Operación** (Kids, Contratos, Reservas LGS) ·
  **Administración** (Usuarios y roles, Reportes, Auditoría, Guías, Aviso de login) ·
  **Guía** (Mis clases, Mis salones, Mis niños).
- **Cada ítem exige DOS permisos**: el funcional (lo que la pantalla hace) y el de
  menú (`menu.*`); el grupo se prende con `seccion.*`. Esto no es redundancia: antes
  la visibilidad colgaba del permiso funcional y "Mantenimiento Académico" no se le
  podía apagar al guía sin quitarle `catalogo.ver`, que necesita para los
  cuestionarios. Por lo mismo "Reservas (LGS)" tiene `menu.reservas` propio.
- El seed AÑADE permisos, nunca quita (respeta lo editado en el panel);
  `menu.mantenimiento` se siembra desde `catalogo.gestionar` para que el guía no lo
  herede. `superadmin` sigue teniendo todo por la fuerza.
- Al entrar al panel se aterriza en **/panel/tablero**.
- Consultas del tablero en `reporting/application/tablero.ts`: `resumenTablero`,
  `salonesSinGuia`, `clasesDeHoy`, `sesionesSinMarcar`. "Hoy" se resuelve con
  `AT TIME ZONE` de la zona DEL SALÓN, no la del servidor (ADR-0007).
- **Trampa ya pagada**: para separar al guía PURO de coordinación se usa
  `salones.gestionar`, **NO** `salones.ver` — el guía tiene `salones.ver` (lo
  necesita para su calendario), y usarlo aquí le mostraba el tablero de TODA la
  plataforma. Mismo criterio en `agendaHandler` y `listarSalonesHandler`.

## Calendario: registro de sesión y eventos (2026-08-27/28)

- `/panel/salones` se renombró a **/panel/calendario**; `next.config.ts` mantiene
  redirecciones permanentes, incluidas las de detalle y sesión.
- Un evento abre **MODAL** (`calendario/SesionModal.tsx`), no una página. El nombre
  del guía SIEMPRE se ve; "Cambiar guía" y "Suspender" solo con `salones.gestionar`.
- **NO se creó una base "booking"**: `attendance_attendance` ya es el registro por
  (sesión, niño) y `scheduling_session` ya es el calendario. Una tabla paralela
  abriría un segundo camino de escritura invisible para la función central de
  progresión (regla 4). Se le agregaron columnas: participación, comentario para el
  alumno, nota privada y "requiere atención". `upsertMarca` usa `COALESCE` para que
  el marcado masivo no borre lo que el guía escribió.
- **Registro de sesión** (`application/registro-sesion.ts`, migraciones
  `20260827000000/…001`): el guía cierra la sesión con la **hora de pared** del salón
  (se sugiere la actual) y una nota. Si no hay ninguna marca, exige confirmación
  explícita (`sin_asistentes`): "vino cero niños" y "el guía olvidó marcar" no son lo
  mismo en el reporte. Cerrar fija `guia_user_id` si estaba vacío — el salón puede
  cambiar de guía y el histórico debe recordar quién la dictó. `hora_real` es TIME
  (hora de pared) y `cerrada_en` es el instante: dos cosas distintas, dos columnas.
- **Refuerzos (2026-09-08)**: el guía SOLICITA repetir una sesión desde el modal;
  coordinación autoriza en **/panel/sesiones/refuerzos** (`salones.gestionar`).
  Autorizar crea una **clase EXTRA** llamando a `crearEvento` —el mismo camino de
  los eventos sueltos—, así que nace **sin slot** y la regeneración destructiva no
  se la lleva. `sesion_refuerzo_id` (migración `20260908000000`) da trazabilidad en
  ambos sentidos. Aprobar y crear van en la MISMA transacción: si la hora choca con
  otra sesión del salón, la solicitud sigue PENDIENTE en vez de quedar aprobada sin
  clase (`crearEvento` acepta `client` para sumarse a esa transacción).
  **Tres diferencias con MOSAICO**, que al autorizar "extiende el curso una semana,
  crea sesiones + bookings y detiene el avance una lección":
  1. Aquí NO se extiende nada: `final_curso` nunca se reescribe (regla 1) y el
     refuerzo va con `numero = 0`, fuera de la numeración del curso.
  2. No hay bookings: la lista sale de las matrículas ACTIVAS (Fase 7).
  3. El avance NO se detiene: se deriva de evaluaciones, no de sesiones dictadas
     (regla 4). `repetir_leccion` solo rotula, nunca toca progresión.
- Por ser clase extra hay que darle **fecha y hora propias**: el horario regular del
  salón ya está ocupado y hay índice único por (salón, instante). MOSAICO las calcula
  solo porque allá el refuerzo se anexa al curso; aquí no.
- **Lección solicitada** (`curso_ref_id` → `catalog_curso`, migración
  `20260908000001`): el guía señala QUÉ lección repetir eligiéndola de la referencia
  curricular (el modal ya la carga para Material/Recursos). Es **referencia**, no dato
  operativo: sirve para que coordinación sepa de qué se trata y para rotular la clase
  extra —que hereda el `nivel` y lleva la lección en `observaciones`—. Lo operativo
  sigue siendo agendar la sesión extra para ese curso. Es el primer uso real de
  `catalog_curso` desde `scheduling`.
- Invariantes probados en `tests/refuerzo-integration.test.ts`.
- El menú lateral de KIDS es de DOS niveles, así que lo que en MOSAICO es el submenú
  `Académico › Sesiones` aquí es la página-índice **/panel/sesiones** con tarjetas
  (mismo patrón que Mantenimiento Académico). Permiso de menú `menu.sesiones`,
  sembrado desde `salones.gestionar` — un permiso de menú nuevo NO basta con
  declararlo: hay que sumarlo al seed y correr `pnpm seed`, o el ítem queda
  invisible para todos salvo `superadmin`.
  Tarjetas: **Refuerzos** y **Eventos administrativos**; Suspensiones y Feriados
  quedan marcadas "(pronto)" hasta traerlas del calendario.
- **Eventos administrativos** (`/panel/sesiones/eventos-administrativos`): única
  vista COMPLETA de `scheduling_evento_admin` — en el calendario cada guía solo ve
  los suyos. Se consultan por rango de fechas (abre en el mes en curso) y el detalle
  muestra la audiencia por nombre. Se siguen CREANDO desde el calendario
  (`eventos.crear`). `eventosAdmin` gana `pais` y `audiencia` (usernames): antes solo
  devolvía el conteo, que no alcanza para gestionarlos. Leer exige `salones.ver` y la
  consulta se acota al guía cuando no gestiona salones. Filtros por tipo y país.
- **Tipos y duración del evento admin (2026-09-09, migración `20260909000000`)**: su
  vocabulario NO es el de una clase (SESION/CLUB/TALLER) sino
  **MEETING · TRAINING · OBSERVATION · DEVELOPMENT**, y la duración va de **1 a 8
  horas** — una clase dura minutos, una capacitación puede ocupar la jornada. Ambas
  reglas viven en `domain/evento-admin.ts` Y como CHECK en la base. Los tipos
  antiguos se migraron (TALLER→TRAINING, CLUB/SESION→MEETING). En el modal el
  selector de tipo y el de duración cambian según el modo.
- **El evento admin es un INSTANTE, no una hora de país (2026-09-10)**: la hora se
  escribe en el reloj DE QUIEN LO CREA (el modal manda su zona IANA del navegador)
  y cada quien lo ve en el suyo — creado 13:00 en Colombia, quien entra desde Chile
  lo ve 15:00. Por eso `pais` dejó de ser el reloj y pasó a ser contexto de
  audiencia: **Campaña, país, curso, salón y nivel admiten "Todos"** (vacío = todos)
  y solo la fecha, la hora y la audiencia son obligatorias. El aforo por defecto es
  **25**, porque el evento interno no cuelga de un salón del que heredar cupo.
  **Trampa**: el DÍA también hay que derivarlo del instante (`src/ui/fecha-local.ts`)
  y no del `fecha` guardado al crear — un evento de las 23:30 en Colombia cae al día
  siguiente para Chile, y agruparlo por el día guardado lo pintaba en una casilla que
  no cuadraba con su hora.
- **Asistencia del evento admin**: se pasa lista desde la pantalla
  (`POST /api/scheduling/eventos-admin/[id]/asistencia`, `salones.gestionar`) y se
  guarda en `scheduling_evento_admin_guia` (`asistio`/`marcado_en`/`marcado_por`),
  **NUNCA** en `attendance_attendance`: esa es la asistencia de NIÑOS y dispara la
  función central de progresión (regla 4). `asistio` NULL = sin pasar lista, distinto
  de "no vino". Solo se actualizan guías que YA están en la audiencia.
- **Estadística mensual del guía** (`reporting/application/guia-mes.ts`,
  `reporting_guia_mes`): `calcularGuiaMes` es la consulta viva y `consolidarGuiaMes`
  la congela con UPSERT idempotente — necesario porque regenerar un salón es
  destructivo y recrea las sesiones. Período `YYYY-MM` en la zona del salón;
  `leerGuiaMes()` sin período devuelve el histórico completo, que es lo que se extrae.
- **Eventos sueltos** (`application/crear-evento.ts`, `20260828000000`): una sesión
  extra, un club o un taller creado a mano NO tiene slot. Por eso `deleteSessions`
  borra solo `slot_id IS NOT NULL` y la regeneración destructiva no se los lleva.
  Hasta **3 salones** compartidos (`MAX_SALONES_COMPARTIDOS`, `grupo_id` común). El
  enlace de Zoom se HEREDA del guía asignado, nunca se copia al evento.
- **Evento ADMINISTRATIVO** (`scheduling_evento_admin` + `…_guia`, `20260828000001`):
  reunión o capacitación cuya audiencia son GUÍAS. Vive en tabla propia a propósito:
  en `scheduling_session` arrastraría lista de matriculados, asistencia y progresión,
  y aparecería en la agenda de los alumnos. Se pinta **NARANJA** en el calendario y
  solo lo ven los guías de su audiencia.
- Crear eventos exige `eventos.crear` (solo admin); el guía tampoco ve "+ Nuevo
  salón" (`salones.gestionar`).
- **Alcance del guía**: agenda y lista de salones filtran por `guia_user_id` cuando
  el actor tiene `panel.guia` y no `salones.gestionar`. La lista va agrupada por
  campaña de la más reciente a la más antigua, con título **Curso · País · Salón** +
  horario, inicio/final y advisor, igual en el panel de admin y en el del guía.
- **Sala de Zoom** (`domain/zoom-link.ts`, portado de MOSAICO): normaliza el enlace
  de anfitrión (`/s/N` → `/j/N`), quita `#success` y RECHAZA el de chat o contacto
  (al alumno le abre "Enviar solicitud de contacto" en vez de la clase). Índice único:
  dos guías no pueden compartir sala.

## Aviso de la pantalla de login (2026-08-26)

- Imagen que administración CAMBIA y PRENDE/APAGA sin despliegue (`/panel/aviso-login`,
  `menu.aviso_login`). Replica el banner de MOSAICO2026 y LGS2026 con dos diferencias:
  la imagen NO se guarda en base64 en la tabla de configuración (va por `files`,
  entidad `login_aviso`, con validación de MIME y tope de 10 MB), y el interruptor sí
  vive en `platform_config` (clave/valor, migración `20260826000001`) porque es un
  ajuste, no un archivo.
- La ruta pública `GET /api/public/login-aviso` resuelve ELLA MISMA cuál es el aviso
  vigente y **no acepta un id de archivo**: si lo aceptara, cualquiera podría pedir
  archivos privados de menores sin sesión. Apagarlo deja de EXPONER la imagen, no
  solo de mostrarla.

## Pendientes conocidos

- **Endurecer la auth de servicio del intake de API-key a HMAC** (integridad +
  anti-replay + el secreto no viaja): alinear con el `crm-bridge` de MOSAICO.
  No urgente sobre HTTPS con rotación de clave.
- Despliegue a DigitalOcean (Fase 11) pendiente: sin él, la puerta de servicio
  no puede recibir llamadas reales de LGS (KIDS debe ser público + la clave
  `LGS_INTAKE_API_KEY` provisionada en ambos sistemas).
- Procedimiento operativo para cuando el desfase CL–CO sea de 2 h (verano
  austral): el negocio lo definirá más adelante.
- Remoto GitHub `origin` = plataformalgsdigital-tech/lgskids. **CI activo**
  (`.github/workflows/ci.yml`: lint, tipos, pruebas CON integración contra un
  Postgres de servicio, arquitectura y build). Falta definir protección de `main`
  —hoy se empuja directo— y hay PRs de Dependabot abiertos sin revisar.
- Docker Desktop SÍ está instalado; `docker compose -f infra/docker/...` levanta
  Postgres local.
- **Escopar el registro de intentos de quiz al salón del guía**: `POST
/api/assessment/attempts` valida `evaluaciones.gestionar` pero NO que el niño
  pertenezca a un salón del guía (a diferencia de asistencia, que ya lo hace vía
  `verificarAccesoGuia`). El intento no lleva sesión/salón, así que hay que
  derivar la matrícula ACTIVA del niño y comparar `guia_user_id` con el actor
  cuando este no tenga `salones.gestionar`.
- **No hay restablecimiento de contraseña**: ni el admin puede resetear la de un
  guía, ni el guía pedirla. El enlace de `/nuevo-guia` completa la ficha pero NO
  fija contraseña — se dejó fuera a propósito: un enlace que fija clave es, en la
  práctica, un enlace de recuperación, y eso amplía la superficie de seguridad.
  Decisión abierta con el negocio.
- **Arte de ORIGEN fuera del repositorio**: `arte/personajes-fuente/` (~34 MB) e
  `imagenes/` (~96 MB) están en `.gitignore` — git carga los binarios para siempre.
  Se conservan en disco; si se necesitan versionados, van a Drive o a Git LFS. Lo
  que SÍ está versionado es lo derivado que la app sirve (`public/personajes/`,
  `wp-theme/.../assets/`).
- **Hotspots del MAPA de YOUNGSTER** sin cargar: la pantalla "Avance" dibuja el mapa
  sin marcadores hasta que se marquen en `/panel/mantenimiento-cursos/mapa`.
- Restos en Hostinger: el título del sitio WordPress sigue siendo
  "lgskidsplataforma", el `/index.html` viejo sigue alcanzable y quedó el tema
  duplicado `lgs-kids-landing-old-6a8f390177c2e`.
- `prisma/schema.prisma` va DETRÁS de la base: las tablas desde `catalog_curso`
  (agosto) se crearon con SQL a mano en `prisma/migrations/` y no se reflejaron en
  el schema. `migrate deploy` funciona igual; **no correr `migrate dev`**, que
  diffea contra el schema y querría borrarlas.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
