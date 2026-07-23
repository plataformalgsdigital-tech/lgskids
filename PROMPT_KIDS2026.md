# PROMPT MAESTRO — KIDS2026 (LGS Kids)

> Plataforma nueva, con arquitectura modular escalable, construida sobre el conocimiento de dominio ya probado en producción en LGS y MOSAICO.
> Pegar en Claude Code con la carpeta `KIDS2026` abierta. Completar las ⚙️ antes de enviar.

---

## 1. ROL Y ENCARGO

Actúa como arquitecto de software senior, desarrollador full-stack y especialista en DevOps.

Vas a diseñar y construir **KIDS2026**, la plataforma de gestión académica de **LGS Kids**: enseñanza de inglés para niños de 6 a 13 años, avalada por LetsGoSpeak.

**Trabaja por fases. No generes cientos de archivos en la primera ejecución.** Entrega primero el diseño para aprobación (Fase 1) y detente al final de cada fase.

---

## 2. EL DOMINIO — ESTO NO ES NEGOCIABLE, ES CÓMO OPERA EL NEGOCIO

Léelo antes de proponer arquitectura. Todo lo que sigue viene de dos plataformas hermanas en producción.

### 2.1 Modelo de operación: cohortes con horario fijo

**El niño NO agenda sus clases.** Se matricula en un **salón** con horario fijo y asiste a lo que ese salón programe. Esto es lo contrario del modelo de LGS (reserva libre con límites semanales) y define casi todas las decisiones del diseño.

```
CAMPAÑA
  └── CURSO  (tipo: JUNIOR 6–9 años | YOUNGSTER 10–13 años)
        ├── NIVEL  (Rookie → Champion → Elite → Legendary)
        │     ├── LECCIÓN
        │     └── CUESTIONARIO
        ├── SALÓN  (horario recurrente, profesor, cupo)
        │     └── CLASE (ocurrencia fechada)  →  ASISTENCIA
        └── TALLER / CLUB  (práctica, por tipo de curso)
```

**Regla dura:** la lista de clase se deriva del salón, nunca de una acción del estudiante. El único camino por el que un niño queda inscrito en una sesión es la generación automática desde el curso.

### 2.2 Cómo funciona una campaña

1. Se crea una campaña con fecha de inicio y duración.
2. La campaña genera **cursos de ambos tipos**, cada uno con sus salones (tipoCurso × horario × profesor × cupo).
3. Cada curso genera **todas sus clases** a partir de `(inicioCurso, finalCurso, horario)`.
4. Al aprobarse un contrato, el niño queda matriculado en un salón y se le generan sus inscripciones a partir de las clases de ese curso.

**Estados de campaña derivados por fecha:** En matrícula · Activa · Cerrada.

### 2.3 Reglas de calendario que ya costaron caro

- **Los feriados no se dictan y la sesión se corre al final del curso**, conservando el número total de clases. Los feriados fijos y Semana Santa deben calcularse por código (para que funcione en años futuros sin mantenimiento) y los movibles cargarse desde un JSON curado que solo suma, nunca anula.
- **Se puede suspender un día puntual de clase** (motivo obligatorio, auditado) con el mismo efecto: la sesión se corre al final. **Las suspensiones van en tabla, no en memoria** — regenerar un curso borra y recrea sus clases desde `(inicio, final, horario)`, así que una suspensión no persistida reaparece.
- **`finalCurso` NUNCA se reescribe.** Es la ventana nominal con la que se *cuenta* el número de sesiones. Extenderla hace que cada regeneración agregue una sesión de más y el curso crezca solo. **El fin real del curso es la fecha de la última clase**, que puede caer más allá de `finalCurso`.
- **Al regenerar, los alumnos se derivan del contrato/matrícula, no de las inscripciones previas.** Es robusto ante borrados.

### 2.4 Contratos

- El contrato lo avala LGS, pero ⚙️ **decidir si se crea dentro de KIDS** (recomendado: es lo que hace Mosaico y evita construir un puente) **o nace en LGS** (entonces hay que construir sincronización firmada con HMAC).
- El contrato define el **tipo de curso** (JUNIOR/YOUNGSTER) y la vigencia.
- **`finalContrato` es `DATE` puro** (sin hora ni zona). Un contrato se considera vencido solo cuando la fecha UTC del servidor es **≥ 2 días** posterior. Esto evita bloquear a un usuario cuando su último día todavía corre en su reloj local. **Una sola función decide esto**, usada desde login, carga de panel, cron y SQL.
- **OnHold con extensión automática**: pausar al niño y, al reactivar, extender `finalContrato` por los días pausados, con registro en el historial. El niño no pierde días.
- **Cascada de inactivación sincronizada**: persona + registro académico + credenciales de acceso. Si solo actualizas una, quedan niños que entran con el contrato vencido.

### 2.5 Particularidades por ser una plataforma para niños

- **Cada niño tiene un apoderado** con sus propios datos de contacto. No asumas que el titular del contrato es el apoderado — ofrece el atajo ("¿el titular será el apoderado?") pero permite que difieran.
- **Hermanos que comparten el correo del papá**: si deduplicas usuarios por email, el segundo hermano se queda sin cuenta. Cada niño necesita **login propio**, con usuario autogenerado y correo sintético cuando haga falta.
- **Validación de edad**: la edad del niño a la fecha de inicio determina el tipo de curso. Validar contra fecha de nacimiento, no confiar en el dato del contrato.
- **La interfaz del niño es distinta**: simple, visual, con su próxima clase, su avance y sus logros. La del apoderado es de consulta y gestión.

### 2.6 Progresión académica

El avance de nivel se determina por **lecciones dictadas + cuestionario aprobado**. No por conteo de sesiones asistidas (esa regla viene del agendamiento libre y no aplica a cohortes).

**El avance debe ser una sola función central**, invocada desde *todos* los caminos que registran asistencia o califican un cuestionario (individual, masiva, evaluación, panel de admin, aprobación de cuestionario). En LGS esa función no se disparaba desde todos los caminos y los alumnos quedaban trabados sin poder recuperarse.

### 2.7 Movimientos del alumno

Debe existir un **"cambio académico"** que mueva a un niño de campaña, curso o salón: ajusta cupos en origen y destino, conserva el historial de clases pasadas, regenera las futuras en el curso nuevo, y queda auditado con motivo obligatorio.

### 2.8 Trampas transversales

1. **Zonas horarias.** Fue el peor bug de LGS: clases guardadas con la zona del navegador y consultadas con fronteras UTC hacían desaparecer las clases de la tarde-noche de los reportes mensuales. **Guarda instantes en UTC, ancla la semántica de día/semana/mes a una zona operativa fija, y agrupa en SQL con `AT TIME ZONE`** — correcto ante horario de verano e independiente del país de quien consulta. Nunca agrupes por fecha en JavaScript con la zona del cliente.
2. **Consultas sin índice.** Una consulta de historial en LGS hacía recorrido secuencial sobre 165.000 filas: ~10 s. No uses funciones sobre columnas indexadas en el `WHERE`; pagina siempre; la tabla de asistencia crece rápido.
3. **Operaciones masivas.** Regenerar un curso puede tocar miles de filas. Un `UPDATE` por fila es el cuello de botella; usa actualizaciones por lote.
4. **Un solo lugar donde "nace" un alumno.** En Mosaico, dar de alta un beneficiario por una vía distinta lo creaba sin campaña, curso, salón ni login, y al aprobarlo no se le generaban clases. Debe existir **una única definición transaccional** de cómo se crea un alumno, compartida por todos los flujos.
5. **Nada de estado en memoria** que deba sobrevivir a un reinicio o a una segunda réplica.
6. **La autorización se hace en el servidor, en cada endpoint.** Los guardas de interfaz son cosmética.

---

## 3. ARQUITECTURA

### 3.1 Forma: monolito modular, un solo despliegue

**Next.js (App Router) + TypeScript**, con la lógica organizada **por módulo de negocio**, no por capa técnica. Un servicio web + un worker para tareas programadas.

**Por qué no NestJS ni monorepo con Turborepo:** duplicarían servicios, costo de infraestructura y curva de aprendizaje sin resolver ningún problema real de KIDS. La modularidad que buscas se consigue con límites de módulo bien definidos y pruebas de arquitectura que los hagan cumplir — no con más procesos. Si algún día un módulo debe extraerse, la estructura de abajo lo permite.

### 3.2 Estructura del repositorio

```
src/
├── modules/
│   ├── identity/          Autenticación, sesiones, credenciales
│   ├── access/            Roles, permisos, RBAC, alcance por país
│   ├── people/            Niño, apoderado, titular; relación apoderado–niño
│   ├── contracts/         Contrato, vigencia, OnHold, extensiones, consentimiento
│   ├── catalog/           Campaña, curso, nivel, lección, cuestionario, material
│   ├── scheduling/        Salón, horario, generación de clases, feriados, suspensiones
│   ├── enrollment/        Matrícula, cupos, cambio académico
│   ├── attendance/        Asistencia y justificaciones
│   ├── assessment/        Cuestionarios, intentos, calificación
│   ├── progression/       Avance de nivel (la función central)
│   ├── reporting/         Informes, exportaciones, tableros
│   ├── notifications/     WhatsApp, correo
│   ├── files/             Puerto de almacenamiento + adaptador Spaces
│   └── audit/             Auditoría de operaciones críticas
│
├── platform/              Técnico transversal, SIN reglas de negocio
│   ├── db/                Pool, transacciones, helpers de consulta
│   ├── errors/            NotFound, Validation, Unauthorized, Forbidden, Conflict
│   ├── http/              handler(), handlerWithAuth(), respuestas estándar
│   ├── time/              Zona horaria operativa, conversiones, bucketing
│   ├── ids/               Generadores de identificadores
│   ├── logging/           Logs JSON con correlation ID
│   └── config/            Carga y validación de variables de entorno
│
├── app/                   Rutas Next.js (páginas + API), delgadas
└── ui/                    Componentes compartidos, sin reglas de negocio

prisma/                    Esquema y migraciones versionadas
scripts/                   Utilidades operativas y migraciones de datos
worker/                    Tareas programadas
docs/
├── architecture/          Diagramas
├── adr/                   Decisiones arquitectónicas
├── modules/               Un documento por módulo
└── runbooks/              Respaldo, restauración, rollback
infra/
├── docker/                Docker Compose para desarrollo local
└── digitalocean/          Especificaciones de App Platform
```

### 3.3 Anatomía de un módulo

```
modules/<modulo>/
├── domain/          Entidades, objetos de valor, reglas puras, eventos
├── application/     Casos de uso, comandos, consultas, DTOs, PUERTOS (interfaces)
├── infrastructure/  Repositorios, adaptadores, acceso a datos
├── api/             Controladores/handlers HTTP, validación de entrada
├── ui/              Componentes y hooks propios del módulo
├── index.ts         API PÚBLICA del módulo — lo único importable desde fuera
└── tests/
```

### 3.4 Reglas de independencia entre módulos

1. **Un módulo solo se importa a través de su `index.ts`.** Nunca alcanzar rutas internas de otro módulo (`modules/x/infrastructure/...` desde fuera es una violación).
2. **Cada módulo es dueño de sus tablas.** Solo su capa de infraestructura las escribe.
3. **Comunicación síncrona por puertos**: el módulo consumidor declara la interfaz que necesita; el proveedor la implementa. `progression` no consulta las tablas de `attendance`: pide `AttendanceQueryPort`.
4. **Eventos de dominio** para efectos secundarios entre módulos (ej. "asistencia registrada" → progresión recalcula).
5. **`platform/` es solo técnico.** Si aparece una regla de negocio ahí, está en el lugar equivocado.
6. **Sin dependencias circulares.**
7. **Pruebas de arquitectura que hagan cumplir todo lo anterior**, ejecutadas en CI. Sin ellas, estas reglas duran tres semanas.

### 3.5 Excepción deliberada: integridad referencial

**Sí habrá claves foráneas entre tablas de módulos distintos** cuando el negocio lo exija (asistencia → clase → salón → curso; matrícula → contrato → persona).

Renunciar a las FK "para preparar microservicios" empuja la integridad al código de aplicación, y ahí es donde LGS acumuló su deuda real: registros académicos duplicados, beneficiarios sin perfil, estados desincronizados entre tablas. **PostgreSQL garantiza eso gratis.** El límite entre módulos se defiende con las pruebas de arquitectura del punto 3.4, no rompiendo la base de datos.

**Documenta esta decisión en un ADR**, con el costo asumido: extraer un módulo a futuro exigirá romper esas FK deliberadamente.

---

## 4. STACK

| Componente | Elección |
|---|---|
| Frontend + Backend | **Next.js (App Router) + React + TypeScript estricto** |
| Base de datos | **PostgreSQL administrado en DigitalOcean** |
| Acceso a datos | **Prisma** para esquema, migraciones y consultas simples; **SQL crudo parametrizado** permitido y esperado en consultas críticas |
| Validación | **Zod**, compartido entre formulario y endpoint |
| Autenticación | JWT de corta duración + refresh rotativo en cookie HttpOnly/Secure/SameSite |
| Permisos | RBAC por rol, con alcance por país |
| Archivos | **DigitalOcean Spaces** vía puerto de almacenamiento |
| Tareas programadas | Worker con cron. **Redis + BullMQ solo si aparece una necesidad real** |
| Documentación API | OpenAPI generado desde los esquemas Zod |
| Pruebas | **Vitest** unitarias e integración; **Playwright** para flujos críticos |
| Calidad | ESLint + Prettier + `tsc --noEmit` |
| Desarrollo local | **Docker Compose** (Postgres + adaptador de archivos local) |
| CI/CD | **GitHub Actions** |
| Despliegue | **DigitalOcean App Platform** (web + worker) |
| Paquetes | pnpm |

**Sobre Prisma:** úsalo para el esquema, las migraciones y el CRUD. Pero las consultas que dependen de índices o de agrupación por zona horaria van en SQL crudo parametrizado con `$queryRaw`. No fuerces el ORM donde el rendimiento importa; documenta cada caso en el módulo correspondiente.

---

## 5. BASE DE DATOS

- **UUID** para identificadores expuestos.
- `created_at`, `updated_at`, y `deleted_at` donde el borrado lógico esté justificado por negocio.
- **Migraciones versionadas y revisables.** Nunca `prisma db push` contra producción.
- **Índices explícitos** desde el diseño, no después del incidente. Mínimos: clase por (salón, fecha), asistencia por clase, asistencia por (niño, clase), matrícula por (niño, estado), contrato por (beneficiario, estado), intento por (niño, cuestionario).
- **Restricciones únicas** donde el negocio las exige (suspensión única por curso y fecha; documento único por persona).
- **Transacciones** en toda operación que toque más de una tabla: creación de alumno, cambio académico, ajuste de cupos, regeneración de clases.
- **Un solo esquema PostgreSQL**, con prefijo de módulo en el nombre de las tablas. Los esquemas separados por módulo añaden fricción con Prisma y no aportan aislamiento real en un monolito. *(Documentar en ADR.)*
- **`DATABASE_URL`** con pool para la aplicación; **`DIRECT_DATABASE_URL`** para migraciones.
- **Presupuesto de conexiones**: la base administrada admite ~22 conexiones. Configura el pool en **8–10** y documéntalo. En LGS un pool mal dimensionado agotó la base.
- **Auditoría separada** de las tablas operativas.
- **Seed mínimo** para desarrollo: roles, permisos, usuario admin, una campaña de prueba con ambos tipos de curso y sus niveles.

**Acceso a la base desde desarrollo:** la base administrada filtra por IP (*trusted sources*) y la IP del entorno cambia entre sesiones. Documenta el procedimiento: agregar la IP con `doctl` antes de correr scripts, y **removerla al terminar**.

---

## 6. ARCHIVOS

Nada se guarda en el disco del contenedor. Define un **`StoragePort`** en `modules/files/application` con dos adaptadores: **Spaces** (producción) y **local** (desarrollo).

Debe soportar: carga por URL prefirmada · descarga por URL temporal · validación de tipo MIME y tamaño · nombres internos no predecibles · metadatos en PostgreSQL · **archivos privados por defecto** · eliminación controlada.

⚠️ Los materiales y contratos llevan datos de menores de edad. **Ninguna carpeta ni objeto con acceso "cualquiera con el enlace".** Esto quedó pendiente en Mosaico; en KIDS es requisito de la primera versión.

---

## 7. SEGURIDAD

- Hash de contraseñas con algoritmo moderno.
- Access token corto + refresh rotativo en cookie HttpOnly, Secure, SameSite.
- Revocación y cierre de sesiones.
- **Autorización en el servidor, endpoint por endpoint.** Un middleware que no cubra las rutas de API deja cada una expuesta; en LGS un endpoint público permitía cambiar la contraseña de cualquier cuenta.
- RBAC con permisos en base de datos y caché corta; alcance por país.
- Rate limiting en autenticación y en endpoints de envío.
- CORS restrictivo, cabeceras de seguridad, validación y saneamiento de toda entrada.
- Registro de intentos de acceso y auditoría de operaciones críticas.
- **Ningún secreto en el repositorio.** `.env.example` solo con nombres y explicaciones. Secretos por ambiente en GitHub Environments y en DigitalOcean.
- Protección reforzada de datos personales de menores.

---

## 8. GITHUB

Antes de tocar archivos: inspecciona el directorio, confirma si ya existe un proyecto, y no borres nada sin analizar su propósito. Inicializa Git solo si no existe.

- Rama de trabajo `feature/bootstrap-platform`, commits pequeños y descriptivos, sin `push --force`.
- Protección de `main`, plantilla de pull request, Dependabot.
- **Nunca subir** secretos, certificados, `.env`, ni datos reales de alumnos.

**GitHub Actions:** instalación reproducible con lockfile · lint · revisión de tipos · pruebas unitarias e integración · **pruebas de arquitectura** · compilación · escaneo de dependencias · despliegue a staging desde `develop` · despliegue a producción desde `main` con aprobación · migraciones como paso previo al despliegue.

---

## 9. DESPLIEGUE Y OBSERVABILIDAD

**DigitalOcean App Platform**: servicio web (Next.js) + worker (tareas programadas), PostgreSQL administrado, Spaces.

- Endpoints `/health/live` y `/health/ready`.
- Migraciones como trabajo previo al despliegue.
- Ambientes **staging** y **production** con variables separadas.
- Logs estructurados en JSON con correlation ID; manejo centralizado de excepciones; apagado controlado.
- Procedimiento de **rollback** y de **respaldo/restauración** documentados en `docs/runbooks/`.

⚠️ **Dimensionamiento**: si generas PDFs con navegador headless, el servicio web necesita **al menos 1 GB** — Mosaico tuvo que subirlo porque no cabía en 512 MB.

**No ejecutes despliegues reales ni crees recursos pagos sin mi autorización expresa.** Antes de la Fase 2, entrégame la lista de costos mensuales estimados para que la apruebe.

---

## 10. FRONTEND

Responsiva · accesible · en español · preparada para internacionalización · menú lateral generado según permisos · layouts separados para administración, profesor, apoderado y niño · componentes reutilizables · estados de carga, vacío y error · cliente de API tipado · formularios validados con el mismo esquema en cliente y servidor · **sin reglas críticas de negocio dentro de los componentes**.

La interfaz del niño (6–13 años) merece diseño propio: lenguaje simple, apoyo visual, pocas decisiones por pantalla.

---

## 11. PLAN DE FASES

**FASE 1 — Diseño (empieza solo con esto).**
Analiza el requerimiento, propón la división definitiva de módulos y entrega:
- Diagrama de arquitectura y diagrama de módulos.
- **Mapa de dependencias permitidas entre módulos** (qué puerto expone cada uno y quién lo consume).
- Estructura del repositorio.
- Modelo preliminar de datos con índices y restricciones.
- ADR: monolito modular · integridad referencial entre módulos (sección 3.5) · Prisma con SQL crudo en rutas críticas · esquema único · autenticación · almacenamiento en Spaces · zona horaria operativa.
- Plan de implementación por fases.
- **Lista de preguntas funcionales pendientes.**

No generes código todavía. Espera aprobación.

**FASE 2 — Cimientos.** Repositorio, herramientas, Docker Compose, Next.js con estructura de módulos vacía, `platform/` completo, PostgreSQL local, health checks, CI con lint + tipos + pruebas + **pruebas de arquitectura**. Que todo compile.

**FASE 3 — Identidad, acceso y auditoría.** Autenticación, usuarios, roles, permisos, alcance por país, auditoría. Con pruebas.

**FASE 4 — Módulo vertical de referencia: `catalog`.** Campaña → curso → nivel → lección → cuestionario, completo de dominio a interfaz, con migraciones y pruebas. Sirve de patrón para los demás.

**FASE 5 — `people` y `contracts`.** Niño, apoderado, titular; contrato con vigencia, OnHold, extensión y cascada de inactivación. Creación transaccional única del alumno.

**FASE 6 — `scheduling`.** Salones, generación de clases desde el horario, feriados, suspensiones. Aquí viven las reglas de 2.3; trátalas con cuidado y cúbrelas con pruebas.

**FASE 7 — `enrollment`.** Matrícula, cupos, cambio académico.

**FASE 8 — `attendance` y `assessment`.**

**FASE 9 — `progression`.** La función central de avance, con prueba que enumere todos los caminos que deben dispararla.

**FASE 10 — `reporting`, `notifications`, `files`.**

**FASE 11 — Despliegue.** Staging, producción, runbooks.

---

## 12. CRITERIOS DE CIERRE DE CADA FASE

Antes de declarar una fase terminada: ejecuta lint · revisión de tipos · pruebas · pruebas de arquitectura · compilación · revisa las migraciones · verifica que no haya secretos · actualiza la documentación. Luego preséntame: archivos modificados · comandos ejecutados · errores, riesgos y trabajo pendiente.

---

## 13. CÓMO QUIERO QUE TRABAJES

- Antes de codificar cada fase, muéstrame un **plan corto** y espera visto bueno.
- **No me hagas muchas preguntas al inicio.** Ante ambigüedad, decide lo razonable, sigue, y anótalo en **"Decisiones tomadas"** al final de tu respuesta.
- Código completo y funcional, sin `// ...resto igual`.
- Todo cambio de esquema con su migración y el comando exacto.
- Si algo que pido choca con las trampas de la sección 2.8, dímelo **antes** de implementarlo.
- Mantén el `CLAUDE.md` del proyecto actualizado **y preciso**: en Mosaico quedó describiendo tablas que ya no existían y eso causó fallas reales.
- Registra las versiones exactas de cada herramienta al iniciar.

---

## 14. REFERENCIA DISPONIBLE

Existen dos plataformas hermanas en producción — **LGS2026** y **MOSAICO2026** — que resuelven partes de este dominio. Mosaico en particular ya tiene funcionando la generación de clases con feriados, las suspensiones, el cambio académico y el manejo de apoderados y hermanos.

**Úsalas como referencia de algoritmo, no como código a copiar**: el objetivo de KIDS2026 es una base limpia y modular, sin la deuda heredada de la migración desde Wix ni el motor de agendamiento libre que no aplica a cohortes. Cuando llegues a una regla de la sección 2, puedes pedirme el archivo correspondiente de esas plataformas para ver cómo se resolvió allá.

---

### ⚙️ COMPLETAR ANTES DE ENVIAR

- [ ] ¿El contrato de KIDS se crea dentro de KIDS o nace en LGS?
- [ ] ¿KIDS opera solo en Chile o también en Colombia/Ecuador/Perú? (define el trabajo de feriados y zonas horarias)
- [ ] Zona horaria operativa por defecto
- [ ] Vocabulario: ¿profesor, guía, coach? ¿taller o club?
- [ ] ¿El avance Rookie → Champion es automático o requiere aprobación del coordinador?
- [ ] Número de lecciones y cuestionarios por nivel
- [ ] ¿Los talleres son de inscripción voluntaria o de asistencia libre?
- [ ] Clases por semana y duración por salón
- [ ] ¿Clases virtuales con enlace, presenciales, o ambas?
- [ ] Nombre de marca, dominio y paleta
- [ ] Presupuesto mensual de infraestructura aprobado
