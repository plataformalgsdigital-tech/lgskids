-- Plantilla "creacion-perfil-kids" (2026-10-16): el texto de bienvenida que
-- definió el negocio. Es la que sale SOLA al aprobar el contrato de un niño
-- (aprobado en KIDS o desde LGS, que pide la aprobación a KIDS) y con el botón
-- "Con Welcome" de la ficha y de Servicio › Usuarios sin perfil.
-- Marcadores: {{apoderado}}, {{nombre}} (primer nombre del niño) y {{enlace}}
-- (el enlace personal para crear el perfil y agendar el Welcome).
UPDATE "notifications_plantilla"
   SET contenido = $plantilla$¡Hola, {{apoderado}}! 👋😊

✨ De parte de Let's Go Speak y su programa LGS Kids, estamos muy felices de darles la bienvenida a {{nombre}} y a ti a nuestro programa de inglés. ✨

🎉 Queremos que crees el perfil de {{nombre}} en nuestra plataforma Connection Kids y agendes su bienvenida: una sesión especial donde te contaremos todo lo que necesitas saber para comenzar esta nueva etapa con confianza, motivación y entusiasmo.

👉 Accede al siguiente link y escoge uno de los horarios programados:
{{enlace}}

🎥 Para entrar a la sesión de bienvenida, en tu plataforma encontrarás el link de Zoom y la programación con fecha y hora.

💬 Será una excelente oportunidad para conocernos, resolver tus dudas y compartir contigo toda la información importante sobre el curso.

😊 ¡Te esperamos con mucha ilusión!

📌 Importante: el link es personal de {{nombre}}; por favor, no lo compartas.

Quedamos atentos a tu respuesta. 💙$plantilla$,
       updated_at = now()
 WHERE slug = 'creacion-perfil-kids';