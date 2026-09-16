# Contenido de los libros interactivos

Transcripción del material impreso de LGS Kids a datos que la plataforma lee.
Estos JSON son la **fuente revisable**; la base es donde se cargan. Se transcribió
primero y el esquema salió después, para que la forma la decidieran los datos
reales y no una conjetura.

## Cómo se carga

```bash
pnpm libro:importar content/libros/<archivo>.json            # texto, claves y escenas
pnpm libro:paginas "<pdf>" <CURSO> <NIVEL> "<CÓDIGO>"         # imagen de cada página
pnpm libro:audios <carpeta> <CURSO> <NIVEL> "<CÓDIGO>"        # narración
```

Reimportar el JSON **conserva** las imágenes de página: no hace falta volver a
rasterizar el PDF.

## De dónde sale

El material de origen vive FUERA del repositorio, en
`Documents\Grupo_JJ\002 LGS KIDS\Books\<curso>\<nivel>\`:

- `PRINT/PRINTBOOK-UNIT <n> <CUR>-<NIV>.pdf` — el imprimible, en pliegos
  (una página del PDF = dos páginas numeradas del libro)
- `EDITION/DIGIBOOK-*.pptx` — la fuente editable de la versión interactiva
- `Audios/<unidad>/` — las pistas, nombradas `PAG<nn>-<nn>`

**Cada PDF termina con un ANSWER KEY**: los pliegos en miniatura con las
respuestas en rojo y la marca *"Espacio libre para ser llenado por el
explorador"* donde NO hay respuesta correcta. Esa marca es la que separa el
ejercicio **evaluable** del **portafolio**, y ya la decidió el equipo de
contenido: aquí solo se transcribe.

## Qué significa cada campo

- `clave` — la respuesta correcta, tomada del answer key. Su presencia es lo que
  hace al elemento evaluable.
- `libre: true` — "Espacio libre para ser llenado por el explorador". Se guarda
  como portafolio y **no puntúa**.
- `confirmar` — lo que no pude leer con certeza del answer key, o lo que depende
  de una decisión que no me toca. **No lo resuelvas adivinando**: cada entrada
  dice qué hay que mirar y dónde.
- `pagina` / `numeroImpreso` / `pliego` — tres números distintos. `pagina` es el
  ORDEN de lectura; `numeroImpreso` el que el niño ve en el papel (null en las
  portadas, que no llevan); `pliego` la página REAL del PDF. Mezclarlos desalineó
  el libro entero una vez: verifica leyendo el número impreso, no contando.
- `escena` — la página rediseñada por capas, con el personaje nuevo. Cuando
  existe manda sobre la imagen aplanada del PDF. Solo en páginas cuyo dibujo es
  personaje + título: donde el dibujo ES el ejercicio, quitarlo borra contenido.

## La regla que no se cruza

Lo que tiene `clave` se corrige y entra por `registrarIntento` — la única puerta
a la progresión (regla 4). Lo que tiene `libre` se guarda para que lo vea el
guía y no toca progresión. Un libro que escriba progresión por su cuenta abre un
cuarto camino y rompe la invariante.
