import { readFileSync, writeFileSync } from "node:fs";

const archivo = process.argv[2];
let html = readFileSync(archivo, "utf8");

// Cada personaje mira hacia su globo: Coco y Rocky van a la derecha (su pico y
// su patita alzada apuntan a la izquierda); Sunny y Emma van a la izquierda.
const bandas = [
  {
    ancla: `    <div class="grid3">`,
    donde: "antes",
    php: `    <?php lgsk_pj_band( 'dodo', 'var(--cian)', 'der', true, 480, 505 ); ?>\n\n`,
  },
  {
    ancla: `    <p class="note">`,
    donde: "antes",
    php: `    <?php lgsk_pj_band( 'perro', 'var(--ambar)', 'izq', false, 560, 840 ); ?>\n\n`,
  },
  {
    ancla: `  </div>\n</section>\n\n<section id="edades">`,
    donde: "dentro",
    php: `    <?php lgsk_pj_band( 'mapache', 'var(--verde)', 'der', false, 560, 840 ); ?>\n`,
  },
  {
    ancla: `    <div class="aud">`,
    donde: "antes",
    php: `    <?php lgsk_pj_band( 'guia', 'var(--magenta)', 'izq', false, 560, 840 ); ?>\n\n`,
  },
];

let fallos = 0;
for (const b of bandas) {
  const n = html.split(b.ancla).length - 1;
  if (n !== 1) {
    console.error(`✘ ancla con ${n} coincidencias (esperaba 1): ${JSON.stringify(b.ancla.slice(0, 50))}`);
    fallos++;
    continue;
  }
  const reemplazo = b.donde === "antes" ? b.php + b.ancla : b.php + b.ancla;
  html = html.replace(b.ancla, reemplazo);
  console.log(`✔ insertada antes de ${JSON.stringify(b.ancla.split("\n").pop().trim().slice(0, 46))}`);
}
if (fallos) {
  console.error(`\nABORTADO: ${fallos} ancla(s) no resolvieron.`);
  process.exit(1);
}
writeFileSync(archivo, html, "utf8");
console.log(`\nfront-page.php actualizado (${html.length} bytes)`);
