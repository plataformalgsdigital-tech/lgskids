/**
 * PRUEBAS DE ARQUITECTURA (sección 3.4 del diseño) — ejecutadas en CI.
 * Sin esto, las reglas de módulos "duran tres semanas".
 *
 * Ejecutar: pnpm test:arch
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "sin-dependencias-circulares",
      comment: "Regla 3.4.6: prohibidas las dependencias circulares.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "modulo-solo-por-index",
      comment:
        "Regla 3.4.1: un módulo solo se importa por su index.ts. " +
        "Alcanzar domain/application/infrastructure/api/ui de OTRO módulo es violación.",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/(?!$1/)[^/]+/.+",
        pathNot: "^src/modules/[^/]+/index\\.ts$",
      },
    },
    {
      name: "app-ui-worker-solo-por-index",
      comment:
        "Las rutas de app/, los componentes compartidos y el worker tampoco " +
        "pueden alcanzar el interior de un módulo: solo su index.ts.",
      severity: "error",
      from: { path: "^(src/app|src/ui|worker)/" },
      to: {
        path: "^src/modules/[^/]+/.+",
        pathNot: "^src/modules/[^/]+/index\\.ts$",
      },
    },
    {
      name: "platform-sin-negocio",
      comment:
        "Regla 3.4.5: platform/ es SOLO técnico. Si necesita importar un módulo " +
        "de negocio, esa lógica está en el lugar equivocado.",
      severity: "error",
      from: { path: "^src/platform/" },
      to: { path: "^src/modules/" },
    },
    {
      name: "ui-compartida-sin-modulos",
      comment: "src/ui/ son componentes compartidos SIN reglas de negocio.",
      severity: "error",
      from: { path: "^src/ui/" },
      to: { path: "^src/modules/" },
    },
    {
      name: "dominio-puro",
      comment:
        "domain/ contiene reglas puras: no puede depender de infrastructure/, " +
        "api/ ni ui/ de su propio módulo (ni de platform/db ni platform/http).",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/domain/" },
      to: {
        path: "^src/modules/$1/(infrastructure|api|ui)/|^src/platform/(db|http)/",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    exclude: { path: "\\.test\\.ts$|/tests/" },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
