import { runInNewContext } from "node:vm";

/**
 * VOCES DEL LIBRO (2026-10-28): reglas puras.
 *
 * Los libros de diseño leen en voz alta con `speechSynthesis` y SOLO con la voz
 * "Microsoft Zira", que existe únicamente en Windows: en un iPad, un Android o
 * un Mac los botones "Escuchar" no sonaban. Ahora cada frase se genera UNA vez
 * con ElevenLabs (con la voz de quien la dice) y el libro la reproduce como MP3.
 *
 * El libro corre en una caja sin red (`connect-src 'none'`), así que no puede
 * llamar a ElevenLabs —y no debe: la clave quedaría dentro—. Los audios se
 * piden como los videos: por ruta relativa `audios/<clave>.mp3` contra la base
 * con token que el panel le entrega. La CLAVE sale del TEXTO, con la misma
 * función aquí y dentro del libro (`FUNCION_CLAVE_ES5`): el libro no necesita
 * saber nada más que la frase que quiere decir.
 *
 * Una frase que no tenga audio se dice con la voz en inglés del dispositivo
 * (cualquiera, no solo Zira): mejor eso que el silencio.
 */

/** Quién habla. GUIA es la narradora del libro (Emma). */
export const PERSONAJES_VOZ = ["GUIA", "SIMBA", "ROOKY", "DODO"] as const;
export type PersonajeVoz = (typeof PERSONAJES_VOZ)[number];

export function esPersonajeVoz(v: unknown): v is PersonajeVoz {
  return typeof v === "string" && (PERSONAJES_VOZ as readonly string[]).includes(v);
}

/**
 * La voz de ElevenLabs de cada personaje. Elegidas el 2026-10-28 en la
 * biblioteca de ElevenLabs (inglés americano, voces de personaje):
 *  - la guía, la que pidió el negocio;
 *  - Simba (la perrita): enérgica y aventurera;
 *  - Rooky: un niño alegre ("I am happy");
 *  - Dodo (el pájaro que canta): aguda y saltarina.
 * Cambiar una voz exige regenerar los audios de ese personaje.
 */
export const VOZ_PERSONAJE: Record<
  PersonajeVoz,
  { voiceId: string; voz: string; etiqueta: string; imagen: string }
> = {
  GUIA: {
    voiceId: "vGfq3y2g8QTWjuUhrNYc",
    voz: "Yuria – Expressive, Playful, Witty",
    etiqueta: "Guía (Emma)",
    imagen: "guide",
  },
  SIMBA: {
    voiceId: "iukn3a1vSSNFmdi5NZS4",
    voz: "Paula Paw – Energetic and Adventurous",
    etiqueta: "Simba",
    imagen: "simba",
  },
  ROOKY: {
    voiceId: "XjGYkUkzth8BPs29fmcV",
    voz: "Teddy Twinkle – Cute Cartoon",
    etiqueta: "Rooky",
    imagen: "rooky",
  },
  DODO: {
    voiceId: "VE5rsMNTeE1frCCSXNIC",
    voz: "Berty – Pitchy, Dynamic and Bouncy",
    etiqueta: "Dodo",
    imagen: "dodo",
  },
};

/** El `who` de cada página del libro de Junior → quién la dice. */
const QUIEN: Record<string, PersonajeVoz> = {
  guide: "GUIA",
  simba: "SIMBA",
  rooky: "ROOKY",
  dodo: "DODO",
};

/** Lo más largo que se manda a generar de una vez (una lectura entera cabe). */
export const LARGO_MAXIMO_FRASE = 1000;

/**
 * La clave del audio de una frase: FNV-1a de 32 bits dos veces (con dos
 * multiplicadores) sobre el texto normalizado → 16 hexadecimales. No es
 * criptográfica ni lo necesita: solo nombra el archivo de cada frase.
 *
 * Va escrita en ES5 porque corre DENTRO del libro, en cualquier navegador; la
 * versión del servidor (`claveVoz`) la ejecuta TAL CUAL, así las dos no pueden
 * separarse.
 */
export const FUNCION_CLAVE_ES5 = `function lgsClaveVoz(t){
t=String(t==null?"":t);try{t=t.normalize("NFC");}catch(e){}
t=t.replace(/\\s+/g," ").replace(/^ +| +$/g,"");
var a=0x811c9dc5,b=0x050c5d1f,i,c;
for(i=0;i<t.length;i++){c=t.charCodeAt(i);a^=c;a=Math.imul(a,16777619)>>>0;b^=c;b=Math.imul(b,2246822519)>>>0;}
return("0000000"+a.toString(16)).slice(-8)+("0000000"+b.toString(16)).slice(-8);}`;

const claveCompilada = runInNewContext(`(${FUNCION_CLAVE_ES5})`) as (t: string) => string;

/** La clave de una frase (la misma que calcula el libro). */
export function claveVoz(texto: string): string {
  return claveCompilada(texto);
}

/** El texto tal como se guarda y se manda a generar. */
export function normalizarFrase(texto: string): string {
  return texto.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** `audios/<clave>.mp3`: lo que pide el libro. */
export function nombreArchivoAudio(clave: string): string {
  return `${clave}.mp3`;
}

/** Inverso de `nombreArchivoAudio`; null si no es una clave válida. */
export function leerNombreArchivoAudio(nombre: string): string | null {
  const m = /^([0-9a-f]{16})\.mp3$/.exec(nombre);
  return m?.[1] ?? null;
}

export interface FraseLibro {
  texto: string;
  personaje: PersonajeVoz;
}

/**
 * Las frases que el libro manda a la voz, con quién las dice.
 *
 * Se leen de los DATOS del libro (el objeto `D` que traen los libros de diseño)
 * y de los `speak('…')` escritos a mano en su código. Dos formatos conocidos:
 *  - JUNIOR (`D.units` + `D.pages`): la historia de cada unidad entera y frase
 *    por frase (la escena la dice de a una), y de cada página la frase del
 *    personaje (`lead`, con la voz de `who`), el modelo "Say it!" y las
 *    tarjetas de vocabulario;
 *  - YOUNGSTER (`D.lessons`): vocabulario, diálogo (sin los nombres, como lo
 *    arma el libro), lectura y los audios de comprensión (`D.listening`).
 * Un texto repetido se genera una vez, con la voz de quien aparece primero (las
 * frases de los personajes van antes).
 *
 * `D` se evalúa en un contexto VACÍO y con tope de tiempo: es un literal de
 * datos, pero viene de un archivo subido.
 */
export function frasesDelLibro(html: string): FraseLibro[] {
  const frases: FraseLibro[] = [];
  const add = (texto: unknown, personaje: PersonajeVoz = "GUIA") => {
    if (typeof texto !== "string") return;
    const t = normalizarFrase(texto);
    if (t !== "" && t.length <= LARGO_MAXIMO_FRASE) frases.push({ texto: t, personaje });
  };
  const D = datosDelLibro(html) as Record<string, unknown> | null;

  const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const obj = (v: unknown): Record<string, unknown> =>
    typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};

  if (D !== null && Array.isArray(D["pages"])) {
    // JUNIOR: primero lo que dicen los personajes.
    for (const p of lista(D["pages"])) {
      const pagina = obj(p);
      add(pagina["lead"], QUIEN[String(pagina["who"])] ?? "GUIA");
    }
    for (const u of lista(D["units"])) {
      const intro = obj(u)["intro"];
      if (typeof intro !== "string") continue;
      add(intro);
      // La escena de la unidad la dice frase por frase (mismo corte que el libro).
      for (const linea of intro.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []) add(linea);
    }
    for (const p of lista(D["pages"])) {
      const pagina = obj(p);
      add(pagina["say"]);
      for (const c of lista(pagina["cards"])) add(lista(c)[1]);
    }
  }
  if (D !== null && Array.isArray(D["lessons"])) {
    for (const l of lista(D["lessons"])) {
      const leccion = obj(l);
      for (const v of lista(leccion["vocab"])) add(lista(v)[0]);
      add(
        lista(leccion["dialog"])
          .map((x) => String(x).split(": ").slice(1).join(": "))
          .join(" "),
      );
      add(leccion["reading"]);
    }
    for (const x of lista(D["listening"])) add(obj(x)["text"]);
  }
  // Las frases escritas a mano en el código: speak('Hello, explorer!').
  const literal = /\bspeak\(\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1\s*[,)]/g;
  for (const m of html.matchAll(literal)) {
    add((m[2] ?? "").replace(/\\(['"\\])/g, "$1"));
  }

  const vistas = new Set<string>();
  return frases.filter((f) => {
    const k = claveVoz(f.texto);
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

/** El objeto de datos `D` del libro, o null si no lo trae (o no se puede leer). */
function datosDelLibro(html: string): unknown {
  const inicio = html.search(/(?:const|let|var)\s+D\s*=\s*\{/);
  if (inicio < 0) return null;
  const desde = html.indexOf("{", inicio);
  // Recorre las llaves respetando las cadenas, hasta cerrar el objeto.
  let profundidad = 0;
  let comilla: string | null = null;
  let k = desde;
  for (; k < html.length; k++) {
    const c = html[k];
    if (comilla !== null) {
      if (c === "\\") k++;
      else if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") comilla = c;
    else if (c === "{") profundidad++;
    else if (c === "}" && --profundidad === 0) break;
  }
  if (profundidad !== 0) return null;
  try {
    return runInNewContext(`(${html.slice(desde, k + 1)})`, {}, { timeout: 2000 });
  } catch {
    return null;
  }
}

// —— Lo que corre DENTRO del libro ————————————————————————————————————————

/**
 * La VOZ dentro del libro. Corre en el puente (ver `libro-interactivo.ts`),
 * antes que el script del libro, con `voces` y `base` del `window.name`:
 *  - `voces.disponibles`: las claves que ya tienen audio;
 *  - `voces.intervenciones`: frases extra de los personajes por página.
 *
 * 1. Sustituye `speechSynthesis` y `SpeechSynthesisUtterance`. El libro sigue
 *    llamando a `speak(texto)` como siempre; si la frase tiene audio, suena el
 *    MP3 (`audios/<clave>.mp3`, que la `<base>` con token resuelve); si no, la
 *    voz en inglés del DISPOSITIVO. Para que el libro no se niegue a hablar,
 *    `getVoices()` le presenta una voz llamada "Microsoft Zira" (es lo único que
 *    los libros aceptan): el nombre es un disfraz, lo que suena es ElevenLabs.
 * 2. Intervenciones: al abrir una página (`openPage`, la función de los libros
 *    de Junior) muestra al personaje con su frase, bajo el título, y la dice.
 *    El dibujo sale del propio libro (`D.assets`): la caja no admite imágenes
 *    de fuera.
 */
export const PUENTE_VOZ = `(function(){
${FUNCION_CLAVE_ES5}
var V=voces||{},disp={},INT=[],i;
var ds=V.disponibles;if(ds&&ds.length){for(i=0;i<ds.length;i++){disp[String(ds[i])]=1;}}
if(V.intervenciones&&V.intervenciones.length){INT=V.intervenciones;}
var real=null,RealU=null;
try{real=window.speechSynthesis||null;RealU=window.SpeechSynthesisUtterance||null;}catch(e){}
var audio=null,oyentes={};
var ZIRA={name:"Microsoft Zira - English (United States)",lang:"en-US",localService:true,"default":true,voiceURI:"Microsoft Zira - English (United States)"};
function llamar(f,x){if(typeof f==="function"){try{f(x);}catch(e){}}}
function parar(){if(audio){var a=audio;audio=null;a.onended=null;a.onerror=null;try{a.pause();}catch(e){}}
if(real){try{real.cancel();}catch(e){}}S.speaking=false;}
function dispositivo(u){if(!real||!RealU){llamar(u.onend,{});return;}
var r=new RealU(u.text),vs=[],en=null,j;try{vs=real.getVoices()||[];}catch(e){}
for(j=0;j<vs.length;j++){if(/^en/i.test(vs[j].lang)){if(!en||vs[j].localService){en=vs[j];}}}
if(en){r.voice=en;r.lang=en.lang;}else{r.lang="en-US";}
r.rate=Number(u.rate)||1;r.onend=function(){S.speaking=false;llamar(u.onend,{});};
r.onerror=function(ev){S.speaking=false;llamar(u.onerror,ev);};S.speaking=true;real.speak(r);}
function decir(u){var c=lgsClaveVoz(u.text);
if(!base||!disp[c]){dispositivo(u);return;}
var a=new Audio("audios/"+c+".mp3");audio=a;S.speaking=true;
a.onended=function(){if(audio===a){audio=null;S.speaking=false;llamar(u.onend,{});}};
a.onerror=function(){if(audio===a){audio=null;dispositivo(u);}};
llamar(u.onstart,{});var p=a.play();
if(p&&typeof p["catch"]==="function"){p["catch"](function(){if(audio===a){audio=null;dispositivo(u);}});}}
var S={speaking:false,pending:false,paused:false,onvoiceschanged:null,
getVoices:function(){return[ZIRA];},
speak:function(u){parar();if(u){decir(u);}},
cancel:function(){parar();},
pause:function(){if(audio){try{audio.pause();}catch(e){}}else if(real){real.pause();}},
resume:function(){if(audio){try{audio.play();}catch(e){}}else if(real){real.resume();}},
addEventListener:function(t,f){(oyentes[t]=oyentes[t]||[]).push(f);
if(t==="voiceschanged"){setTimeout(function(){llamar(f,{});},0);}},
removeEventListener:function(t,f){var l=oyentes[t]||[],k=l.indexOf(f);if(k>=0){l.splice(k,1);}}};
function U(t){this.text=String(t==null?"":t);this.lang="en-US";this.voice=null;this.rate=1;this.pitch=1;this.volume=1;
this.onend=null;this.onerror=null;this.onstart=null;}
try{Object.defineProperty(window,"speechSynthesis",{value:S,configurable:true});}catch(e){}
try{Object.defineProperty(window,"SpeechSynthesisUtterance",{value:U,configurable:true,writable:true});}catch(e){}
function imagen(clave){try{if(typeof D!=="undefined"&&D&&D.assets&&D.assets[clave]){return D.assets[clave];}}catch(e){}return null;}
function mostrar(pagina){var h=document.querySelector(".content h2");if(!h){return;}
var viejo=document.getElementById("lgs-personajes");if(viejo){viejo.parentNode.removeChild(viejo);}
var lista=[],k;for(k=0;k<INT.length;k++){if(Number(INT[k].pagina)===pagina){lista.push(INT[k]);}}
if(!lista.length){return;}
var caja=document.createElement("div");caja.id="lgs-personajes";
caja.style.cssText="display:flex;flex-direction:column;gap:10px;margin:12px 0 16px";
for(k=0;k<lista.length;k++){(function(it){var f=document.createElement("div");
f.style.cssText="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:18px;background:#fff8e1;border:2px solid #ffd54f;box-shadow:0 2px 6px rgba(0,0,0,.08)";
var src=imagen(it.imagen);if(src){var im=document.createElement("img");im.src=src;im.alt=it.nombre;
im.style.cssText="width:64px;height:64px;object-fit:contain;flex:none";f.appendChild(im);}
var tx=document.createElement("div");tx.style.cssText="flex:1;font-size:17px;line-height:1.35";
var b=document.createElement("b");b.textContent=it.nombre+": ";tx.appendChild(b);
tx.appendChild(document.createTextNode(it.texto));f.appendChild(tx);
var bt=document.createElement("button");bt.type="button";bt.textContent="\\uD83D\\uDD0A";bt.title="Escuchar";
bt.style.cssText="flex:none;font-size:22px;border:none;background:#ffca28;border-radius:50%;width:44px;height:44px;cursor:pointer";
bt.onclick=function(){S.speak(new U(it.texto));};f.appendChild(bt);caja.appendChild(f);})(lista[k]);}
h.parentNode.insertBefore(caja,h.nextSibling);
S.speak(new U(lista[0].texto));}
if(INT.length){window.addEventListener("load",function(){try{var orig=window.openPage;if(typeof orig!=="function"){return;}
window.openPage=function(n){var r=orig.apply(this,arguments);try{mostrar(Number(n)+1);}catch(e){}return r;};}catch(e){}});}
})();`;
