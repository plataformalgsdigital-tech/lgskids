import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { PREFIJO_NOMBRE_LIBRO, PUENTE_ALMACEN } from "../domain/libro-interactivo";
import {
  claveVoz,
  frasesDelLibro,
  leerNombreArchivoAudio,
  nombreArchivoAudio,
} from "../domain/voz-libro";

describe("clave del audio de una frase", () => {
  it("es estable, de 16 hex, y no distingue espacios de más", () => {
    const k = claveVoz("Hello, explorer!");
    expect(k).toMatch(/^[0-9a-f]{16}$/);
    expect(claveVoz("  Hello,   explorer! ")).toBe(k);
    expect(claveVoz("Hello, explorer?")).not.toBe(k);
  });

  it("nombra el archivo y lo vuelve a leer", () => {
    const k = claveVoz("Blue");
    expect(leerNombreArchivoAudio(nombreArchivoAudio(k))).toBe(k);
    expect(leerNombreArchivoAudio("../x.mp3")).toBeNull();
    expect(leerNombreArchivoAudio(`${k}.wav`)).toBeNull();
  });
});

describe("frases del libro", () => {
  // Un libro mínimo con el formato de JUNIOR (D.units + D.pages) y una frase
  // escrita a mano en el código.
  const junior = `<script>const D={units:[{intro:"Hello! I am Rooky. Let’s go!"}],
    pages:[{u:0,who:"simba",lead:"I can color!",say:"I can color. My star is blue.",
      cards:[["🔴","Red","Rojo"],["🔵","Blue","Azul"]]},
      {u:0,who:"guide",lead:"Hello, explorer!",say:"Hello!",cards:[["👋","Hello!","Hola"]]}],
    assets:{simba:"data:image/webp;base64,AAAA"}};
    function x(){speak('Blue. Color the star blue.');speak(word)}</script>`;

  it("JUNIOR: la frase de la página con la voz de quien la dice, y lo demás con la guía", () => {
    const f = frasesDelLibro(junior);
    const de = (t: string) => f.find((x) => x.texto === t)?.personaje;
    expect(de("I can color!")).toBe("SIMBA");
    expect(de("Hello, explorer!")).toBe("GUIA");
    // La historia entera Y frase por frase (la escena la dice de a una).
    expect(de("Hello! I am Rooky. Let’s go!")).toBe("GUIA");
    expect(de("I am Rooky.")).toBe("GUIA");
    expect(de("Let’s go!")).toBe("GUIA");
    expect(de("Blue")).toBe("GUIA");
    expect(de("Blue. Color the star blue.")).toBe("GUIA");
    // "Hello!" aparece como modelo y como tarjeta: una sola vez.
    expect(f.filter((x) => x.texto === "Hello!")).toHaveLength(1);
    // Lo que no es texto fijo (`speak(word)`) no se inventa.
    expect(f.some((x) => x.texto === "word")).toBe(false);
  });

  it("YOUNGSTER: vocabulario, diálogo sin nombres, lectura y comprensión", () => {
    const youngster = `<script>const D={lessons:[{vocab:[["Hello!","Hola"]],
      dialog:["Alex: Hello! What’s your name?","Mia: My name is Mia."],
      reading:"My name is Alex."}],listening:[{text:"Hello, team!"}]};</script>`;
    const textos = frasesDelLibro(youngster).map((x) => x.texto);
    expect(textos).toEqual(
      expect.arrayContaining([
        "Hello!",
        "Hello! What’s your name? My name is Mia.",
        "My name is Alex.",
        "Hello, team!",
      ]),
    );
  });

  it("un HTML sin datos no rompe: solo lo escrito a mano", () => {
    expect(frasesDelLibro("<p>hola</p>")).toEqual([]);
    expect(frasesDelLibro("<script>const D={roto:</script>")).toEqual([]);
  });
});

/**
 * La voz DENTRO del libro, ejecutada sobre una ventana falsa: lo que importa es
 * lo que hace en el navegador del niño.
 */
describe("la voz dentro del libro", () => {
  function montar(
    voces: unknown,
    base: string | null = "/api/material/abc/t/1.f/",
    extraDocumento: Record<string, unknown> = {},
  ) {
    const audios: { src: string; play: () => Promise<void> }[] = [];
    const dichos: string[] = [];
    let alCargar: (() => void) | null = null;
    // El speechSynthesis REAL del dispositivo (el respaldo).
    const real = {
      getVoices: () => [{ name: "Samantha", lang: "en-US", localService: true }],
      speak: (u: { text: string; onend?: () => void }) => {
        dichos.push(u.text);
        u.onend?.();
      },
      cancel: () => undefined,
    };
    class RealU {
      text: string;
      voice: unknown = null;
      lang = "";
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(t: string) {
        this.text = t;
      }
    }
    class FakeAudio {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly src: string) {
        audios.push(this);
      }
      play() {
        return Promise.resolve();
      }
      pause() {}
    }
    const ventana: Record<string, unknown> = {
      name: `${PREFIJO_NOMBRE_LIBRO}${JSON.stringify({ v: 2, datos: {}, videos: base, voces })}`,
      speechSynthesis: real,
      SpeechSynthesisUtterance: RealU,
      addEventListener: (t: string, f: () => void) => {
        if (t === "load") alCargar = f;
      },
    };
    ventana["parent"] = ventana;
    const documento = {
      head: { firstChild: null, insertBefore: () => undefined },
      createElement: () => ({ href: "" }),
      ...extraDocumento,
    };
    runInNewContext(PUENTE_ALMACEN, {
      window: ventana,
      document: documento,
      Audio: FakeAudio,
      setTimeout: (f: () => void) => f(),
    });
    const S = ventana["speechSynthesis"] as {
      getVoices: () => { name: string; lang: string }[];
      speak: (u: unknown) => void;
    };
    const U = ventana["SpeechSynthesisUtterance"] as new (t: string) => { onend: () => void };
    return { ventana, S, U, audios, dichos, cargar: () => alCargar?.() };
  }

  it("el libro ve una voz «Microsoft Zira» (la única que acepta) y deja de quedarse mudo", () => {
    const { S } = montar(null);
    const [voz] = S.getVoices();
    expect(voz?.name).toMatch(/^Microsoft\s+Zira\b/);
    expect(voz?.lang).toBe("en-US");
  });

  it("una frase con audio suena como MP3 por su ruta relativa", () => {
    const { S, U, audios, dichos } = montar({ disponibles: [claveVoz("Hello, explorer!")] });
    S.speak(new U("Hello,  explorer!"));
    expect(audios.map((a) => a.src)).toEqual([`audios/${claveVoz("Hello, explorer!")}.mp3`]);
    expect(dichos).toEqual([]);
  });

  it("una frase SIN audio la dice la voz en inglés del dispositivo (no se queda callado)", () => {
    const { S, U, audios, dichos } = montar({ disponibles: [] });
    let terminó = false;
    const u = new U("Good night, Simba!");
    u.onend = () => {
      terminó = true;
    };
    S.speak(u);
    expect(audios).toEqual([]);
    expect(dichos).toEqual(["Good night, Simba!"]);
    expect(terminó).toBe(true); // la escena del libro encadena la siguiente frase
  });

  it("sin base con token no pide audios: no hay de dónde", () => {
    const { S, U, audios, dichos } = montar({ disponibles: [claveVoz("Hi")] }, null);
    S.speak(new U("Hi"));
    expect(audios).toEqual([]);
    expect(dichos).toEqual(["Hi"]);
  });

  it("al abrir una página con intervención, el personaje aparece y la dice", () => {
    const insertados: { id?: string }[] = [];
    const h2 = {
      nextSibling: null,
      parentNode: { insertBefore: (el: { id?: string }) => insertados.push(el) },
    };
    // `document` con lo justo para dibujar la burbuja bajo el título.
    const elemento = () => ({ style: {}, appendChild: () => undefined, id: "" });
    const frase = "Woof! Paint the star.";
    const { ventana, cargar, audios } = montar(
      {
        disponibles: [claveVoz(frase)],
        intervenciones: [{ pagina: 2, texto: frase, nombre: "Simba", imagen: "simba" }],
      },
      "/api/material/abc/t/1.f/",
      {
        querySelector: () => h2,
        getElementById: () => null,
        createElement: elemento,
        createTextNode: () => ({}),
      },
    );
    const abiertas: number[] = [];
    // `openPage` es la función del libro (índice desde 0: la "Página 2" es la 1).
    ventana["openPage"] = (i: number) => abiertas.push(i);
    cargar(); // el puente la envuelve cuando el libro terminó de cargar
    (ventana["openPage"] as (i: number) => void)(1);
    expect(abiertas).toEqual([1]); // la página del libro se abre igual
    expect(insertados.map((x) => x.id)).toEqual(["lgs-personajes"]);
    expect(audios.map((a) => a.src)).toEqual([`audios/${claveVoz(frase)}.mp3`]);

    // Una página sin intervención no dibuja nada.
    (ventana["openPage"] as (i: number) => void)(5);
    expect(insertados).toHaveLength(1);
  });
});
