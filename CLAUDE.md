# CLAUDE.md — KIDS2026

> Este archivo debe mantenerse PRECISO. En Mosaico quedó describiendo tablas
> inexistentes y causó fallas reales. Si cambias comportamiento, actualízalo.

## Qué es

Plataforma de gestión académica de **LGS Kids** (inglés para niños 5–13
años: **JUNIOR 5–9, YOUNGSTER 10–13**). Dominio: `lgskidsplataforma.com`.
Multi-país: CL, CO, EC, PE.

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
  **Duración fija (2026-09-21)**: `final_contrato` = inicio + **12 meses**
  (`finalDeContrato`, `MESES_CONTRATO`; el día 31 o el 29-feb caen al último día
  del mes). YA NO se recibe: el wizard de reservas dejó de pedirlo y la puerta
  del intake lo ignora (Zod descarta el campo sin error, así que LGS no se rompe
  si lo sigue mandando). La migración `20260921100000` recalculó los contratos
  vivos como inicio + 12 meses + los días que ya se habían extendido. La cuenta
  del alumno se DESACTIVA cuando vence: 12 meses + pausas + 2 días de gracia.
  **El barrido de vencidos solo mira APROBADO**: antes también tomaba ONHOLD y
  podía inactivar a un niño PAUSADO, cuyo `final_contrato` todavía no incluye los
  días que la reactivación le va a sumar.
  **Renovación (2026-09-22)**: el niño que VUELVE tras vencer (persona y cuenta
  INACTIVAS por la cascada) puede recibir un contrato nuevo —`crearContrato` ya no
  exige beneficiario activo, solo titular— y **aprobarlo lo reactiva**: persona
  ACTIVA, cuenta ACTIVA con el MISMO usuario y rol alumno del país del contrato
  nuevo (`reactivarUsuarioTx`; `aprobarContrato` devuelve `reactivado`). Antes se
  rechazaba el contrato y, aunque se forzara, la cuenta seguía apagada con el
  contrato vigente. Probado en `ciclo-contrato-integration.test.ts`.
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
  **optimización al subir (2026-09-11)**: toda imagen pasa por `sharp` en
  `files/infrastructure/optimizar-imagen.ts` → WebP q82 acotado a 1600 px
  (`LADO_MAXIMO`). NUNCA lanza: si falla, guarda el original — perder la subida
  por no poder encogerla sería cambiar peso por pérdida de datos. Conserva ALFA
  (los premios y el VoBo son PNG transparentes) y no agranda lo pequeño. El tope
  de 10 MB se mide sobre lo que sube el usuario, no sobre lo que queda en disco.
  Backfill: `pnpm imagenes:optimizar [--aplicar]` (`reoptimizarImagenes`)
  reescribe el MISMO archivo —mismo id y clave— porque las URLs ya están
  repartidas por los paneles y los hotspots cuelgan de ellas. La primera pasada
  dejó **86 MB en 14 MB (−84 %)** en 44 imágenes.
  El arte se sirve con `Cache-Control: private, max-age=31536000, immutable`:
  los bytes de un id no cambian nunca (subir arte nuevo crea otro archivo y
  otra URL), y los 5 minutos de antes hacían rebajar megas en cada visita.
  descarga solo autenticada, MIME allowlist (pdf/jpg/png/webp + **mp3/m4a**
  desde 2026-09-11, para narración de material; el VIDEO queda
  fuera a propósito: los del cuadernillo llegan a 47 MB y eso es trabajo de un
  CDN, no de una ruta autenticada de Node), 10 MB máx (quien llama puede pasar su
  propia `PoliticaArchivo`: el material del alumno admite HTML y 80 MB),
  claves impredecibles; adaptador Spaces se enchufa en Fase 11. Reporting:
  asistencia por salón/mes con `AT TIME ZONE cl.timezone` EN SQL,
  ocupación de salones, contratos por país (con alcance). UI:
  /panel/reportes. Permisos: reportes.ver, archivos.gestionar/ver.
- **Fase 11 (despliegue) completada (2026-09-24)**: la plataforma CORRE en
  DigitalOcean. App Platform `lgskids` (región nyc) con tres componentes —`web`,
  el worker `tareas` y el trabajo de pre-despliegue `migrar`—, base `kids2026`
  dentro del clúster `lgs-db` (PostgreSQL 18, usuario propio `kids2026_app`) y
  archivos en **Spaces `lgs-kids`** (nyc3, llave acotada a ese bucket). En
  `https://app.lgskidsplataforma.com` (CNAME desde Hostinger, que sigue sirviendo
  la landing en la raíz del dominio). **Detalle, comandos y trampas: `docs/runbooks/despliegue.md`** —
  leerlo ANTES de tocar el despliegue. Lo esencial:
  - **La imagen se construye AQUÍ y se sube al registro** (`registry.digitalocean.com/lgskids/web`),
    no en DigitalOcean: su integración con GitHub no tiene acceso al repositorio de
    la organización. Empujar la etiqueta `latest` dispara el despliegue solo.
  - **El disco del contenedor es EFÍMERO**: por eso `files` usa Spaces en
    producción (`SPACES_*`, las cuatro o ninguna). Sin ellas la app arranca
    guardando en un disco que se borra en el siguiente despliegue.
  - **La base exige TLS con SU CA** (`DATABASE_CA_CERT`) y filtra por fuentes
    confiables: una app nueva hay que AGREGARLA (`firewalls append`), o falla con
    `P1001` como si la base estuviera caída.
  - El seed se corrió UNA vez a mano; `admin` y `superadmin` nacieron con
    "cambiar clave al entrar".
- Plan de fases: ver `PROMPT_KIDS2026.md` sección 11.

## Gestión de roles y permisos (2026-07-23)

- **Rol = conjunto de permisos marcables** (RBAC editable desde el panel).
  UI /panel/usuarios con 2 pestañas: Usuarios (crear staff —usuario y clave
  GENERADOS, ver "Cuentas de usuario"— + asignar roles con alcance por país) y Roles (crear rol + marcar
  sus permisos con checkboxes). `superadmin` es INTOCABLE (siempre todos
  los permisos; la app y el seed lo fuerzan). El seed llena permisos de un
  rol NO-superadmin solo si está vacío → respeta ediciones del panel.
  Editar permisos de un rol invalida toda la caché de perfiles.
- Desde 2026-08-26 el árbol de permisos incluye los del MENÚ (`seccion.*` y
  `menu.*`), separados de los funcionales — ver "Menú por secciones y Tablero".

## Cuentas de usuario (2026-09-21)

Migración `20260921100000_cuentas_usuario`.

- **Usuario y clave se GENERAN, nunca se reciben**, para el alumno y para el
  staff. El alta de ambos pasa por `crearCuentaTx` (`application/alta-cuenta.ts`),
  que es el ÚNICO camino:
  - usuario = inicial del nombre + primer apellido + 4 dígitos (`baseUsername`;
    respaldo `alumno` o `staff`);
  - clave = `generarPasswordInicial` (4 sílabas + 2 dígitos, se puede dictar por
    teléfono);
  - la unicidad la resuelve `INSERT … ON CONFLICT (username) DO NOTHING RETURNING`
    con hasta 25 intentos: dos altas simultáneas con el mismo nombre no chocan.
    La clave se devuelve UNA vez (`Cache-Control: no-store`) y la cuenta nace con
    `debe_cambiar_password`.
- **Dónde van los demás datos de cada tipo de usuario** (`identity_user` solo
  guarda la cuenta):
  - **alumno** → `people_person` (lo llena el contrato);
  - **guía** → `scheduling_guia` (su ficha por enlace, ver "Alta del guía por
    enlace");
  - **staff** (admin, coordinador…) → `identity_perfil`, con nombres, apellidos,
    teléfono y número de identificación (`doc_numero`, desde 2026-09-22). Es
    nueva: antes el staff no tenía dónde guardar su nombre.
    `listarUsuarios` toma el nombre de la primera que tenga (`COALESCE`), y el
    buscador también busca por nombre.
- **Bóveda de claves: el superadmin PUEDE VER cualquier clave.** Lo decidió el
  negocio sabiendo el costo: con el hash solo, una fuga de la base no entrega
  claves; con la copia, las entrega si además se filtra la llave. Mitigaciones:
  - la copia (`password_cifrada`) va cifrada con **AES-256-GCM**, con el `userId`
    como dato autenticado (AAD), en `infrastructure/boveda-claves.ts`. Una copia
    movida a la fila de otro usuario no se descifra;
  - la llave `PASSWORD_VAULT_KEY` (base64, 32 bytes) vive FUERA de la base, en el
    entorno: robar la base no alcanza. Sin llave, la bóveda queda apagada: no se
    guardan copias y "Ver clave" responde `BOVEDA_APAGADA`;
  - el login SIGUE verificando contra el hash argon2id; la copia nunca autentica;
  - consultarla exige el ROL superadmin (`profile.esSuperadmin`), no un permiso.
    Ningún permiso editable en el panel la concede, así que un admin con todos
    los permisos tampoco la ve;
  - cada consulta queda en la auditoría (`identity.clave_consultada`);
  - se guarda copia en el alta, en el restablecimiento y cuando el usuario cambia
    su propia clave (`changePassword`, vía `BovedaClavesPort`).
    **Las cuentas anteriores a esta migración NO tienen copia** (`SIN_COPIA`) hasta
    que se les restablezca la clave o la cambien.
    **Rotar la llave** deja ilegibles las copias existentes (`ILEGIBLE`); todavía no
    hay script de recifrado.
- **"Cambiar clave al entrar" se hace cumplir en el SERVIDOR**: con la marca
  encendida, el autenticador responde **403 `DEBE_CAMBIAR_PASSWORD`**
  (`DebeCambiarPasswordError`) a toda ruta salvo `/api/auth/me` y
  `/api/auth/change-password` (`PERMITIDAS_CON_CLAVE_PENDIENTE`). Frena también
  una sesión YA abierta: el access token sigue vivo sus 15 minutos, pero no le
  sirve de nada. En el cliente, `apiFetch` (`irACambiarClaveSiCorresponde`), el
  layout del panel y `/mi-panel` llevan a `/panel/cambiar-password`.
  El panel de usuarios la PRENDE y la APAGA (`PATCH /api/identity/users/[id]`).
  **Con la marca encendida el layout del panel NO dibuja el menú**: solo el
  formulario, un aviso que explica por qué (y que en "Contraseña actual" va la
  clave con la que acaba de entrar) y "Cerrar sesión". Con el menú a la vista,
  cada opción rebotaba al cambio de clave sin explicación y parecía que
  "Usuarios y roles no funciona". Al guardar se va a `/login?clave=cambiada`,
  que lo confirma: las sesiones se cierran y hay que volver a entrar.
- **Olvidé mi clave = solicitud al equipo**, no enlace por correo. El correo del
  alumno es sintético y el niño no tiene buzón.
  - `POST /api/public/olvido-clave` (sin sesión) registra en
    `identity_solicitud_clave` y responde SIEMPRE lo mismo (202), exista o no el
    usuario, para que no sirva para descubrir cuentas;
  - como mucho **5 por IP y hora** (`MAX_SOLICITUDES_POR_IP_HORA`);
  - hay UNA pendiente por cuenta (índice único parcial): pedirla otra vez
    actualiza el contacto;
  - el panel las lista arriba de Usuarios y marca la cuenta con 🔔.
    **Restablecer** (`POST /api/identity/users/[id]/restablecer-clave`) hace todo
    en una transacción: clave nueva generada, marca de cambiarla encendida,
    sesiones revocadas y solicitud ATENDIDA.
- **Quién administra la cuenta de quién** (`requisitoParaGestionarCuenta`): hace
  falta tanto como para otorgar el rol MÁS ALTO de esa cuenta
  (`requisitoParaOtorgar`):
  - `superadmin` → solo otro superadmin;
  - `guia` → `usuarios.gestionar`;
  - cualquier otro rol → `roles.asignar`.
    Rige al crear con rol inicial, al asignar rol, al restablecer y al tocar la
    marca de cambiar clave.
    **Trampa ya pagada**: antes, `usuarios.gestionar` bastaba para crear un admin o
    un superadmin, y `roles.asignar` bastaba para dar la llave maestra. Así un
    coordinador podía fabricarse un admin, o restablecer la clave de uno y entrar
    como él.
- Endpoints nuevos:
  - `POST|GET /api/identity/users`;
  - `PATCH /api/identity/users/[id]`;
  - `POST …/[id]/restablecer-clave`;
  - `GET …/[id]/clave` (solo superadmin);
  - `GET /api/identity/solicitudes-clave` y
    `POST /api/identity/solicitudes-clave/[id]/descartar`.
    Auditoría: `identity.usuario_staff_creado`, `identity.clave_restablecida`,
    `identity.clave_consultada`, `identity.debe_cambiar_encendido|apagado`,
    `identity.clave_solicitada` e `identity.solicitud_clave_descartada`.
- **Pruebas locales de la bóveda**: `cuentas-integration.test.ts` salta los casos
  de la bóveda si falta `PASSWORD_VAULT_KEY`, como la prueba de sesión con
  `AUTH_JWT_SECRET`. CI define las dos con valores SOLO de prueba.
- **El seed crea `admin` y `superadmin` con "cambiar clave al entrar"** y con la
  clave que dan las variables `SEED_*`, así que sin copia en la bóveda. En su
  primera entrada van a `/panel/cambiar-password`: no es un fallo. Al cambiarla,
  les queda copia.

## Gestión de usuarios por tipo (2026-09-22, estilo MOSAICO)

Migración `20260922000000_ficha_administrativo`. `/panel/usuarios` dejó de ser una
lista con un alta genérica: la pestaña Usuarios es un **tablero con una tarjeta
por tipo** y un enlace a la consulta. Cada alta llena la cuenta Y la tabla donde
vive la ficha de ese tipo. **Sin tarjeta Comercial**: en KIDS no hay equipo
comercial (vende LGS y llega por Reservas); lo decidió el negocio.

- **Estudiante** (`/panel/usuarios/estudiante`): NO crea cuentas a mano (regla 5).
  Busca al niño (`GET /api/contracts/estudiantes?q=` → `buscarEstudiantes`: N° de
  contrato o LGS, documento, nombre o usuario, con alcance por país) y muestra su
  ficha, apoderados, contratos y el estado de su cuenta: "Ya tiene cuenta… no se
  puede duplicar", "INACTIVA: se reactiva al aprobar la renovación" o "aún no
  tiene: nace al aprobar su contrato". La acción es **Aprobar contrato** —el MISMO
  alta única de `/api/contracts/[id]/approve`—, más restablecer y ver clave.
  `searchContracts` ganó documento de niño y titular, y `ContractListItem` ganó
  `userId`, `cuentaEstado` y `beneficiarioEstado`; lista y búsqueda comparten
  ahora las columnas en `SELECT_ITEM` (antes estaban copiadas).
- **Administrativo** (`/panel/usuarios/administrativo`): rol* (de la matriz,
  menos alumno/guía/apoderado, que tienen su propia puerta; superadmin solo se
  ofrece a un superadmin), plataforma (alcance del rol), nombre*, apellido*,
  correo*, celular y N° de identificación. `POST /api/identity/users` ahora EXIGE
  rol y correo y rechaza guía/alumno/apoderado.
- **Guía** (`/panel/usuarios/guia` → `POST /api/scheduling/guias/alta`, multipart,
  `crearGuia` en `scheduling/application/alta-guia.ts`): cuenta + rol `guia`
  GLOBAL + ficha `scheduling_guia` + foto, en UNA transacción (una sala de Zoom
  ajena deshace todo). Dos modos: **completo** (foto y documento obligatorios,
  como MOSAICO) o **con enlace** (basta nombre, apellido y correo; se emite el
  enlace de `/nuevo-guia` y él completa el resto). La foto se sube ANTES con el id
  de la cuenta reservado (`crearCuentaTx` acepta `id`) y se suelta si la
  transacción falla. La cuenta la arma `crearCuentaStaffTx` (identity), el mismo
  núcleo del administrativo, que `scheduling` compone dentro de su transacción.
- **Consultar** (`/panel/usuarios/consultar`): filtros por tipo (derivado en SQL:
  persona → estudiante; rol guía → guía; otro rol → administrativo) y estado,
  buscador por usuario/nombre/correo/documento, hasta 500 filas
  (`MAX_USUARIOS_LISTA`) y **exportar CSV** (`;` + BOM para el Excel en español;
  **sin claves**, a propósito: un archivo con todas las claves es una fuga lista
  para mandar). Por cuenta: cambiar clave al entrar, restablecer, ver clave,
  asignar y **quitar rol**, editar (el administrativo en línea; alumno y guía
  enlazan a su ficha en Kids y Guías), **inactivar/reactivar** y **eliminar**.
- **Correo real único**: índice `identity_user_email_real_unico` sobre
  `LOWER(email)` de los no sintéticos; `exigirCorreoLibre` contesta antes con el
  usuario que ya lo tiene. Los hermanos siguen compartiendo el correo del
  apoderado, que vive en `people_person`, no en la cuenta.
- **Inactivar/reactivar** (`PATCH …/users/[id]` con `estado`, `cambiarEstadoCuenta`):
  solo staff y guías. La del ALUMNO sigue a su contrato —si el panel la
  reactivara, un niño con contrato vencido volvería a entrar—. Nadie se inactiva
  a sí mismo ni a `sistema-lgs`.
- **Eliminar** (`DELETE …/users/[id]`, `eliminarCuenta`): SOLO una cuenta sin
  historia. Borrar arrastraría en cascada la estadística mensual del guía y
  dejaría sesiones y eventos sin autor, así que `SQL_MOTIVOS_NO_BORRAR` lista lo
  que lo impide (ya entró, es alumno, tiene salones, dictó o cerró sesiones,
  tiene estadística, creó eventos/refuerzos/enlaces) y la lista usa ese MISMO
  fragmento para pintar el botón. Con historia: 409 y se inactiva. Suelta la foto
  del guía, que no cuelga de la cuenta por clave foránea.
- **Quitar rol** (`DELETE /api/access/user-roles`, `quitarRol`): hace falta lo
  mismo que para otorgarlo y para administrar esa cuenta. Nunca el propio, nunca
  el de alumno (lo pone el contrato) y nunca el último superadmin ACTIVO.
- **Editar la ficha del guía ya no borra su foto**: `guardarFichaGuia` escribía
  `foto_file_id = NULL` cuando no se la mandaban, y el PUT de `/panel/guias` no la
  manda. Ahora "no vino" = no se toca.
- Pruebas: `identity/tests/gestion-usuarios-integration.test.ts`,
  `scheduling/tests/alta-guia-integration.test.ts` y la renovación en contratos.
  **Trampa para quien pruebe el enlace**: `scheduling_guia_invitacion.creado_por`
  es clave foránea, así que emitirlo exige un actor REAL (el UUID de ceros de las
  pruebas no sirve), y una cuenta que emitió enlaces no se puede borrar sin
  quitarlos antes.

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
  Perfil. **¿Cómo voy?**, **Historial**, **Avance** y **Material** abren MODAL (no viven
  en el cuerpo); el resto es acceso futuro. "¿Cómo voy?" = progreso del nivel + acordeón
  de niveles→Stages. El banner del curso ya no lleva texto (va en un encabezado
  aparte, 16:9) y hace lightbox al clic. **Mis próximas clases** vive en la columna
  derecha y muestra la **ventana de 14 días** (`agendaProximas(classroom, dias=14)`,
  incluye clubes). **Pie** con soporte por WhatsApp (Soporte Usuario/Académico/
  Finanzas; números en la constante `SOPORTE`, hoy placeholder). El rótulo de arriba a
  la derecha dice **nivel · unidad · lección** (2026-09-23): las dos últimas van a la
  par —el nivel tiene 4 lecciones y el mapa 4 unidades, y la isla ya marca como vistas
  tantas unidades como lecciones lleva—, así que se derivan del MISMO número.
- **Arte curricular por TIPO (2026-08-26)**: `imagen-curso.ts` se generalizó a
  `subirArte`/`arteId` con tipos **banner** (`catalog_imagen_curso` por CURSO:NIVEL,
  admite `NIVEL_TODOS`), **premio** (`catalog_premio_nivel` por CURSO:NIVEL),
  **mapa** (`catalog_mapa_curso` por curso) y **vobo** (`catalog_vobo`, GLOBAL).
  Todo se sirve por `/api/catalog/imagen-curso/[id]`, que desde 2026-09-19 **solo sirve
  imágenes** (`descargarImagenCurso` mira el MIME con `metaArchivo` antes de leer): servía
  CUALQUIER id de `files` en línea, y con el HTML del libro interactivo guardado eso era
  ejecutarlo fuera de su caja, con la sesión de quien abriera el enlace. **`subirArte` acota a JPG/PNG/WebP**
  (2026-09-11): antes no restringía nada y `files` ya acepta audio, así que un mp3 guardado
  como banner no fallaba al subirse sino al pintarse. UI `/panel/mantenimiento-cursos/imagenes`
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
  - **De la unidad de texto a la PARADA**: `catalog_curso.unidad` es texto libre y
    trae "Unidad 0", "Repaso 3" y erratas como "Evalucion 6". `unidadMapa`
    (`catalog/domain/unidad-mapa.ts`, con pruebas) es LA regla. **Desde 2026-09-11 la
    isla tiene CINCO paradas**: el **Welcome (parada 0)** y las unidades 1–4 — así está
    dibujado el mapa nuevo ("Welcome", "1 All about me", …) y así premia el libro, que
    entrega DOS insignias en el cuadernillo `UNIT 0-1`. Antes la "Unidad 0" se
    descartaba por considerarse solo un cartel. Repasos y evaluaciones siguen sin
    parada; lo que no mapea no se pierde —sigue en su lección—, solo que no se abre
    desde el mapa. Constantes: `PARADA_WELCOME = 0`, `UNIDADES_MAPA = 4` (la unidad
    NUMERADA más alta), `PARADAS_MAPA = 5` y `PARADAS = [0..4]`; `paradaValida` y
    `etiquetaParada` (la 0 se muestra "Welcome", nunca "Unidad 0").
  - **Libro interactivo: RETIRADO (2026-09-17)**. El visor del cuadernillo salió
    del panel del niño por decisión del negocio —el resultado no convenció— y el
    material se rehará DESDE CERO. Se fue el CÓDIGO: `application/libro.ts` y
    `libro-audio.ts`, `/api/student/libro`, `/api/catalog/libro-audio/[id]`, los
    scripts `libro:importar|paginas|audios`, la prueba de integración y las
    transcripciones de `content/libros/`. Lo reemplazó el **Material del alumno**
    (2026-09-19, ver abajo), que NO usa nada de aquello.
  - **Lo que NO se tocó**: el arte (mapas, láminas de unidad, premios, insignias,
    personajes, banners) sigue intacto en `files` y en sus tablas. Y las tablas del
    libro —`catalog_libro`, `catalog_libro_pagina`, `catalog_libro_audio`,
    `catalog_insignia`— siguen creadas CON SUS DATOS (55 páginas y 34 pistas de
    Junior·Rookie) pero sin una línea de código que las lea: están DORMIDAS a
    propósito. Borrarlas exige una migración destructiva y dejaría huérfanos en
    `files` los archivos que se pidió conservar. El material nuevo no las usa, así que
    la decisión de tirarlas sigue abierta. Las migraciones ya aplicadas (`20260911100000`, `…120000`, `…140000`,
    `20260915000000`, `20260915100000`) NO se revierten: el historial no se reescribe.
  - `files` sigue aceptando **mp3/m4a** aunque hoy nadie los sirva: el cuadernillo
    nuevo volverá a necesitar narración y el MIME vive en un módulo compartido.
  - Cómo estaba hecho —pliegos vs. `numero_impreso`, escenas por capas, audio por
    pliego, ids únicos por página— está en el commit `a400d97`. Si el diseño nuevo
    repite alguna de esas decisiones, ahí están los porqués y las trampas ya pagadas.
  - **Poses de celebración** (2026-09-16): `rocky-celebrando`, `simba-celebrando` y
    `emma-confeti` (distinta de `emma-celebrando`, que es el puño en alto). El origen está
    en `imagenes/Personajes/` y trae **transparencia real**; las 27 `ChatGPT Image…` de esa
    misma carpeta son OPACAS (tablero quemado), pero sus poses ya están limpias en
    `public/personajes/`. Se derivan recortando el borde y a 440 px de ancho, como las
    otras 19, para que `Personaje` las escale por altura igual. `Dodo_celebrando.png` es el
    pájaro de OTRO diseño que ya estaba registrado sin usar como `coco-celebrando`.
  - **Trampa del modo desarrollo**: la primera vez que se pide
    `/api/catalog/imagen-curso/[id]`, Next compila la ruta y la imagen tarda segundos. Una
    captura de pantalla inmediata muestra la portada sin mapa aunque el dato esté bien.
  - **Insignia por parada** (arte tipo `insignia`, `catalog_insignia_parada`, clave
    `CURSO:NIVEL:PARADA`): la que se gana al cerrar cada parada ("Let's chat about me",
    "Let's explore"…). Es DISTINTA del `premio`, que es uno por NIVEL y corona el LEVEL
    UP. Se enciende con lo mismo que ya enciende el VoBo — NO tiene estado propio.
  - **El Welcome del hotspot va en `data.welcome`, NO al inicio de `unidades[]`**: ese
    arreglo es posicional (`unidades[0]` = Unidad 1) y los hotspots de Junior ya están
    marcados; meterlo dentro correría todos los marcadores una posición en silencio.
    Solo aplica al scope ISLA (en el MAPA cada isla es un punto único).
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
- **Material del alumno (2026-09-19)**: el botón **Material** de `/mi-panel` abre un
  modal con, por cada nivel ALCANZADO (el actual primero, más los completados), TRES
  materiales: el **libro interactivo** (uno por nivel), el **libro para descargar** (un
  PDF **por UNIDAD** desde 2026-09-23) y el **libro de actividades** (PDF por unidad Y,
  además, uno del NIVEL COMPLETO). Diseño los entrega hechos: un HTML autocontenido
  (imágenes en base64, un solo `<script>`) y los PDF. Desde 2026-09-21
  los VIDEOS no van dentro del HTML: se suben aparte (ver "Videos del libro" abajo).
  La plataforma NO transforma el libro: lo guarda y lo sirve con el puente inyectado.
  - **Carga**: `/panel/mantenimiento-cursos/material` (tarjeta "Material del alumno"),
    tabla curso × nivel × tipo con Subir/Reemplazar/Ver/Quitar; los dos PDF llevan una
    casilla por unidad. `application/material.ts` los guarda en `files` con entidad
    `catalog_material_interactivo|imprimible|actividades` y clave
    `CURSO:NIVEL` para el libro y **`CURSO:NIVEL:PARADA`** para cada PDF (solo niveles
    reales, sin "TODOS"). **Quién lleva unidad lo decide `exigirParada`**: el
    interactivo NUNCA (por unidad aparecería cinco veces), el imprimible SIEMPRE (sin
    unidad quedaría fuera del alcance del guía y nadie podría abrirlo) y el de
    actividades las DOS cosas — sin unidad es el del nivel completo, que se le habilita
    al niño con las cuatro unidades abiertas (decisión del negocio). Los PDF para
    imprimir de nivel entero cargados ANTES siguen en su sitio, ya no se sirven al niño
    y la pantalla los muestra aparte, en ámbar, solo para poder quitarlos.
    **Reemplazar suelta el anterior**
    DESPUÉS de subir el nuevo: un fallo a medias deja el viejo, no el nivel vacío. El
    tipo lo decide el CONTENIDO (`esHtml`/`esPdf` en `domain/libro-interactivo.ts`), no
    la extensión ni el MIME del navegador — en Windows un .html puede llegar sin tipo.
  - **Política de subida por llamada** (`PoliticaArchivo` en `files`): el material admite
    HTML y hasta **80 MB** (`TAMANO_MAXIMO_MATERIAL`) SIN ampliar la lista global —
    contratos, fotos y arte siguen en PDF/imagen/audio y 10 MB—. No hay proxy, así que el
    tope de 10 MB de `proxyClientMaxBodySize` no aplica a las subidas.
  - **La caja** (lo esencial): el HTML trae su propio JavaScript y servido desde el
    origen de la plataforma podría leer la sesión del niño. Se sirve con `cspLibro(base)`:
    `sandbox` SIN `allow-same-origin` (origen opaco "null"), `connect-src 'none'`,
    imágenes solo `data:`/`blob:`, `frame-ancestors 'self'`, y `media-src`/`base-uri`
    abiertos SOLO a `<origen>/api/material/<id>/` (los videos de ESE libro; el `origen`
    es el de la petición). El iframe lleva el mismo `sandbox` (`SANDBOX_LIBRO`, que
    viaja en la respuesta para que el panel no lo copie).
    Cada permiso responde a algo que el libro usa: `allow-forms` porque el examen es un
    `<form>` (sin él ni se dispara `submit`), `allow-modals` por `alert`/`confirm`,
    `allow-downloads` por "Exportar resultados". `next.config.ts` abre `SAMEORIGIN` SOLO
    para `/api/(catalog|student)/material/:id` — gana la última regla que coincide.
  - **El puente de almacenamiento**: en origen opaco el libro pierde su `localStorage`,
    que es donde guarda el progreso. `inyectarPuente` mete como PRIMER script del
    `<head>` un sustituto en memoria que manda cada cambio al panel por `postMessage`;
    el panel lo guarda en SU `localStorage` con clave `lgs-material:<personaId>:<nivel>`
    (dos hermanos en la misma tableta no se pisan) y al abrirlo se lo devuelve por el
    `name` de la pestaña — `window.name` es lo único que un documento aislado lee de
    forma síncrona antes de que corra su script. Formato `lgs-material:{v:2, datos,
videos}` (`videos` = base con token de sus videos; el formato viejo, solo `datos`, se
    sigue entendiendo). El panel acepta solo mensajes de una ventana que él abrió
    (compara la VENTANA: el origen es "null") y solo pares texto→texto. El progreso vive
    en el dispositivo, igual que en el HTML original; llevarlo al servidor es otra decisión.
  - **En SU PROPIA PESTAÑA (2026-09-22)**: "Libro interactivo" hace `window.open`; antes
    se abría dentro del panel, en un iframe a pantalla completa. Un solo módulo,
    `src/ui/libro-pestana.ts` (`abrirLibroEnPestana`), lo usan el niño y el "Ver" del
    equipo, para que el equipo vea EXACTAMENTE lo que ve el niño; el progreso del equipo
    va aparte (`lgs-material:equipo:<id>`). Lo que cambia con la pestaña:
    - el puente ya no tiene `parent`: le habla a **`window.opener`**, así que el panel
      tiene que seguir abierto para que se guarde. Si se cerró, el libro no se cae y su
      progreso sigue en su `window.name`, que sobrevive a recargar ESA pestaña;
    - el `name` lleva el progreso, que es texto libre (el diario del niño): **los
      espacios van escapados** como ` `, porque el nombre de una ventana no debe
      llevar espacios;
    - reabrir el mismo libro REUTILIZA su pestaña (mismo `name`), no acumula copias;
    - el `window.open` tiene que ocurrir EN EL CLIC. Por eso la lista del equipo
      (`GET /api/catalog/material`) ya trae la caja y la base de videos de cada libro:
      pedirlas antes de abrir convertía la pestaña en ventana emergente y el navegador
      la bloqueaba. Por lo mismo se retiraron `/api/catalog/material/[id]/visor` y la
      página `…/material/ver/[id]`, que existían solo para el visor en iframe.
  - **Verificado en Chrome real** (CDP, con el libro real, en pestaña): `self.origin`
    `null`, `document.cookie` → SecurityError, `fetch` a la API bloqueado por la CSP,
    `<base>` de videos puesta, y el progreso del libro aparece en el `localStorage` del
    panel. **Dos trampas para quien lo pruebe**: `location.origin` devuelve la URL
    (`http://localhost:3000`) aunque el documento esté en origen opaco — el que vale es
    `self.origin`; y con el visor en iframe, Chrome lo corría en OTRO proceso, fuera de
    `Page.getFrameTree` (hacía falta `Target.setAutoAttach`), mientras que la pestaña sí
    aparece como un target normal.
  - **Quién ve qué**: el niño por `/api/student/material` (lista) y
    `/api/student/material/[id]` (sirve), que exigen que el archivo SEA material
    (`archivoDeMaterial`) y que sea de SU curso y de un nivel ALCANZADO (`alcance.ts`, la
    misma regla de nivel que el dashboard); si no, 404. **Los PDF suman una tercera
    condición**: que su guía haya abierto esa unidad O una POSTERIOR (`caminoAbierto`:
    quien va en la 3 conserva la 1 y la 2; el Welcome va siempre, como en el libro) y,
    para el de actividades del nivel completo, haber llegado a la CUARTA
    (`todasLasUnidades`). La lista manda SIEMPRE las cinco casillas de cada PDF —abierta
    con enlace, cerrada con candado y sin enlace, y "todavía sin cargar"— para que el
    niño vea el camino entero; la ruta que los sirve lo vuelve a comprobar, así que
    revocar una unidad vuelve a cerrar lo que ya se listó. El equipo, por
    `/api/catalog/material/[id]` con `catalogo.ver`. Caché inmutable: los bytes de un id
    no cambian, así que los 30 MB se bajan una vez por dispositivo.
  - Las pruebas de integración usan `setPrefijoMaterialParaPruebas`: la clave
    `JUNIOR:ROOKIE` es la del libro REAL en la base de desarrollo y "reemplazarlo" en una
    prueba lo borraría.
  - **Contenido a revisar con diseño**: el libro de Rookie trae dentro un desplegable
    "Respuestas y pistas para el docente" que el niño también puede abrir.
- **La misión la abre el GUÍA (2026-09-23)**: migración `20260923000000_mision_autorizada`.
  El libro abría sus unidades solo con SUS reglas (la 1 siempre; la siguiente al
  completar la anterior). Ahora manda la clase: el guía abre en el modal de la sesión
  la unidad que están trabajando —evaluación, juego y souvenir— y el libro la abre.
  - **Contrato con diseño** (`CLAVE_AUTORIZACIONES_LIBRO` en `domain/libro-interactivo.ts`):
    el libro lee de su almacenamiento `lgs-autorizaciones` = `{"v":1,"unidades":[0,1]}`
    (mismos números del mapa: 0 = Welcome). Si la clave NO está, se comporta como antes
    —así el archivo sigue sirviendo suelto, fuera de la plataforma—; si está, el Puerto
    queda abierto y las demás solo si figuran en la lista. Lista vacía = todo cerrado
    salvo el Puerto, que es el estado de partida de cualquier niño.
  - **El permiso viaja por el puente**, en el mismo paquete que el progreso y los
    videos: el servidor manda el valor YA armado (`autorizacionParaLibro`) y el panel
    lo mete tal cual, pisando lo que hubiera guardado de la vez anterior.
  - **`catalog_mision_autorizada`**: una fila por (niño, curso, nivel, parada), con quién
    la abrió y desde qué sesión. Es un PERMISO, no progresión (regla 4): no lo deriva
    nadie y no mueve medallas. Abrir dos veces no duplica; se puede cerrar lo abierto
    por error (`revocarMision`).
  - **Lo abierto es un RECORRIDO, no casillas sueltas** (2026-09-24): `caminoAbierto`
    (dominio) devuelve el Welcome más TODAS las unidades hasta la más alta autorizada,
    y `misionesAutorizadas` ya entrega eso — la tabla guarda lo que el guía abrió
    explícitamente, pero quien pregunte "¿puede ver esto?" recibe el recorrido. El
    curso no vuelve atrás: el niño que va en la Unidad 3 conserva el libro y el
    cuaderno de la 1 y la 2 sin que haya que abrírselos de a uno. Revocar la 3 lo
    devuelve al punto de partida (se cierran también 1 y 2), porque el tope baja.
  - **EL NIVEL IMPORTA, y por eso se elige**: el libro es uno por nivel. La primera
    versión abría la unidad en el nivel que el niño tenía EN CURSO, y la prueba lo
    destapó: un alumno con Champion en curso abre el libro de Rookie (su nivel
    alcanzado) y la autorización caía en un libro que no estaba mirando. El guía elige
    el nivel de la CLASE (se sugiere el más repetido del grupo, `?conNiveles=1`) y la
    pantalla avisa "⚠ va en …" de quien esté en otro.
  - Endpoints: `GET|POST|DELETE /api/scheduling/sessions/[id]/misiones`, con
    `asistencia.gestionar` + `verificarAccesoGuia` (el mismo alcance que pasar lista) y
    validando que los niños sean de ESA sesión. Auditoría:
    `catalog.misiones_autorizadas` y `catalog.mision_revocada`.
  - El panel del niño muestra por nivel "🔓 Abiertas: …" o "🔒 Tu guía abrirá las
    misiones en clase"; la vista previa del EQUIPO abre todas las unidades, porque es
    una revisión y no una clase.
  - Probado en Chrome con el libro real: sin permiso la Unidad 1 está cerrada, tras
    autorizarla queda abierta y la 2 sigue cerrada. **Trampa al probarlo**: la pestaña
    anterior del libro sigue viva con el permiso que tenía; hay que cerrarla antes de
    reabrir, o se lee un estado viejo.
- **Videos del libro (2026-09-21)**: los videos incrustados en base64 llevaban el libro
  de Rookie a 105 MB y el niño bajaba 11 minutos de canciones antes de ver la página 1.
  Sin ellos, el mismo libro (CON_PASSPORT) pesa **22,6 MB** y cada video se baja al darle
  play. Guía para diseño y para quien carga: `docs/operacion/libro-interactivo-videos.md`.
  - **Contrato con diseño**: el libro pide cada video por RUTA RELATIVA
    `videos/<página>-<n>.mp4`. La **página es la que VE el niño** ("Página 10 / 28"),
    NO el índice del código del libro (`openPage(9)`, clave `"9"` de `LESSON_VIDEOS`),
    que va uno por detrás. Se comprobó en el libro: con los dos números en juego, quien
    carga miraría "Página 10" y pondría el video en la 9. Diseño lo prueba en su equipo
    con una carpeta `videos/` junto al HTML: es cómo funciona cualquier sitio web.
  - **Carga**: `/panel/mantenimiento-cursos/videos` (tarjeta "Videos del libro"): curso,
    nivel, página, n° en la página y archivo (con previo local) → **Subir y comprimir** →
    queda "Por revisar" con el previo YA comprimido y el antes/después → **Confirmar y
    publicar**. Publicados: Ver / Reemplazar / Borrar. Tabla `catalog_material_video`
    (migración `20260921000000`), estados PROCESANDO → BORRADOR → PUBLICADO | ERROR, índice
    único parcial: UN publicado por (curso, nivel, página, n). La casilla es del LIBRO, no
    del HTML: reemplazar el HTML no toca los videos. Un BORRADOR nunca se sirve al niño.
  - **Confirmar reemplaza en una transacción** (borra la fila publicada vieja y publica la
    nueva; el niño nunca ve la casilla vacía) y el archivo viejo se suelta DESPUÉS.
  - **Compresión** (`infrastructure/comprimir-video.ts`, `ffmpeg-static`): 360p, H.264
    Main, CRF 28 con techo 400 kb/s, AAC 64 kb/s, `faststart`, sin metadatos. Validada a
    ojo contra el original: los 5 videos de 720p de Rookie pasaron de 63,2 a 22,1 MB.
    **Nunca agranda**: si el video ya viene ligero (H.264/AAC, ≤360p, ≤800 kb/s) se
    REEMPAQUETA sin recodificar —los 12 de CON_PASSPORT se procesan en 10 s en vez de 7
    min—, y si recodificar lo agrandara, se queda el original (recodificar los de
    CON_PASSPORT daba +50 a +90 %).
  - **Se comprime DESPUÉS de responder** (`after()` de Next): la subida responde 202 y la
    pantalla consulta el estado cada 2,5 s. **De a uno** (`procesarVideoLibro` encadena
    una cola): ffmpeg usa todos los núcleos y la plataforma debe seguir respondiendo a los
    niños en clase. Lo que lleva >20 min PROCESANDO (el servidor se reinició a mitad) se
    marca ERROR al listar; el plazo cuenta desde que EMPIEZA a comprimir, no desde la cola.
  - **Servir sin cookie, con token**: PROBADO en Chrome — las peticiones que salen del
    libro aislado llegan al servidor SIN la cookie de sesión (SameSite no aplica a un
    origen opaco). El panel entrega al libro, por `window.name`, la base
    `/api/material/<id>/t/<token>/`; el puente la pone como `<base>` y la ruta relativa
    `videos/7-1.mp4` sale sola hacia la ruta autorizada. Token = HMAC-SHA256 (con
    `AUTH_JWT_SECRET`) de libro + vencimiento (12 h); lo emiten SOLO
    `/api/student/material` (tras comprobar el alcance) y el visor del equipo. La ruta
    `/api/material/[id]/t/[token]/videos/[archivo]` NO usa sesión a propósito, sirve solo
    lo PUBLICADO y responde 404 a todo fallo. El HTML sigue siendo el mismo para todos y
    su caché inmutable vale: el token viaja en `window.name`, no en el HTML.
  - **Rangos** (`platform/http/rango.ts`): el video se sirve con 206 y `Content-Range`.
    Sin eso Safari/iPad NO reproduce (sondea con `bytes=0-1`). Hoy se lee el archivo
    entero y se recorta (videos de 1–5 MB); con Spaces conviene leer solo el tramo.
  - **`ffmpeg-static`**: en `allowBuilds` (descarga el binario de su plataforma al
    instalar: Windows en desarrollo, Linux en CI y servidor) y en
    `serverExternalPackages` de `next.config.ts` (calcula la ruta al binario con
    `__dirname`; empaquetado por Next apuntaría a una carpeta que no existe).
  - Pruebas: `video-libro.test.ts` (casilla y token), `rango.test.ts`, y
    `video-libro-integration.test.ts` con ffmpeg REAL y clips sintéticos (compresión,
    publicar, reemplazar soltando el archivo, nunca agrandar, error legible, interrumpido).
    Usa YOUNGSTER·ULTIMATE y páginas ≥ 900 para no tocar material vivo.
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
pnpm verify       # lint + tipos + pruebas + arquitectura + formato + build + audit
                  # — los mismos pasos estáticos de CI, en el mismo orden
# OJO: `pnpm test` SALTA las pruebas de integración si faltan las variables.
# CI sí las corre, así que en local pueden verse 13/23 archivos "en verde"
# mientras CI está en rojo. Para correrlas de verdad (con el contenedor ARRIBA:
# si Docker Desktop está cerrado, las 12 fallan con ECONNREFUSED 5432 y parece
# que el código se rompió):
INTEGRATION_TESTS=1 DATABASE_URL=postgresql://kids:kids_dev@localhost:5432/kids2026 pnpm test
pnpm test:arch    # solo límites de módulos (dependency-cruiser)
docker compose -f infra/docker/docker-compose.yml up -d   # Postgres local
```

**Lo que `verify` NO cubre de CI** (2026-09-16, costó un push en rojo). Hasta esa
fecha `verify` tampoco corría `format:check` ni `audit`; se sumaron. Quedan fuera
dos pasos que no caben en un script local, y hay que comprobarlos a mano cuando
se toca lo que miden:

- **Instalación congelada** — tras tocar dependencias u overrides. En local
  `pnpm install --frozen-lockfile` MIENTE: con `node_modules` ya presente dice
  "Already up to date" y se salta la comprobación del lockfile. Hay que correrlo
  en un worktree limpio (`git worktree add --detach <dir> HEAD`), sin
  `node_modules`. Así se escapó un `ERR_PNPM_OUTDATED_LOCKFILE`: `pnpm add` anota
  el especificador del manifiesto, pero la comprobación congelada lo compara ya
  con el override aplicado.
- **Migraciones y seed sobre una base VACÍA** — tras agregar migraciones. En local
  se aplican de a una sobre una base con datos; CI las aplica todas desde cero.
  Crear una base desechable en el contenedor y apuntarle `DATABASE_URL` y
  `DIRECT_DATABASE_URL` antes de `pnpm migrate:deploy` y `pnpm seed`.
- **Worktree con `node_modules` enlazado**: si se le hace un junction al
  `node_modules` real para ahorrar la instalación, **quitar el junction ANTES de
  borrar el worktree** (`cmd //c rmdir <dir>\node_modules`). Un borrado recursivo
  lo sigue y se lleva las dependencias reales.

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
- **`ffmpeg-static` 5.3.0 (2026-09-21)**, dependencia de PRODUCCIÓN: comprime los
  videos del libro en el servidor. Su binario (ffmpeg 6.1.1 en Windows) se descarga al
  instalar, por eso está en `allowBuilds`; va en `serverExternalPackages`. Es un
  binario GPL que se ejecuta como proceso aparte y no se distribuye a los usuarios.
  Procesa archivos que sube el EQUIPO (`catalogo.gestionar`), nunca los niños, con
  tiempo máximo de 10 min por video.
- **Los overrides de pnpm viven en `pnpm-workspace.yaml`, NO en el campo `pnpm`
  de package.json**: pnpm 11 ignora ese campo (solo avisa). Ese archivo lleva
  también `allowBuilds`, la lista de paquetes autorizados a ejecutar scripts de
  instalación — no borrarla al editar.
- Al fijar un override, **acotar la línea de versión** (`^`). Un override
  REEMPLAZA el especificador de cada paquete que pide esa dependencia, así que un
  `>=` abierto no solo sube: también puede dejarla ABAJO. Pasó dos veces:
  - `nanoid: ">=3.3.18"` resolvió nanoid 6 y arrastró postcss a una versión
    anterior a la que otro override ya subía por seguridad. Va `^3.3.18`.
  - `postcss: ">=8.5.12"` (2026-09-16) sustituyó el `8.5.23` EXACTO que pide Next
    16.3.4 por un rango abierto, y el lockfile se quedó en **8.5.21**, vulnerable
    a GHSA-fxqj-rqcc-2cmp. El override de seguridad tenía a postcss POR DEBAJO de
    lo que Next ya exigía. Va `^8.5.23` (resuelve 8.5.28). `sharp` se acotó igual:
    `^0.35.0`. Tras el cambio, `pnpm audit --prod` no reporta nada en ninguna
    severidad.

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

- Desde 2026-09-22 el guía se da de alta en **Usuarios y roles › Guía** (ver
  "Gestión de usuarios por tipo"): con su ficha completa o, marcando "que complete
  su ficha por enlace", solo con nombre, apellido y correo, y el enlace sale en esa
  misma pantalla. Desde **/panel/guias** se edita la ficha y se REEMITE el
  **enlace**; el guía carga sus propios datos en el
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
- **Entregar a LGS la clave del intake**: KIDS ya es público
  (`https://app.lgskidsplataforma.com`) y tiene su `LGS_INTAKE_API_KEY` puesta,
  pero del otro lado hay que provisionar la MISMA clave para que
  `/api/kids-intake/*` deje de responder 401. La clave está en el spec de la app
  (cifrada): si se perdió, se rota y se cambia en los dos sistemas.
- Procedimiento operativo para cuando el desfase CL–CO sea de 2 h (verano
  austral): el negocio lo definirá más adelante.
- Remoto GitHub `origin` = plataformalgsdigital-tech/lgskids. **CI activo**
  (`.github/workflows/ci.yml`: lint, tipos, pruebas CON integración contra un
  Postgres de servicio, arquitectura y build). Falta definir protección de `main`
  —hoy se empuja directo—.
  **Ramas (2026-09-21)**: se trabaja en `main`. `feature/bootstrap-platform` está
  sincronizada con su remota y TODO su contenido ya está en `main`: se puede borrar.
  **PRs de Dependabot abiertos, SIN mezclar a propósito** — cada uno pide revisión:
  - #10 "dependencias-menores": CI verde, pero sube Next 16.3.5, React 19.3, Zod 4.6,
    Prisma 7.10 y más. Probar con `verify` completo antes de mezclar.
  - #5 TypeScript 5.9.3 → 6.0.3: CI verde, pero ver la advertencia de Versiones (TS 7
    rompe Next/ESLint/depcruise); confirmar a mano antes de subir de versión mayor.
  - #1 setup-node 7, #2 checkout 7, #3 pnpm/action-setup 6: CI en ROJO; no mezclar
    hasta ver por qué fallan.
    Al empujar a `main`, Dependabot rebasa sus PRs solo; si choca con `pnpm-lock.yaml`,
    pedirle `@dependabot rebase`.
- Docker Desktop SÍ está instalado; `docker compose -f infra/docker/...` levanta
  Postgres local.
- **Escopar el registro de intentos de quiz al salón del guía**: `POST
/api/assessment/attempts` valida `evaluaciones.gestionar` pero NO que el niño
  pertenezca a un salón del guía (a diferencia de asistencia, que ya lo hace vía
  `verificarAccesoGuia`). El intento no lleva sesión/salón, así que hay que
  derivar la matrícula ACTIVA del niño y comparar `guia_user_id` con el actor
  cuando este no tenga `salones.gestionar`.
- **El enlace de `/nuevo-guia` NO fija contraseña**, y fue a propósito: un enlace
  que fija clave es, en la práctica, un enlace de recuperación. Desde 2026-09-21
  la clave se RESTABLECE desde el panel de usuarios (ver "Cuentas de usuario").
- **Respaldar `PASSWORD_VAULT_KEY` FUERA de DigitalOcean**: ya está generada y
  puesta en la app (2026-09-24), pero hoy su única copia vive en el spec cifrado.
  Si se pierde, las copias de las claves quedan ilegibles —las cuentas siguen
  entrando, porque el login usa el hash— y no hay script de recifrado.
- **La renovación por la puerta de LGS todavía no funciona**: desde 2026-09-22 un
  niño que vuelve se renueva con un contrato nuevo en Contratos y al aprobarlo
  recupera su cuenta, pero `crearReservaBeneficiario` (intake y `/panel/reservas`)
  crea SIEMPRE personas nuevas y rechaza el documento de un niño que ya existe
  (`exigirDocLibre`). Falta que la reserva reutilice a la persona existente
  (titular, apoderado y niño) en vez de rechazarla.
- **Arte de ORIGEN fuera del repositorio**: `arte/personajes-fuente/` (~34 MB) e
  `imagenes/` (~96 MB) están en `.gitignore` — git carga los binarios para siempre.
  Se conservan en disco; si se necesitan versionados, van a Drive o a Git LFS. Lo
  que SÍ está versionado es lo derivado que la app sirve (`public/personajes/`,
  `wp-theme/.../assets/`). Igual `Audios/`, `Libros/` y `Videos/`.
  **Trampa ya pagada (2026-09-21)**: esas reglas van ANCLADAS a la raíz (`/Videos/`).
  Sin la barra inicial valen para cualquier carpeta con ese nombre y, como en Windows
  git ignora mayúsculas (`core.ignorecase`), `Videos/` se comía
  `src/app/api/.../videos/` e `imagenes/` cualquier archivo nuevo de
  `src/app/panel/mantenimiento-cursos/imagenes/`: código que nunca se habría subido.
  Al sumar una regla, comprobar con `git check-ignore -v <ruta de código>`.
- **Hotspots del MAPA de YOUNGSTER** sin cargar: la pantalla "Avance" dibuja el mapa
  sin marcadores hasta que se marquen en `/panel/mantenimiento-cursos/mapa`.
- **Material del alumno por cargar** (2026-09-21): solo JUNIOR·ROOKIE tiene libro,
  PDF y sus 12 videos, y únicamente en la base LOCAL. **Producción ya existe
  (2026-09-24) y está VACÍA de material**: hay que subirlo por las pantallas de
  Mantenimiento Académico, empezando por el libro de Rookie. Ese libro es una conversión HECHA AQUÍ del CON_PASSPORT de diseño (los 12 videos
  cambiados por `videos/<página>-<n>.mp4`), no una entrega de diseño: **diseño tiene que
  exportar así** los próximos (guía en `docs/operacion/libro-interactivo-videos.md`).
  Faltan los otros 4 niveles de Junior y los 5 de Youngster; se suben por Material del
  alumno y Videos del libro, sin tocar código. Los originales están en
  `Libros/<Curso>/<Nivel>/` (ignorado por git).
- **El libro cargado el 2026-09-23 trae los videos DENTRO otra vez**: pesa **71,4 MB**
  (`LGS_Kids_JUNIOR_Rookie_CON_PASSPORT.html`) contra los 22,6 MB de la versión con
  videos aparte. Trae bien el permiso del guía, pero deshace lo de "Videos del libro":
  el niño vuelve a bajar los 12 videos antes de la página 1 y los que ya se subieron
  comprimidos quedan sin usar. Hay que pedirle a diseño que exporte con
  `videos/<página>-<n>.mp4` (guía en `docs/operacion/libro-interactivo-videos.md`) y
  volver a cargarlo.
- **Lo que el niño logra en el LIBRO no se guarda en el servidor**: el puente ya trae
  su progreso al panel (intentos, juegos, souvenirs), pero hoy solo queda en el
  `localStorage` del dispositivo. Falta el endpoint que lo reciba y lo guarde por niño
  como REGISTRO —no como progresión, decisión del negocio (2026-09-23): la medalla del
  nivel sigue saliendo del cuestionario que registra el guía—. Sin eso, un cambio de
  tableta se lleva el souvenir y la plataforma no sabe quién lo consiguió.
- **Derechos de las canciones**: los videos de los libros son descargas de YouTube de
  terceros (Planet Pop, LARVA KIDS, ABCmouse, Lingokids, CoComelon, The Singing Walrus…).
  Subirlos a la plataforma es redistribuirlos: confirmar permiso o sustituirlos.
- **Progreso del libro interactivo solo en el dispositivo**: el puente lo guarda en el
  `localStorage` del panel, igual que el HTML original. Si el niño cambia de tableta a
  computador, empieza de cero. Llevarlo al servidor es decisión del negocio. Si se
  hace, es portafolio, NO progresión: las respuestas del libro no pasan por
  `registrarIntento` y no deben mover medallas (regla 4).
- **El libro de Rookie muestra las respuestas al niño**: trae un desplegable
  "Respuestas y pistas para el docente" dentro del mismo HTML. Es contenido de diseño,
  no de la plataforma, que sirve el archivo tal cual.
- **Almacenamiento**: en producción ya es Spaces (`lgs-kids`), y todo sale por las
  rutas AUTENTICADAS de la plataforma —nada de CDN público ni URL firmadas, que es
  lo que manda la regla 9 con datos de menores—. Queda por revisar si conviene
  servir el MATERIAL (libros de ~23 MB, arte) desde el CDN con URL firmada, sin
  perder la caja del libro (la CSP va en la respuesta y el iframe mantiene su
  `sandbox`). Y los videos se leen ENTEROS para responder un rango: con Spaces eso
  es una descarga completa por cada salto del reproductor — conviene pedir solo el
  tramo (`Range` hacia S3). Los temporales de compresión van a `os.tmpdir()` y se
  borran siempre; el contenedor necesita ahí unos cientos de MB libres.
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
