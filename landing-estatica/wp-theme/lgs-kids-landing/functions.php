<?php
/**
 * LGS Kids Landing — funciones del tema.
 *
 * La portada es de alta fidelidad y vive en front-page.php. Lo que cambia
 * seguido (WhatsApp, enlace a la plataforma, titulares) se edita desde
 * Apariencia › Personalizar › LGS Kids, sin tocar código.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Valores por omisión: el texto original de la landing estática. */
function lgsk_defaults() {
	return array(
		'app_url'        => 'https://lgskids.cl/',
		'app_label'      => '🚀 Acceder a la plataforma',
		'wa_number'      => '56940852708',
		'phone_display'  => '+56 9 4085 2708',
		'address'        => '1 Oriente 946-A · Viña del Mar, Chile',
		'hero_eyebrow'   => 'Inglés en vivo · niños de 6 a 13 años',
		'hero_title'     => 'Aprender inglés se siente como <span class="c1">jugar</span> y avanzar de <span class="c2">nivel</span>.',
		'hero_lead'      => 'Clases online en vivo, en grupos pequeños con su propio guía. Cada niño avanza de Rookie a Legendary ganando medallas por lo que realmente aprende.',
		'hero_cta1'      => '¡Comienza hoy!',
		'hero_cta2'      => 'Conoce el método',
		'cta_title'      => 'Comienza hoy el programa de inglés de tu hijo',
		'cta_text'       => 'Te ayudamos a encontrar el plan y el horario ideal según su edad y su nivel. Sin complicaciones.',
		'cta_button'     => 'Hablar con LGS Kids',
		'footer_text'    => 'LGS Kids · Curso de inglés online para niños de 6 a 13 años · avalado por LetsGoSpeak',
		'meta_desc'      => 'LGS Kids — curso de inglés online en vivo para niños de 6 a 13 años. Método gamificado por niveles, guías en vivo y grupos pequeños.',
	);
}

/** Lee un ajuste del Customizer con su valor por omisión. */
function lgsk_opt( $key ) {
	$defaults = lgsk_defaults();
	$default  = isset( $defaults[ $key ] ) ? $defaults[ $key ] : '';
	return get_theme_mod( 'lgsk_' . $key, $default );
}

/** Enlace de WhatsApp armado desde el número configurado. */
function lgsk_wa_url() {
	$n = preg_replace( '/\D+/', '', (string) lgsk_opt( 'wa_number' ) );
	return 'https://wa.me/' . $n;
}

add_action( 'after_setup_theme', 'lgsk_setup' );
function lgsk_setup() {
	add_theme_support( 'title-tag' );
	add_theme_support( 'custom-logo' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'automatic-feed-links' );
	add_theme_support( 'html5', array( 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' ) );
	register_nav_menus( array( 'principal' => __( 'Menú principal', 'lgs-kids-landing' ) ) );
}

add_action( 'wp_enqueue_scripts', 'lgsk_assets' );
function lgsk_assets() {
	$v = wp_get_theme()->get( 'Version' );
	wp_enqueue_style( 'lgs-kids-landing', get_stylesheet_uri(), array(), $v );
	wp_enqueue_script( 'lgs-kids-landing', get_theme_file_uri( 'assets/landing.js' ), array(), $v, true );
}

/**
 * Ajustes editables. Una sección por bloque de la página para que se
 * encuentren rápido en Apariencia › Personalizar.
 */
add_action( 'customize_register', 'lgsk_customize' );
function lgsk_customize( $wp_customize ) {
	$d = lgsk_defaults();

	$wp_customize->add_panel( 'lgsk_panel', array(
		'title'       => 'LGS Kids',
		'description' => 'Textos y enlaces de la portada.',
		'priority'    => 20,
	) );

	$secciones = array(
		'lgsk_plataforma' => 'Plataforma y contacto',
		'lgsk_hero'       => 'Portada (encabezado)',
		'lgsk_cierre'     => 'Cierre y pie',
	);
	foreach ( $secciones as $id => $titulo ) {
		$wp_customize->add_section( $id, array( 'title' => $titulo, 'panel' => 'lgsk_panel' ) );
	}

	$campos = array(
		// clave           sección            etiqueta                               tipo control   saneado
		'app_url'       => array( 'lgsk_plataforma', 'Enlace a la plataforma',        'url',      'esc_url_raw' ),
		'app_label'     => array( 'lgsk_plataforma', 'Texto del botón de plataforma', 'text',     'sanitize_text_field' ),
		'wa_number'     => array( 'lgsk_plataforma', 'WhatsApp (solo dígitos, con país)', 'text', 'sanitize_text_field' ),
		'phone_display' => array( 'lgsk_plataforma', 'Teléfono visible',              'text',     'sanitize_text_field' ),
		'address'       => array( 'lgsk_plataforma', 'Dirección',                     'text',     'sanitize_text_field' ),
		'hero_eyebrow'  => array( 'lgsk_hero',       'Línea superior',                'text',     'sanitize_text_field' ),
		'hero_title'    => array( 'lgsk_hero',       'Titular (admite HTML)',         'textarea', 'wp_kses_post' ),
		'hero_lead'     => array( 'lgsk_hero',       'Bajada',                        'textarea', 'wp_kses_post' ),
		'hero_cta1'     => array( 'lgsk_hero',       'Botón principal',               'text',     'sanitize_text_field' ),
		'hero_cta2'     => array( 'lgsk_hero',       'Botón secundario',              'text',     'sanitize_text_field' ),
		'cta_title'     => array( 'lgsk_cierre',     'Título del cierre',             'text',     'sanitize_text_field' ),
		'cta_text'      => array( 'lgsk_cierre',     'Texto del cierre',              'textarea', 'wp_kses_post' ),
		'cta_button'    => array( 'lgsk_cierre',     'Botón del cierre',              'text',     'sanitize_text_field' ),
		'footer_text'   => array( 'lgsk_cierre',     'Pie de página',                 'text',     'sanitize_text_field' ),
		'meta_desc'     => array( 'lgsk_cierre',     'Descripción SEO (meta)',        'textarea', 'sanitize_text_field' ),
	);

	foreach ( $campos as $clave => $c ) {
		list( $seccion, $etiqueta, $tipo, $saneado ) = $c;
		$wp_customize->add_setting( 'lgsk_' . $clave, array(
			'default'           => isset( $d[ $clave ] ) ? $d[ $clave ] : '',
			'sanitize_callback' => $saneado,
			'transport'         => 'refresh',
		) );
		$wp_customize->add_control( 'lgsk_' . $clave, array(
			'label'   => $etiqueta,
			'section' => $seccion,
			'type'    => $tipo,
		) );
	}
}

/**
 * Personajes de la landing. Cada uno vive en una sección distinta con su
 * propio color, lado y frase. Imagen, nombre y textos son editables desde
 * Apariencia › Personalizar › LGS Kids › Personajes.
 */
function lgsk_personajes() {
	return array(
		'dodo'    => array(
			'archivo' => 'assets/personajes/dodo',
			'nombre'  => 'Coco',
			'frase'   => '¡Aquí nadie se queda callado!',
			'sub'     => 'Desde la primera sesión el niño habla, canta y participa en vivo.',
		),
		'perro'   => array(
			'archivo' => 'assets/personajes/perro',
			'nombre'  => 'Simba',
			'frase'   => '¡Vamos, nivel a nivel!',
			'sub'     => 'Cada medalla se gana completando las lecciones y el Level Up.',
		),
		'mapache' => array(
			'archivo' => 'assets/personajes/mapache',
			'nombre'  => 'Rocky',
			'frase'   => '¡Nos vemos el martes!',
			'sub'     => 'Mismo salón, mismo guía y el mismo horario cada semana.',
		),
		'guia'    => array(
			'archivo' => 'assets/personajes/guia',
			'nombre'  => 'Emma',
			'frase'   => '¿Junior o Youngster?',
			'sub'     => 'Te ayudo a elegir el mundo que le toca según su edad.',
		),
	);
}

/** URL de la imagen del personaje (la del tema, o la que se suba en WP). */
function lgsk_pj_img( $clave ) {
	$pj = lgsk_personajes();
	if ( ! isset( $pj[ $clave ] ) ) {
		return '';
	}
	return get_theme_mod( 'lgsk_pj_' . $clave . '_img', get_theme_file_uri( $pj[ $clave ]['archivo'] . '.webp' ) );
}

/** Texto del personaje: nombre, frase o sub. */
function lgsk_pj_txt( $clave, $campo ) {
	$pj = lgsk_personajes();
	if ( ! isset( $pj[ $clave ][ $campo ] ) ) {
		return '';
	}
	return get_theme_mod( 'lgsk_pj_' . $clave . '_' . $campo, $pj[ $clave ][ $campo ] );
}

/**
 * Dibuja la banda de un personaje.
 *
 * @param string $clave  dodo | perro | mapache | guia
 * @param string $color  color de acento (variable CSS del tema)
 * @param string $lado   'izq' = personaje a la izquierda; 'der' = a la derecha
 * @param bool   $libre  true si la imagen tiene transparencia (va sin marco)
 * @param int    $w      ancho intrínseco del archivo
 * @param int    $h      alto intrínseco del archivo
 */
function lgsk_pj_band( $clave, $color, $lado = 'izq', $libre = false, $w = 560, $h = 840 ) {
	$url = lgsk_pj_img( $clave );
	if ( ! $url ) {
		return;
	}
	$nombre = lgsk_pj_txt( $clave, 'nombre' );

	$pj      = lgsk_personajes();
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
	$figura .= '<figcaption class="nombre">' . esc_html( $nombre ) . '</figcaption></figure>';

	$globo  = '<div class="pjtxt"><p class="pjbubble ' . ( 'der' === $lado ? 'der' : 'izq' ) . '">';
	$globo .= esc_html( lgsk_pj_txt( $clave, 'frase' ) );
	$globo .= '<small>' . esc_html( lgsk_pj_txt( $clave, 'sub' ) ) . '</small></p></div>';

	echo '<div class="pjband">' . ( 'der' === $lado ? $globo . $figura : $figura . $globo ) . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
}

/** Controles de los personajes en el Personalizador. */
add_action( 'customize_register', 'lgsk_customize_personajes', 20 );
function lgsk_customize_personajes( $wp_customize ) {
	$wp_customize->add_section( 'lgsk_personajes', array(
		'title'       => 'Personajes',
		'panel'       => 'lgsk_panel',
		'description' => 'Cada personaje aparece en una sección distinta de la portada.',
	) );

	$etiquetas = array(
		'dodo'    => 'Coco (sección «Por qué funciona»)',
		'perro'   => 'Simba (sección «El viaje del aprendizaje»)',
		'mapache' => 'Rocky (sección «Cómo funciona»)',
		'guia'    => 'Emma (sección «Junior y Youngster»)',
	);

	foreach ( lgsk_personajes() as $clave => $pj ) {
		$titulo = isset( $etiquetas[ $clave ] ) ? $etiquetas[ $clave ] : $clave;

		$wp_customize->add_setting( 'lgsk_pj_' . $clave . '_img', array(
			'default'           => get_theme_file_uri( $pj['archivo'] . '.webp' ),
			'sanitize_callback' => 'esc_url_raw',
			'transport'         => 'refresh',
		) );
		$wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'lgsk_pj_' . $clave . '_img', array(
			'label'   => $titulo,
			'section' => 'lgsk_personajes',
		) ) );

		foreach ( array( 'nombre' => 'Nombre', 'frase' => 'Frase', 'sub' => 'Texto de apoyo' ) as $campo => $rotulo ) {
			$wp_customize->add_setting( 'lgsk_pj_' . $clave . '_' . $campo, array(
				'default'           => $pj[ $campo ],
				'sanitize_callback' => 'sanitize_text_field',
				'transport'         => 'refresh',
			) );
			$wp_customize->add_control( 'lgsk_pj_' . $clave . '_' . $campo, array(
				'label'   => $rotulo,
				'section' => 'lgsk_personajes',
				'type'    => 'sub' === $campo ? 'textarea' : 'text',
			) );
		}
	}
}
