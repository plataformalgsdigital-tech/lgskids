/**
 * De la UNIDAD del catálogo a la PARADA del mapa.
 *
 * En `catalog_curso` la unidad es texto libre y trae de todo: "Unidad 0",
 * "Unidad 1", "Repaso 2", "Evaluacion 1", con erratas incluidas ("Evalucion 6").
 * El mapa de la isla, en cambio, tiene un número fijo de paradas.
 *
 * La isla tiene CINCO paradas: el **Welcome** (parada 0) y las unidades 1 a 4.
 * Así está dibujado el mapa nuevo —"Welcome", "1 All about me", "2 I can",
 * "3 How is the weather today", "4 Days of the week"— y así lo premia el libro:
 * el cuadernillo `UNIT 0-1` entrega DOS insignias, "Let's chat about me" al
 * cerrar el Welcome y "Let's explore" al cerrar la Unidad 1.
 *
 * Repasos y evaluaciones NO tienen parada. Lo que no mapea no se pierde: sigue
 * en su lección, solo que no se abre desde el mapa.
 */

/** La bienvenida de la isla. Es una parada de pleno derecho, con su insignia. */
export const PARADA_WELCOME = 0;

/** La unidad NUMERADA más alta que marca el mapa. El Welcome va aparte. */
export const UNIDADES_MAPA = 4;

/** Cuántas paradas tiene la isla: el Welcome más las unidades numeradas. */
export const PARADAS_MAPA = UNIDADES_MAPA + 1;

/** Todas las paradas en orden de recorrido: [0, 1, 2, 3, 4]. */
export const PARADAS: readonly number[] = Array.from({ length: PARADAS_MAPA }, (_, i) => i);

/** Una parada válida de la isla (0..4). */
export function paradaValida(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= PARADA_WELCOME && (n as number) <= UNIDADES_MAPA;
}

/**
 * Número de parada (0..4) de una unidad del catálogo, o null si no tiene.
 *
 * Tolera mayúsculas, espacios de más y acentos ("UNIDAD  2", "unidád 3"),
 * porque el texto entra por CSV escrito a mano.
 */
export function unidadMapa(texto: string | null | undefined): number | null {
  if (typeof texto !== "string") return null;
  const limpio = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
  const m = /^UNIDAD\s+(\d+)$/.exec(limpio);
  if (m === null) return null;
  const n = Number(m[1]);
  return paradaValida(n) ? n : null;
}

/** Etiqueta de la parada para la interfaz. La 0 no se llama "Unidad 0". */
export function etiquetaParada(n: number): string {
  return n === PARADA_WELCOME ? "Welcome" : `Unidad ${String(n)}`;
}

/**
 * El camino abierto hasta donde llegó la clase: el Welcome más TODAS las
 * unidades hasta la MÁS ALTA que se le abrió al niño.
 *
 * El curso avanza hacia adelante y no se vuelve atrás: un niño que va en la
 * Unidad 3 ya pasó por la 1 y la 2, y su material —el PDF y el cuaderno de
 * ejercicios de cada una— tiene que seguir a mano. Por eso lo abierto es un
 * RECORRIDO, no una lista suelta de casillas: basta con abrirle la unidad que
 * están trabajando para que tenga todo lo anterior.
 *
 * El Welcome va siempre, aunque no se haya abierto nada (es el punto de
 * partida, igual que en el libro).
 */
export function caminoAbierto(paradas: readonly number[]): number[] {
  const tope = paradas.reduce<number>(
    (max, p) => (paradaValida(p) && p > max ? p : max),
    PARADA_WELCOME,
  );
  return Array.from({ length: tope + 1 }, (_, i) => i);
}

/**
 * ¿Están abiertas TODAS las unidades numeradas del nivel (1..4)?
 *
 * Es la llave del material "completo": el libro de actividades entero se
 * habilita cuando el guía ya abrió el nivel completo. El Welcome no cuenta —
 * está abierto siempre, como en el libro.
 */
export function todasLasUnidades(paradas: readonly number[]): boolean {
  const abiertas = new Set(paradas);
  for (let u = PARADA_WELCOME + 1; u <= UNIDADES_MAPA; u += 1) {
    if (!abiertas.has(u)) return false;
  }
  return true;
}
