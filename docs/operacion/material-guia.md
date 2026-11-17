# Material Guía — guía para quien carga el material

> Mantenimiento Académico › **Material Guía** (`/panel/mantenimiento-cursos/material-guia`).
> Desde 2026-11-17. Lo que se sube aquí lo abre el guía desde los botones **Material** y
> **Recursos** del panel de la sesión.

## Qué se sube y dónde

| Pestaña      | Qué admite                                      |
| ------------ | ----------------------------------------------- |
| **Material** | Presentaciones (PPT, PPTX, PPS, PPSX) y PDF     |
| **Recursos** | Imágenes (JPG, PNG, WebP), videos MP4 y enlaces |

Hasta **80 MB por archivo**. Todo va por **lección** (Curso → Nivel → Lección); una lección
admite varios ítems, cada uno con su título y su orden.

## Cómo se carga

1. Elige **Curso**, **Nivel** y **Lección** (la lista sale del catálogo).
2. Elige la pestaña (Material o Recursos).
3. En "Agregar a esta lección" selecciona uno o varios archivos —o, en Recursos, escribe un
   enlace—, pon un título si quieres (con varios archivos cada uno toma su nombre) y pulsa
   **Subir**.
4. Para cambiar el orden usa ▲ ▼; ✏️ cambia el título; **Quitar** borra el ítem y su archivo.

El sistema revisa el CONTENIDO del archivo, no solo su extensión: un PDF renombrado, o una
imagen en la pestaña Material, se rechaza con un mensaje.

## Qué ve el guía

En el panel de la sesión, **solo lo de la lección de esa sesión** (la que ya muestra el
encabezado, por ejemplo "Nivel Champion · Sesión 21 · Lección 3"). Una sesión sin lección del
catálogo (refuerzo, evento, Welcome) no tiene material.

- **PDF**: se ve dentro del panel.
- **Presentación (PPTX)**: se ve con **Office para la web**, con animaciones y sonido. Si no
  carga, el botón "ábrela en PowerPoint" la descarga.
- **Imagen**: se ve ampliada. **Video**: se reproduce con barra para adelantar y retroceder.
- **Enlace**: se abre en una ventana nueva.
- Todo tiene **Pantalla completa**.

## Cosas que conviene saber

- **Presentaciones**: Microsoft descarga el archivo durante un rato (enlace temporal de
  60 minutos) para mostrarlo. Es material curricular, no datos de niños. Los PPTX muy pesados
  pueden no abrir en el visor; en ese caso se descargan. Si pasa con un archivo concreto,
  avisa para ajustar el límite que se muestra al subir.
- **Videos**: se reproducen tal cual se suben (sin recomprimir). Para uno muy pesado, mejor un
  enlace de YouTube/Vimeo.
- **Los enlaces anteriores** de `material_guia` y `recursos` del catálogo (los del CSV) **ya no
  se muestran**: el material se carga de cero aquí.
- Borrar una **lección** del catálogo borra también su material y sus archivos.

## Permisos

- Ver: `op.mant.material_guia` (los guías ven el material desde la sesión con
  `op.calendario.contenido`).
- Subir y quitar: `op.mant.material_guia_subir` (base `catalogo.gestionar`).
