# Libro interactivo: cómo entregarlo con los videos aparte

Guía para **diseño** (quien exporta el libro) y para **quien lo carga** en la
plataforma. Vigente desde el 2026-09-21.

## Por qué

Con los videos incrustados en base64, el libro de JUNIOR·Rookie pesaba 105 MB y
el niño bajaba los 11 minutos de canciones antes de ver la primera página. Sin
ellos, el mismo libro pesa **22,6 MB** y cada video se baja solo cuando el niño
le da play.

## 1. Diseño: el libro pide cada video por su ruta

En lugar de `data:video/mp4;base64,…`, cada video del libro apunta a una ruta
relativa con el **número de página** y el **número de video en esa página**:

```
videos/<página>-<n>.mp4
```

- `<página>` es el número que el libro usa en su código para esa página: el
  mismo índice de `openPage(i)` y de las claves de `LESSON_VIDEOS`,
  `EXTRA_LESSON_VIDEOS`, `FINAL_LESSON_VIDEOS`. **La bienvenida es la 0.**
- `<n>` empieza en 1. Si una página tiene dos videos, el segundo es `-2`.

Ejemplo (JUNIOR·Rookie, versión CON_PASSPORT):

```js
const WELCOME_VIDEO_SOURCE = 'videos/0-1.mp4';
const GREETINGS_VIDEO_SOURCE = 'videos/4-1.mp4';
const LESSON_VIDEOS = { "7": { "title": "The Colors Song", "src": "videos/7-1.mp4" }, … };
const EXTRA_LESSON_VIDEOS = { "9": { …, "src": "videos/9-2.mp4" }, … };   // la 9 ya tiene 9-1
const FINAL_LESSON_VIDEOS = { "14": [ { …, "src": "videos/14-1.mp4" }, { …, "src": "videos/14-2.mp4" } ] };
```

**Para probarlo en su equipo**: dejar una carpeta `videos/` junto al HTML con los
archivos con esos nombres (`videos/7-1.mp4`, …) y abrir el HTML. Funciona igual
que en la plataforma.

Las imágenes siguen yendo dentro del HTML, en base64, como hasta ahora.

## 2. Diseño: cómo exportar los videos

La plataforma **comprime sola** lo que se suba (a 360p), así que se puede subir
el original. Pero si se exporta ya así, se sube más rápido:

- MP4, video **H.264** (perfil Main), **360p** de alto, audio **AAC** estéreo
  de 48–64 kb/s.
- Es la receta que ya usa el libro CON_PASSPORT: sus 12 canciones pesan entre
  0,6 y 5,2 MB cada una.

Un video que ya viene bien comprimido **no se recomprime**: la plataforma lo
detecta (recodificarlo lo agrandaría) y lo deja como vino.

## 3. Quien carga: en la plataforma

En **Mantenimiento Académico**:

1. **Material del alumno** → sube el HTML (libro interactivo) y el PDF (libro
   para descargar) del curso y nivel.
2. **Videos del libro** → elige curso y nivel, y para cada video:
   - escribe la **página** y el **número de video en la página**; la pantalla
     muestra la ruta que le corresponde (`videos/7-1.mp4`) para compararla con
     la del libro;
   - elige el archivo (se ve un previo antes de subirlo) y pulsa **Subir y
     comprimir**;
   - cuando termina de comprimir aparece el **previo** con el antes y el después
     (p. ej. 20,2 MB → 3,4 MB): revísalo y pulsa **Confirmar y publicar**.
     Hasta que no se confirma, el niño no lo ve.
3. Para cambiar un video: **Reemplazar** (sube el nuevo en la misma casilla; al
   confirmarlo, el anterior se borra). Para quitarlo: **Borrar**.
4. En **Material del alumno → Ver** el libro se abre igual que lo ve el niño,
   con sus videos, para revisarlo completo.

Los videos son del **curso y nivel**, no del archivo HTML: subir una versión
nueva del libro no borra los videos ya publicados.

## 4. Derechos

Las canciones de estos libros son videos de YouTube de terceros (Planet Pop,
LARVA KIDS, ABCmouse, Lingokids, CoComelon, The Singing Walrus, …). Subirlas a
la plataforma es redistribuirlas: conviene confirmar que se pueden usar o
sustituirlas por material propio o con licencia.
