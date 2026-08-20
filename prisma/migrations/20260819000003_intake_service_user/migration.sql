-- Usuario de SISTEMA para atribuir las acciones del intake LGS (Fase B) a un
-- actor válido en la auditoría. NO inicia sesión (no se comparten credenciales):
-- la puerta de servicio se autentica por API-key, no por este usuario.
INSERT INTO "identity_user"
  (id, username, email, password_hash, estado, debe_cambiar_password, updated_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'sistema-lgs', NULL,
   'no-login', 'ACTIVO', false, now())
ON CONFLICT DO NOTHING;
