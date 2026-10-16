-- Plantilla "envio-acceso" (2026-10-16): la que manda el botón "Enviar acceso por
-- WhatsApp" de la ficha del niño, con el texto que definió el negocio.
-- Reemplaza a "credenciales-kids" en ese botón (que queda, editable y
-- desactivable). Marcadores: {{apoderado}} (primer nombre del apoderado),
-- {{nombre}} (primer nombre del niño), {{usuario}} y {{clave}}.
--
-- El texto pasa de 1000 caracteres (lleva emojis): el tope sube a 2000.
-- WhatsApp admite 4096.
ALTER TABLE "notifications_plantilla" DROP CONSTRAINT "notifications_plantilla_contenido_largo";
ALTER TABLE "notifications_plantilla"
  ADD CONSTRAINT "notifications_plantilla_contenido_largo" CHECK (char_length("contenido") <= 2000);

INSERT INTO "notifications_plantilla" (id, slug, nombre, descripcion, contenido) VALUES
    (gen_random_uuid(), 'envio-acceso', 'Envío de acceso',
     'Bienvenida con usuario y clave del niño. La usa el botón "Enviar acceso por WhatsApp" de la ficha del niño.',
     $plantilla$🌟👋 ¡Hola, {{apoderado}}! 😊
Queremos darte la bienvenida al programa de Inglés de LGS Kids 👧.
Estamos muy emocionados 🤩 de que {{nombre}} haga parte de esta aventura, y queremos acompañarte en esta nueva aventura de aprendizaje 📚✨.

👉 Para acceder a tus sesiones, solo debes ingresar a:
🌐 https://app.lgskidsplataforma.com/login

y colocar el usuario 👤 y la contraseña 🔑 que te compartimos a continuación:

👤 USUARIO: {{usuario}}
🔑 CONTRASEÑA: {{clave}}

Desde allí podrás entrar a tus clases en vivo 🎥🎧 y también disfrutar del material digital 📘💻 que hace parte del programa, ¡todo en un solo lugar! 🎯

📞 Si tienes dudas o necesitas ayuda en cualquier momento, comunícate con nuestro equipo de atención al usuario al número: +57 324 6841658 🤝💬.
Estamos aquí para apoyarte en todo lo que necesites 💡🙌.

✨💖 ¡Gracias por confiar en Let's Go Speak y su programa LGS Kids!
Esperamos que disfrutes muchísimo esta experiencia 🌈 y que juntos logremos grandes avances en el aprendizaje del inglés 🚀📖.

🎉🎊 ¡Bienvenido a esta increíble aventura! 🌟💫$plantilla$)
ON CONFLICT (slug) DO NOTHING;