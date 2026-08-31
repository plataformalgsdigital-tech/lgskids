import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2];
let php = readFileSync(f, "utf8");
const cambios = [
  // Las rutas por omisión pasan a WebP; el PNG del mismo nombre es el respaldo.
  [`'archivo' => 'assets/personajes/dodo.png',`, `'archivo' => 'assets/personajes/dodo',`],
  [`'archivo' => 'assets/personajes/perro.jpg',`, `'archivo' => 'assets/personajes/perro',`],
  [`'archivo' => 'assets/personajes/mapache.jpg',`, `'archivo' => 'assets/personajes/mapache',`],
  [`'archivo' => 'assets/personajes/guia.jpg',`, `'archivo' => 'assets/personajes/guia',`],
  // lgsk_pj_img devuelve el WebP como URL "oficial" del personaje.
  [`	return get_theme_mod( 'lgsk_pj_' . $clave . '_img', get_theme_file_uri( $pj[ $clave ]['archivo'] ) );`,
   `	return get_theme_mod( 'lgsk_pj_' . $clave . '_img', get_theme_file_uri( $pj[ $clave ]['archivo'] . '.webp' ) );`],
  [`			'default'           => get_theme_file_uri( $pj['archivo'] ),`,
   `			'default'           => get_theme_file_uri( $pj['archivo'] . '.webp' ),`],
];
let fallos = 0;
for (const [a, b] of cambios) {
  if (php.split(a).length - 1 !== 1) { console.error(`✘ no única: ${a.trim().slice(0, 60)}`); fallos++; continue; }
  php = php.replace(a, b);
}
if (fallos) process.exit(1);

// El renderizado de la figura pasa a <picture> (WebP + PNG) cuando se usa el arte del tema.
const viejo = `	$figura  = '<figure class="pj' . ( $libre ? ' libre' : '' ) . '" style="--c:' . esc_attr( $color ) . '">';
	$figura .= '<img src="' . esc_url( $url ) . '" width="' . (int) $w . '" height="' . (int) $h . '"';
	$figura .= ' alt="' . esc_attr( sprintf( '%s, personaje de LGS Kids', $nombre ) ) . '" loading="lazy" decoding="async">';
	$figura .= '<figcaption class="nombre">' . esc_html( $nombre ) . '</figcaption></figure>';`;
const nuevo = `	$pj      = lgsk_personajes();
	$propio  = isset( $pj[ $clave ] ) ? get_theme_file_uri( $pj[ $clave ]['archivo'] . '.webp' ) : '';
	$alt     = esc_attr( sprintf( '%s, personaje de LGS Kids', $nombre ) );
	$medidas = ' width="' . (int) $w . '" height="' . (int) $h . '"';

	$figura = '<figure class="pj' . ( $libre ? ' libre' : '' ) . '" style="--c:' . esc_attr( $color ) . '">';
	if ( $url === $propio ) {
		// Arte del tema: WebP con respaldo PNG para navegadores antiguos.
		$respaldo = get_theme_file_uri( $pj[ $clave ]['archivo'] . '.png' );
		$figura  .= '<picture><source type="image/webp" srcset="' . esc_url( $url ) . '">';
		$figura  .= '<img src="' . esc_url( $respaldo ) . '"' . $medidas . ' alt="' . $alt . '" loading="lazy" decoding="async"></picture>';
	} else {
		// Imagen subida desde WordPress: se usa tal cual.
		$figura .= '<img src="' . esc_url( $url ) . '"' . $medidas . ' alt="' . $alt . '" loading="lazy" decoding="async">';
	}
	$figura .= '<figcaption class="nombre">' . esc_html( $nombre ) . '</figcaption></figure>';`;
if (php.split(viejo).length - 1 !== 1) { console.error("✘ no encuentro el bloque de la figura"); process.exit(1); }
php = php.replace(viejo, nuevo);

writeFileSync(f, php, "utf8");
console.log("functions.php actualizado");
