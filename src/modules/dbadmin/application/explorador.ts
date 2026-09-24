import { registrarAuditoria } from "@/modules/audit";
import { queryOne, queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { NotFoundError, ValidationError } from "@/platform/errors";
import {
  FILAS_BORRADO_MAXIMO,
  FILAS_EXPORT_MAXIMO,
  MASCARA,
  citar,
  esColumnaOculta,
  esTablaSensible,
  identificadorValido,
  motivoSensible,
  tamanoPagina,
} from "../domain/tablas";

/**
 * Explorador de la base: listar tablas, leer filas y escribirlas.
 *
 * Los VALORES viajan siempre parametrizados. Los IDENTIFICADORES no pueden
 * (PostgreSQL no los admite como parámetro), así que se cotejan contra
 * `information_schema` ANTES de entrar entre comillas: una tabla o columna que
 * no exista no llega nunca al SQL. Esa comprobación vive aquí, y el SQL se
 * arma solo en esta capa — no hay repositorio aparte al que alguien pueda
 * llamar saltándose la validación.
 */

export interface ColumnaInfo {
  nombre: string;
  tipo: string;
  nullable: boolean;
  porDefecto: string | null;
  esPk: boolean;
  /** Credencial: no se lee ni se escribe (ver `esColumnaOculta`). */
  oculta: boolean;
  editable: boolean;
}

export interface TablaInfo {
  nombre: string;
  /** Prefijo de módulo (`catalog`, `identity`…): agrupa la lista. */
  modulo: string;
  /** Estimación barata del planificador; no cuenta filas de verdad. */
  filasAprox: number;
  sensible: boolean;
}

export interface EsquemaTabla {
  tabla: string;
  columnas: ColumnaInfo[];
  /** Clave primaria de UNA columna; sin ella no se puede editar por fila. */
  pk: string | null;
  sensible: boolean;
  motivo: string | null;
}

export interface PaginaFilas {
  filas: Record<string, unknown>[];
  total: number;
  pagina: number;
  tamano: number;
}

/** Tablas del esquema `public`, con su tamaño aproximado. */
export async function listarTablas(): Promise<TablaInfo[]> {
  const filas = await queryRows<{ nombre: string; filas: string }>(
    `SELECT c.relname AS nombre, c.reltuples::bigint::text AS filas
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname`,
  );
  return filas.map((f) => ({
    nombre: f.nombre,
    modulo: f.nombre.startsWith("_") ? "sistema" : (f.nombre.split("_")[0] ?? "otros"),
    filasAprox: Math.max(Number(f.filas), 0),
    sensible: esTablaSensible(f.nombre),
  }));
}

/** Existe y es una tabla del esquema `public`. Lanza si no. */
async function exigirTabla(tabla: string): Promise<void> {
  if (!identificadorValido(tabla)) throw new ValidationError(`Tabla inválida: ${tabla}.`);
  const fila = await queryOne<{ n: number }>(
    `SELECT 1 AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = $1`,
    [tabla],
  );
  if (fila === null) throw new NotFoundError(`No existe la tabla ${tabla}.`);
}

export async function esquemaTabla(tabla: string): Promise<EsquemaTabla> {
  await exigirTabla(tabla);
  const filas = await queryRows<{
    nombre: string;
    tipo: string;
    nullable: string;
    porDefecto: string | null;
    esPk: boolean;
  }>(
    `SELECT c.column_name AS nombre,
            CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name ELSE c.data_type END AS tipo,
            c.is_nullable AS nullable,
            c.column_default AS "porDefecto",
            (pk.column_name IS NOT NULL) AS "esPk"
       FROM information_schema.columns c
       LEFT JOIN (
         SELECT kcu.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_name = tc.constraint_name
            AND kcu.table_schema = tc.table_schema
          WHERE tc.table_schema = 'public' AND tc.table_name = $1
            AND tc.constraint_type = 'PRIMARY KEY'
       ) pk ON pk.column_name = c.column_name
      WHERE c.table_schema = 'public' AND c.table_name = $1
      ORDER BY c.ordinal_position`,
    [tabla],
  );

  const pks = filas.filter((f) => f.esPk).map((f) => f.nombre);
  const columnas: ColumnaInfo[] = filas.map((f) => {
    const oculta = esColumnaOculta(tabla, f.nombre);
    return {
      nombre: f.nombre,
      tipo: f.tipo,
      nullable: f.nullable === "YES",
      porDefecto: f.porDefecto,
      esPk: f.esPk,
      oculta,
      // La PK no se edita: cambiarla rompe lo que apunte a ella. Para eso se
      // borra la fila y se inserta otra, que además queda auditado como tal.
      editable: !oculta && !f.esPk,
    };
  });

  return {
    tabla,
    columnas,
    // Solo se edita por fila cuando hay UNA columna de clave primaria: con una
    // compuesta, un `WHERE` de una sola columna tocaría varias filas.
    pk: pks.length === 1 ? (pks[0] ?? null) : null,
    sensible: esTablaSensible(tabla),
    motivo: motivoSensible(tabla),
  };
}

/** Las columnas que SÍ se traen (las credenciales ni se seleccionan). */
function seleccion(esquema: EsquemaTabla): string {
  const visibles = esquema.columnas.filter((c) => !c.oculta).map((c) => citar(c.nombre));
  return visibles.length > 0 ? visibles.join(", ") : "1";
}

/** Rellena las ocultas con la máscara, para que la pantalla sepa que existen. */
function conMascara(fila: Record<string, unknown>, esquema: EsquemaTabla): Record<string, unknown> {
  const salida = { ...fila };
  for (const c of esquema.columnas) {
    if (c.oculta) salida[c.nombre] = MASCARA;
  }
  return salida;
}

export interface ConsultaFilas {
  tabla: string;
  pagina?: number;
  tamano?: number;
  /** Columna de orden; si no es válida, se usa la PK o la primera columna. */
  orden?: string;
  descendente?: boolean;
  /** Búsqueda libre: ILIKE sobre las columnas de texto visibles. */
  busqueda?: string;
  /** Filtros exactos por columna (`columna` → valor de texto). */
  filtros?: Record<string, string>;
}

/**
 * Lee una página de la tabla. Todo lo que el usuario escribe (búsqueda,
 * filtros) va parametrizado; lo que nombra columnas se valida contra el
 * esquema y lo que no exista se descarta.
 */
export async function leerFilas(consulta: ConsultaFilas): Promise<PaginaFilas> {
  const esquema = await esquemaTabla(consulta.tabla);
  const visibles = esquema.columnas.filter((c) => !c.oculta);
  const tabla = citar(consulta.tabla);
  const valores: unknown[] = [];
  const condiciones: string[] = [];

  for (const [columna, valor] of Object.entries(consulta.filtros ?? {})) {
    const col = visibles.find((c) => c.nombre === columna);
    if (col === undefined) continue; // columna desconocida: se ignora
    if (valor === "") continue;
    valores.push(valor);
    // `::text` para poder comparar cualquier tipo con lo que vino del formulario.
    condiciones.push(`${citar(columna)}::text = $${String(valores.length)}`);
  }

  const busqueda = consulta.busqueda?.trim() ?? "";
  if (busqueda !== "" && visibles.length > 0) {
    valores.push(`%${busqueda}%`);
    const i = String(valores.length);
    const o = visibles.map((c) => `${citar(c.nombre)}::text ILIKE $${i}`);
    condiciones.push(`(${o.join(" OR ")})`);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";
  const ordenPedido = consulta.orden ?? "";
  const orden =
    visibles.find((c) => c.nombre === ordenPedido)?.nombre ??
    esquema.pk ??
    visibles[0]?.nombre ??
    null;
  const dir = consulta.descendente === true ? "DESC" : "ASC";
  const tamano = tamanoPagina(consulta.tamano);
  const pagina = Math.max(Math.trunc(consulta.pagina ?? 1), 1);

  const total = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${tabla} ${where}`,
    valores,
  );

  const filas = await queryRows<Record<string, unknown>>(
    `SELECT ${seleccion(esquema)} FROM ${tabla} ${where}
      ${orden === null ? "" : `ORDER BY ${citar(orden)} ${dir} NULLS LAST`}
      LIMIT $${String(valores.length + 1)} OFFSET $${String(valores.length + 2)}`,
    [...valores, tamano, (pagina - 1) * tamano],
  );

  return {
    filas: filas.map((f) => conMascara(f, esquema)),
    total: total?.n ?? 0,
    pagina,
    tamano,
  };
}

/** Exporta lo que se está viendo (con los mismos filtros) como CSV. */
export async function exportarCsv(consulta: ConsultaFilas): Promise<string> {
  const pagina = await leerFilas({ ...consulta, pagina: 1, tamano: FILAS_EXPORT_MAXIMO });
  const esquema = await esquemaTabla(consulta.tabla);
  const columnas = esquema.columnas.map((c) => c.nombre);
  const celda = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const texto = v instanceof Date ? v.toISOString() : String(v);
    return `"${texto.replace(/"/g, '""')}"`;
  };
  // `;` y BOM: es lo que abre bien el Excel en español, como el resto del panel.
  const lineas = [columnas.join(";")];
  for (const fila of pagina.filas) {
    lineas.push(columnas.map((c) => celda(fila[c])).join(";"));
  }
  return `﻿${lineas.join("\r\n")}`;
}

/** La fila entera (sin credenciales), para el detalle y para auditar el antes. */
async function filaPorPk(
  esquema: EsquemaTabla,
  pk: string,
  id: unknown,
): Promise<Record<string, unknown> | null> {
  const fila = await queryOne<Record<string, unknown>>(
    `SELECT ${seleccion(esquema)} FROM ${citar(esquema.tabla)} WHERE ${citar(pk)}::text = $1`,
    [String(id)],
  );
  return fila;
}

function exigirConfirmacion(esquema: EsquemaTabla, confirmado: boolean): void {
  if (esquema.sensible && !confirmado) {
    throw new ValidationError(
      `${motivoSensible(esquema.tabla) ?? "Tabla sensible."} Confirma que quieres escribir igual.`,
    );
  }
}

function exigirPk(esquema: EsquemaTabla): string {
  if (esquema.pk === null) {
    throw new ValidationError(
      "Esta tabla no tiene una clave primaria de una sola columna: se puede mirar, pero no editar fila por fila.",
    );
  }
  return esquema.pk;
}

export interface CambioCelda {
  actorUserId: string;
  tabla: string;
  id: string;
  columna: string;
  valor: string | number | boolean | null;
  confirmado?: boolean;
  ip?: string | null;
}

/** Cambia UNA celda y deja en la auditoría el antes y el después. */
export async function actualizarCelda(input: CambioCelda): Promise<Record<string, unknown>> {
  const esquema = await esquemaTabla(input.tabla);
  const pk = exigirPk(esquema);
  exigirConfirmacion(esquema, input.confirmado === true);

  const col = esquema.columnas.find((c) => c.nombre === input.columna);
  if (col === undefined) throw new ValidationError(`No existe la columna ${input.columna}.`);
  if (col.oculta) throw new ValidationError("Esa columna guarda una credencial: no se edita aquí.");
  if (col.esPk) {
    throw new ValidationError(
      "La clave primaria no se edita: lo que apunte a esta fila quedaría colgando. Borra e inserta.",
    );
  }

  const antes = await filaPorPk(esquema, pk, input.id);
  if (antes === null) throw new NotFoundError("Esa fila ya no existe.");

  const fila = await queryOne<Record<string, unknown>>(
    `UPDATE ${citar(input.tabla)} SET ${citar(input.columna)} = $1
      WHERE ${citar(pk)}::text = $2
      RETURNING ${seleccion(esquema)}`,
    [input.valor, String(input.id)],
  );
  if (fila === null) throw new NotFoundError("Esa fila ya no existe.");

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "dbadmin.celda_actualizada",
    entidad: input.tabla,
    entidadId: String(input.id),
    payload: {
      columna: input.columna,
      antes: antes[input.columna] ?? null,
      despues: fila[input.columna] ?? null,
    },
    ip: input.ip ?? null,
  });
  return conMascara(fila, esquema);
}

export interface NuevaFila {
  actorUserId: string;
  tabla: string;
  valores: Record<string, string | number | boolean | null>;
  confirmado?: boolean;
  ip?: string | null;
}

/** Inserta una fila con las columnas que se hayan llenado. */
export async function insertarFila(input: NuevaFila): Promise<Record<string, unknown>> {
  const esquema = await esquemaTabla(input.tabla);
  exigirConfirmacion(esquema, input.confirmado === true);

  const columnas: string[] = [];
  const valores: unknown[] = [];
  for (const [nombre, valor] of Object.entries(input.valores)) {
    const col = esquema.columnas.find((c) => c.nombre === nombre);
    if (col === undefined) throw new ValidationError(`No existe la columna ${nombre}.`);
    if (col.oculta)
      throw new ValidationError("Esa columna guarda una credencial: no se llena aquí.");
    columnas.push(citar(nombre));
    valores.push(valor);
  }
  if (columnas.length === 0) throw new ValidationError("Llena al menos una columna.");

  const marcadores = valores.map((_, i) => `$${String(i + 1)}`).join(", ");
  const fila = await queryOne<Record<string, unknown>>(
    `INSERT INTO ${citar(input.tabla)} (${columnas.join(", ")}) VALUES (${marcadores})
      RETURNING ${seleccion(esquema)}`,
    valores,
  );
  if (fila === null) throw new ValidationError("No se pudo insertar la fila.");

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "dbadmin.fila_insertada",
    entidad: input.tabla,
    entidadId: esquema.pk === null ? null : String(fila[esquema.pk] ?? ""),
    payload: { columnas: Object.keys(input.valores) },
    ip: input.ip ?? null,
  });
  return conMascara(fila, esquema);
}

export interface BorradoFilas {
  actorUserId: string;
  tabla: string;
  ids: string[];
  confirmado?: boolean;
  ip?: string | null;
}

/** Borra filas por su clave primaria. Todas o ninguna. */
export async function borrarFilas(input: BorradoFilas): Promise<{ borradas: number }> {
  const esquema = await esquemaTabla(input.tabla);
  const pk = exigirPk(esquema);
  exigirConfirmacion(esquema, input.confirmado === true);
  if (input.ids.length === 0) throw new ValidationError("Elige al menos una fila.");
  if (input.ids.length > FILAS_BORRADO_MAXIMO) {
    throw new ValidationError(
      `No se pueden borrar más de ${String(FILAS_BORRADO_MAXIMO)} a la vez.`,
    );
  }

  // En una transacción: un borrado a medias por una clave foránea dejaría la
  // selección en un estado que nadie pidió.
  const borradas = await withTransaction(async (tx) => {
    const filas = await queryRows<{ id: string }>(
      `DELETE FROM ${citar(input.tabla)}
        WHERE ${citar(pk)}::text = ANY($1::text[])
        RETURNING ${citar(pk)}::text AS id`,
      [input.ids],
      tx,
    );
    return filas.length;
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "dbadmin.filas_borradas",
    entidad: input.tabla,
    entidadId: input.ids[0] ?? null,
    payload: { ids: input.ids, borradas },
    ip: input.ip ?? null,
  });
  return { borradas };
}
