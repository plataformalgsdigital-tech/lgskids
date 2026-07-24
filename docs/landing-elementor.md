# Landing de LGS Kids — reconstrucción en WordPress + Elementor

El sitio público `lgskidsplataforma.com` se maneja con **WordPress + Elementor**
(mismo estándar que las otras páginas del grupo). La landing de LGS Kids se
reconstruye ahí con método **mixto**: secciones de texto con widgets nativos de
Elementor + bloques HTML autocontenidos para las partes animadas.

## Archivos

- **`docs/landing-elementor-guia.html`** — guía completa para el administrador
  web: colores globales (hex), tipografía, textos por sección, qué widget de
  Elementor usar, y los 3 bloques HTML listos para pegar (tarjeta de progreso,
  botón «Acceder» animado, camino de niveles Rookie→Legendary). Ábrela en el
  navegador con doble clic.
- **`landing-estatica/index.html`** — la MISMA landing como HTML autocontenido
  (logo embebido). Sirve de referencia visual y como respaldo (fue la primera
  versión publicada en Hostinger antes de pasar a WordPress).
- **`src/app/page.tsx` + `src/app/landing.css`** — la landing dentro de la
  plataforma Next (ruta `/`), para el eventual despliegue de la app.

## Notas

- Los bloques HTML usan el prefijo `lk-` para no chocar con el tema de WordPress.
- El botón «Acceder a la plataforma» apunta por ahora a `https://lgskids.cl/`;
  se repuntará a `app.lgskidsplataforma.com` cuando la plataforma se despliegue.
- Paleta de marca: azul `#1e88ef`, cian `#00aeef`, verde `#69ae2e`, ámbar
  `#f5a800`, magenta `#ec008f`, púrpura `#7b2fbe`.
