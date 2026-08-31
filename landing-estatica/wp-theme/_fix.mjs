import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2];
let css = readFileSync(f, "utf8");
const pares = [
  [`  .pjband{display:flex; align-items:center; justify-content:center; gap:clamp(1rem,3vw,2.4rem); flex-wrap:wrap; margin-top:2.6rem;}`,
   `  .pjband{display:flex; align-items:center; justify-content:center; gap:clamp(1rem,3vw,2.4rem); flex-wrap:wrap; margin:2.6rem 0 2.4rem; position:relative; z-index:2;}`],
  [`  .pj{position:relative; flex:0 0 auto; width:clamp(8.5rem,20vw,12rem); margin:0;}`,
   `  .pj{position:relative; z-index:3; flex:0 0 auto; width:clamp(8.5rem,20vw,12rem); margin:0;}`],
  [`  .pj img{display:block; width:100%; height:auto; border-radius:1.4rem; background:#14101f;`,
   `  .pj img{display:block; width:100%; height:auto; aspect-ratio:3/4; object-fit:cover; object-position:50% 10%; border-radius:1.4rem; background:#14101f;`],
  [`  .pj.libre img{border:0; border-radius:0; background:none; animation-duration:6.8s;`,
   `  .pj.libre img{border:0; border-radius:0; background:none; animation-duration:6.8s; aspect-ratio:auto; object-fit:contain;`],
];
let fallos = 0;
for (const [a, b] of pares) {
  if (css.split(a).length - 1 !== 1) { console.error(`✘ no única: ${a.slice(0, 48)}…`); fallos++; continue; }
  css = css.replace(a, b);
  console.log(`✔ ${a.trim().split("{")[0]}`);
}
if (fallos) process.exit(1);
writeFileSync(f, css, "utf8");
console.log("style.css actualizado");
