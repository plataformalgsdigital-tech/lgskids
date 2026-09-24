# Despliegue a producción (DigitalOcean)

> Estado: la plataforma corre en App Platform desde 2026-09-24.
> Cuenta de DigitalOcean: la misma de MOSAICO y LGS.

## Qué hay creado

| Pieza             | Nombre                             | Notas                                                       |
| ----------------- | ---------------------------------- | ----------------------------------------------------------- |
| App               | `lgskids` (región `nyc`)           | 3 componentes: `web`, `tareas` (worker) y `migrar` (job)      |
| Base de datos     | `kids2026` en el clúster `lgs-db`  | PostgreSQL 18, nyc3. Usuario propio `kids2026_app`            |
| Archivos          | Spaces `lgs-kids` (nyc3)           | Llave `lgs-kids-app`, con permiso SOLO sobre ese bucket       |
| Imagen            | `registry.digitalocean.com/lgskids/web` | Registro DOCR, tier basic                                |

La base vive DENTRO de un clúster que ya existía: una base nueva no cuesta
aparte, pero **comparte las ~22 conexiones del clúster** con `defaultdb` e
`iris`. Por eso `DB_POOL_MAX=4` (no subirlo sin revisar el total, ADR-0004).

## Cómo se despliega

El código NO se construye en DigitalOcean: **la imagen se construye aquí y se
sube al registro**, y la app se redespliega sola al ver la etiqueta nueva
(`deploy_on_push` sobre `web`).

```bash
doctl registry login                      # una vez cada 30 días
docker build -t registry.digitalocean.com/lgskids/web:latest .
docker push registry.digitalocean.com/lgskids/web:latest
doctl apps list-deployments <app-id>      # seguir el despliegue
```

**Por qué no se construye desde GitHub**: el repositorio vive en la
organización `plataformalgsdigital-tech` y la integración de DigitalOcean con
GitHub no tiene acceso ("GitHub user does not have access to
plataformalgsdigital-tech/lgskids"). Autorizarla es cosa de dos clics en el
navegador —GitHub › Settings › Applications › DigitalOcean › dar acceso al
repositorio— y desde entonces se puede cambiar el spec de `image:` a `github:`
con `deploy_on_push`, que construye en la nube y ahorra subir 700 MB por
despliegue.

## Migraciones

Van en el trabajo de PRE-DESPLIEGUE `migrar`
(`node_modules/.bin/prisma migrate deploy`): corre ANTES de cambiar el tráfico,
con la misma imagen. Si falla, el despliegue se detiene y la versión anterior
sigue sirviendo.

El seed (`scripts/seed.ts`) se corrió UNA vez, a mano, al crear la base. No está
en el despliegue: añade permisos y no quita, pero crea `admin` y `superadmin`
con las claves de las variables `SEED_*`, y esas no viven en la app.

## Secretos

Viven cifrados en el spec de la app (`type: SECRET`). Están:
`DATABASE_URL`, `DIRECT_DATABASE_URL`, `DATABASE_CA_CERT`, `AUTH_JWT_SECRET`,
`PASSWORD_VAULT_KEY`, `LGS_INTAKE_API_KEY`, `SPACES_KEY` y `SPACES_SECRET`.

- **`PASSWORD_VAULT_KEY` no se puede perder ni rotar a la ligera**: con ella se
  descifran las copias de las claves (ver "Cuentas de usuario" en CLAUDE.md).
  Rotarla las deja ilegibles; las cuentas siguen entrando porque el login usa el
  hash. Guardar una copia FUERA de DigitalOcean.
- Para leer un secreto ya puesto: no se puede: `doctl apps spec get` los
  devuelve cifrados (`EV[1:...]`). Hay que rotarlos, no consultarlos.

## Trampas ya pagadas

- **El disco del contenedor es EFÍMERO.** Por eso el módulo `files` usa Spaces
  en producción (`SPACES_*`). Si esas variables faltan, la app arranca igual
  pero guardando en un disco que se borra en el siguiente despliegue — y eso se
  descubre cuando los archivos ya no están. `armarConfigSpaces` exige las cuatro
  o ninguna justo para eso.
- **TLS de la base**: DigitalOcean firma su Postgres con su propia autoridad y
  `pg` verifica de verdad desde 8.22. Sin `DATABASE_CA_CERT` la conexión falla
  con "self-signed certificate in certificate chain". Y OJO: `pg` da prioridad
  al `sslmode` de la URL sobre el certificado, así que el pool se lo quita
  (`conCertificado`). La URL de MIGRACIONES sí lleva `?sslmode=require`, porque
  Prisma no lee ese certificado.
- **La base tiene FUENTES CONFIABLES**: el clúster `lgs-db` filtra por origen
  (hay IP sueltas y otras apps). Una app nueva NO entra sola: el trabajo de
  migraciones falla con `P1001: Can't reach database server`, que suena a base
  caída y es un cortafuegos. Se arregla con
  `doctl databases firewalls append <cluster> --rule app:<app-id>` — `append`,
  nunca `replace`, que borraría las reglas de los demás sistemas.
- **`slim` no trae OpenSSL** y el motor de Prisma lo necesita para hablar TLS.
  Sin él avisa ("Prisma failed to detect the libssl/openssl version") y falla
  con el MISMO `P1001`, así que los dos problemas se confunden. `pg` no lo usa
  (va por el TLS de Node), por eso el servicio web arrancaba y solo caían las
  migraciones.
- **Debian, no Alpine**: `sharp` y `ffmpeg-static` traen binarios de glibc. Sobre
  musl el fallo no aparece al construir sino al subir una imagen o comprimir un
  video.
- **corepack en la imagen final**: `corepack enable` solo deja el atajo; el pnpm
  real se descarga la primera vez que se invoca, y en producción eso pasa con el
  usuario `node`, que no puede escribir en las carpetas de root. Se baja al
  construir (`corepack prepare`) y, además, el contenedor arranca con el binario
  directo (`node_modules/.bin/next start`), sin pasar por pnpm.
- El tamaño de la imagen (1,8 GB) es alto porque lleva las dependencias de
  desarrollo: las necesita el trabajo de migraciones (Prisma y tsx). Si algún día
  molesta, el camino es una etapa `--prod` aparte para el servicio web.

## Dominio

`app.lgskidsplataforma.com` → CNAME al ingress de la app. El DNS lo administra
**Hostinger** (ahí vive la landing de WordPress en la raíz del dominio), así que
el registro se agrega con su CLI:

```bash
hostinger dns records list lgskidsplataforma.com
hostinger dns records update lgskidsplataforma.com --zone '<json>' --overwrite false
```

El certificado lo emite DigitalOcean (Let's Encrypt) cuando el CNAME resuelve.
