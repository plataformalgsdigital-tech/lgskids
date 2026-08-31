import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2];
const css = readFileSync(f, "utf8");
const marca = "  /* ── Personajes ";
const i = css.indexOf(marca);
if (i < 0) { console.error("✘ no encuentro el bloque de personajes"); process.exit(1); }

const nuevo = `  /* ── Personajes ─────────────────────────────────────────────────────────
     Los cuatro van recortados (PNG/WebP con transparencia) y de CUERPO ENTERO,
     sin marco. Se alinean por ALTURA, no por ancho: así Emma (figura alta y
     estrecha) y Simba (figura ancha y baja) se ven del mismo tamaño.         */
  .pjband{display:flex; align-items:flex-end; justify-content:center; gap:clamp(1rem,3vw,2.4rem);
          flex-wrap:wrap; margin:2.8rem 0 2.4rem; position:relative; z-index:2;}
  .pjband .pjtxt{flex:1 1 17rem; max-width:26rem; min-width:0; padding-bottom:1.4rem;}
  @media(max-width:760px){ .pjband{flex-direction:column; align-items:center; text-align:center;} .pjband .pjtxt{padding-bottom:0;} }

  .pj{position:relative; z-index:3; flex:0 0 auto; margin:0; line-height:0;}
  .pj img{display:block; height:clamp(9rem,21vw,14.5rem); width:auto; max-width:min(48vw,17rem); object-fit:contain;
          filter:drop-shadow(0 16px 18px rgba(40,20,90,.24));
          animation:pjflota 5.4s ease-in-out infinite;}
  .pj .nombre{position:absolute; left:50%; bottom:-.75rem; transform:translateX(-50%); line-height:1;
              background:var(--c,var(--azul)); color:#fff; font-weight:900; font-size:.78rem;
              padding:.34rem .85rem; border-radius:999px; white-space:nowrap; box-shadow:0 4px 12px rgba(40,20,90,.28);}
  .pj.libre img{animation-duration:6.8s;}

  .pjbubble{position:relative; display:inline-block; background:var(--surface); border:1px solid var(--line);
            border-radius:1.2rem; padding:1.05rem 1.3rem; box-shadow:var(--shadow);
            font-weight:900; font-size:clamp(1.05rem,2.2vw,1.3rem); line-height:1.3;}
  .pjbubble small{display:block; font-weight:600; color:var(--muted); font-size:.92rem; margin-top:.4rem; line-height:1.5;}
  .pjbubble::before,.pjbubble::after{content:""; position:absolute; top:2.1rem; width:0; height:0; border:.65rem solid transparent;}
  .pjbubble.izq::before{right:100%; border-right-color:var(--line);}
  .pjbubble.izq::after{right:100%; margin-right:-1px; border-right-color:var(--surface);}
  .pjbubble.der::before{left:100%; border-left-color:var(--line);}
  .pjbubble.der::after{left:100%; margin-left:-1px; border-left-color:var(--surface);}
  @media(max-width:760px){
    .pjbubble::before,.pjbubble::after{top:auto; bottom:100%; left:50%; right:auto; margin:0; transform:translateX(-50%); border-color:transparent;}
    .pjbubble::before{border-bottom-color:var(--line);}
    .pjbubble::after{margin-bottom:-1px; border-bottom-color:var(--surface);}
  }

  @keyframes pjflota{0%,100%{transform:translateY(0);} 50%{transform:translateY(-9px);}}
`;
writeFileSync(f, css.slice(0, i) + nuevo, "utf8");
console.log(`bloque de personajes reescrito · style.css = ${(css.slice(0, i) + nuevo).length} bytes`);
