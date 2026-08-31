import { readFileSync, writeFileSync } from "node:fs";

const dir = process.argv[2];
let body = readFileSync(`${dir}/_body.html`, "utf8");

// [buscar, reemplazar] — cada uno DEBE aparecer exactamente una vez.
const reemplazos = [
  [
    `<a class="btn btn-app" href="https://lgskids.cl/" target="_blank" rel="noreferrer">🚀 Acceder a la plataforma</a>`,
    `<a class="btn btn-app" href="<?php echo esc_url( lgsk_opt( 'app_url' ) ); ?>" target="_blank" rel="noreferrer"><?php echo esc_html( lgsk_opt( 'app_label' ) ); ?></a>`,
  ],
  [
    `<span class="eyebrow">Inglés en vivo · niños de 6 a 13 años</span>`,
    `<span class="eyebrow"><?php echo esc_html( lgsk_opt( 'hero_eyebrow' ) ); ?></span>`,
  ],
  [
    `<h1 class="title">Aprender inglés se siente como <span class="c1">jugar</span> y avanzar de <span class="c2">nivel</span>.</h1>`,
    `<h1 class="title"><?php echo wp_kses_post( lgsk_opt( 'hero_title' ) ); ?></h1>`,
  ],
  [
    `<p class="lead">Clases online en vivo, en grupos pequeños con su propio guía. Cada niño avanza de Rookie a Legendary ganando medallas por lo que realmente aprende.</p>`,
    `<p class="lead"><?php echo wp_kses_post( lgsk_opt( 'hero_lead' ) ); ?></p>`,
  ],
  [
    `<a class="btn btn-primary" href="#inscribir">¡Comienza hoy!</a>`,
    `<a class="btn btn-primary" href="#inscribir"><?php echo esc_html( lgsk_opt( 'hero_cta1' ) ); ?></a>`,
  ],
  [
    `<a class="btn btn-ghost" href="#programa">Conoce el método</a>`,
    `<a class="btn btn-ghost" href="#programa"><?php echo esc_html( lgsk_opt( 'hero_cta2' ) ); ?></a>`,
  ],
  [
    `<h2>Comienza hoy el programa de inglés de tu hijo</h2>`,
    `<h2><?php echo esc_html( lgsk_opt( 'cta_title' ) ); ?></h2>`,
  ],
  [
    `<p>Te ayudamos a encontrar el plan y el horario ideal según su edad y su nivel. Sin complicaciones.</p>`,
    `<p><?php echo wp_kses_post( lgsk_opt( 'cta_text' ) ); ?></p>`,
  ],
  [
    `<a class="btn btn-primary" href="https://wa.me/56940852708" target="_blank" rel="noreferrer">Hablar con LGS Kids</a>`,
    `<a class="btn btn-primary" href="<?php echo esc_url( lgsk_wa_url() ); ?>" target="_blank" rel="noreferrer"><?php echo esc_html( lgsk_opt( 'cta_button' ) ); ?></a>`,
  ],
  [
    `<div class="phone">📞 +56 9 4085 2708</div>`,
    `<div class="phone">📞 <?php echo esc_html( lgsk_opt( 'phone_display' ) ); ?></div>`,
  ],
  [
    `<div class="loc">1 Oriente 946-A · Viña del Mar, Chile</div>`,
    `<div class="loc"><?php echo esc_html( lgsk_opt( 'address' ) ); ?></div>`,
  ],
];

let errores = 0;
for (const [buscar, poner] of reemplazos) {
  const n = body.split(buscar).length - 1;
  if (n !== 1) {
    console.error(`✘ ${n} coincidencias (esperaba 1): ${buscar.slice(0, 70)}…`);
    errores++;
    continue;
  }
  body = body.replace(buscar, poner);
  console.log(`✔ ${buscar.slice(0, 66)}…`);
}
if (errores) {
  console.error(`\nABORTADO: ${errores} reemplazo(s) fallaron.`);
  process.exit(1);
}

const cabecera = `<?php
/**
 * Portada de LGS Kids. Los textos marcados con lgsk_opt() se editan en
 * Apariencia › Personalizar › LGS Kids.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
get_header();
?>
`;
writeFileSync(`${dir}/lgs-kids-landing/front-page.php`, cabecera + body + `\n<?php get_footer(); ?>\n`, "utf8");
console.log(`\nfront-page.php escrito (${(cabecera + body).length} bytes)`);
