# arte/

Ilustraciones ORIGINALES de los personajes de LGS Kids, a resolución completa
(~1024×1536). Es material de origen: **no se despliega**.

De aquí salen, por proceso, los archivos que sí usa la aplicación:

- `public/personajes/*.webp` — poses del panel del alumno (`src/ui/Personaje.tsx`).
- `landing-estatica/wp-theme/lgs-kids-landing/assets/personajes/` — las cuatro
  poses base de la landing (WebP + respaldo PNG).

El proceso recorta el fondo cuando hace falta (varias vienen con el tablero de
transparencia pintado en los píxeles, no con alfa real), recorta al contorno,
escala a 440 px de ancho y exporta WebP.

Pesan ~35 MB en total: si el repositorio se vuelve incómodo, este directorio es
el primer candidato a salir (a Drive o a Git LFS).
