-- Plantilla "creacion-perfil-kids-sin-welcome" (2026-10-16): el texto que
-- definió el negocio para quien entra con el curso ya andando (crear el perfil
-- y la clave, sin agendar Welcome). La usa el botón "Sin Welcome" de la ficha
-- y de Servicio › Usuarios sin perfil.
-- Marcadores: {{apoderado}}, {{nombre}} (primer nombre del niño) y {{enlace}}.
UPDATE "notifications_plantilla"
   SET contenido = $plantilla$¡Hola, {{apoderado}}! 👋😊

✨ Para Let's Go Speak y su programa LGS Kids es muy importante que tengas acceso a nuestra plataforma Connection Kids. Sabemos que todos sus recursos y ayudas harán de este aprendizaje del inglés toda una aventura.

🎉 {{nombre}}, queremos invitarte a que accedas al link adjunto, personalices tu perfil y crees tu clave.

🔗 Link de conexión:
{{enlace}}

💬 No olvides que por medio de la plataforma puedes acceder a tus sesiones, material, recursos y mucho más.

😊 ¡Quedamos atentos de que lo puedas realizar cuanto antes!

📌 Importante: por favor, cuéntanos si tienes algún problema en la creación de tu perfil.

Quedamos atentos a tu respuesta. 💙$plantilla$,
       updated_at = now()
 WHERE slug = 'creacion-perfil-kids-sin-welcome';