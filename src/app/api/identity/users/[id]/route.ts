import {
  bootstrapIdentity,
  usuarioActualizarHandler,
  usuarioEliminarHandler,
} from "@/modules/identity";

bootstrapIdentity();

/** PATCH — { debeCambiarPassword?, estado?, ficha? } de una cuenta. */
export const PATCH = usuarioActualizarHandler;

/** DELETE — borra una cuenta SIN historia (si no, 409: hay que inactivarla). */
export const DELETE = usuarioEliminarHandler;
