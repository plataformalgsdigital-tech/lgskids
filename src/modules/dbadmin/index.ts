/**
 * Módulo `dbadmin` — API PÚBLICA.
 *
 * Explorador de la base de datos para el panel: mirar cualquier tabla y
 * escribirla. Es herramienta de administración, no de negocio: no conoce
 * campañas ni matrículas, solo tablas, columnas y filas.
 *
 * Acceso: **rol superadmin**, no un permiso (como la bóveda de claves). Ningún
 * permiso marcable en el panel lo concede, así que un admin con todos los
 * permisos tampoco entra.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo.
 */
export {
  listarTablas,
  esquemaTabla,
  leerFilas,
  exportarCsv,
  actualizarCelda,
  insertarFila,
  borrarFilas,
} from "./application/explorador";
export type {
  TablaInfo,
  EsquemaTabla,
  ColumnaInfo,
  PaginaFilas,
  ConsultaFilas,
} from "./application/explorador";
export {
  MASCARA,
  TABLAS_SENSIBLES,
  TAMANO_PAGINA_MAXIMO,
  FILAS_BORRADO_MAXIMO,
  esTablaSensible,
  motivoSensible,
} from "./domain/tablas";
