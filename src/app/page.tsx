"use client";

import { useEffect, useState, type CSSProperties } from "react";
import "./landing.css";

/**
 * Landing pública de LGS Kids — página raíz "/" del dominio.
 * Ruta Next delgada (sin reglas de negocio, ADR/monolito): solo presentación.
 * Estilos aislados en landing.css bajo el prefijo `.lgs-landing`.
 * La app (login/panel) vive en /login y /panel.
 */

const feats = [
  {
    c: "c-verde",
    ic: "✦",
    h: "Grupos reducidos",
    p: "De 1 a 9 niños por sesión: cada uno participa, habla y recibe atención de su guía.",
  },
  {
    c: "c-cian",
    ic: "▲",
    h: "Guías en vivo",
    p: "No videos grabados: un guía acompaña cada salón en clases en vivo, con energía y cercanía.",
  },
  {
    c: "c-magenta",
    ic: "●",
    h: "Progresa por lo que aprende",
    p: "El niño avanza al completar sus lecciones y su Level Up — no por solo asistir. Aprendizaje real.",
  },
  {
    c: "c-ambar",
    ic: "◆",
    h: "Juego y recompensas",
    p: "Canciones, videos, juegos y un sistema de medallas que mantiene viva la motivación.",
  },
  {
    c: "c-azul",
    ic: "■",
    h: "Situaciones reales",
    p: "Actividades de la vida cotidiana para que el inglés sirva de verdad, no solo en el cuaderno.",
  },
  {
    c: "c-purpura",
    ic: "✚",
    h: "Material 24/7 + clubs",
    p: "Plataforma siempre activa con material interactivo y talleres de refuerzo para practicar más.",
  },
];

const niveles = [
  {
    c: "c-verde",
    bg: "var(--verde)",
    lv: "Nivel 1",
    n: "Rookie",
    d: "Los primeros pasos con confianza",
  },
  {
    c: "c-cian",
    bg: "var(--cian)",
    lv: "Nivel 2",
    n: "Champion",
    d: "Frases y conversaciones simples",
  },
  {
    c: "c-ambar",
    bg: "var(--ambar)",
    lv: "Nivel 3",
    n: "Elite",
    d: "Fluidez y vocabulario amplio",
  },
  {
    c: "c-magenta",
    bg: "var(--magenta)",
    lv: "Nivel 4",
    n: "Legendary",
    d: "Comunicación con seguridad",
  },
];

const pasos = [
  {
    c: "c-azul",
    n: 1,
    h: "Se matricula en un salón",
    p: "Con horario fijo y su propio guía. Nada de andar reservando cada semana.",
  },
  {
    c: "c-cian",
    n: 2,
    h: "Asiste a sus sesiones en vivo",
    p: "Dos sesiones por semana de una hora, en un grupo pequeño y estable.",
  },
  {
    c: "c-verde",
    n: 3,
    h: "Practica y refuerza",
    p: "Material interactivo 24/7 y un club de refuerzo los fines de semana.",
  },
  {
    c: "c-magenta",
    n: 4,
    h: "Avanza y celebra",
    p: "Completa lecciones, aprueba su Level Up y suma medallas hacia su diploma.",
  },
];

export default function LandingPage() {
  const [tema, setTema] = useState<"" | "dark" | "light">("");

  useEffect(() => {
    const path = document.getElementById("path");
    if (path === null) return;
    const nodos = path.querySelectorAll(".node");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            nodos.forEach((n, i) => setTimeout(() => n.classList.add("in"), i * 160));
            io.disconnect();
          }
        });
      },
      { threshold: 0.3 },
    );
    io.observe(path);
    return () => io.disconnect();
  }, []);

  function toggleTema() {
    setTema((t) =>
      t === "dark"
        ? "light"
        : t === "light"
          ? "dark"
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "light"
            : "dark",
    );
  }

  const tagAzul: CSSProperties = {
    background: "color-mix(in srgb, var(--azul) 16%, transparent)",
    color: "var(--azul)",
  };

  return (
    <div className={`lgs-landing ${tema}`}>
      <nav className="nav">
        <div className="wrap row">
          <span className="brand">
            <span className="mk">LK</span>LGS <b>Kids</b>
          </span>
          <span className="links">
            <a href="#programa">Programa</a>
            <a href="#viaje">Niveles</a>
            <a href="#clases">Cómo funciona</a>
            <a href="#edades">Edades</a>
          </span>
          <a className="btn btn-app" href="https://lgskids.cl/" target="_blank" rel="noreferrer">
            🚀 Acceder a la plataforma
          </a>
          <button className="themebtn" onClick={toggleTema} aria-label="Cambiar tema" type="button">
            ◐
          </button>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap hero-grid">
          <div>
            <span className="eyebrow">Inglés en vivo · niños de 6 a 13 años</span>
            <h1 className="title">
              Aprender inglés se siente como <span className="t1">jugar</span> y avanzar de{" "}
              <span className="t2">nivel</span>.
            </h1>
            <p className="lead">
              Clases online en vivo, en grupos pequeños con su propio guía. Cada niño avanza de
              Rookie a Legendary ganando medallas por lo que realmente aprende.
            </p>
            <div className="cta-row">
              <a className="btn btn-primary" href="#inscribir">
                ¡Comienza hoy!
              </a>
              <a className="btn btn-ghost" href="#programa">
                Conoce el método
              </a>
            </div>
            <div className="chips">
              <span className="chip">
                <span className="d" style={{ background: "var(--verde)" }} />2 sesiones por semana
              </span>
              <span className="chip">
                <span className="d" style={{ background: "var(--cian)" }} />
                Grupos de 1 a 9 niños
              </span>
              <span className="chip">
                <span className="d" style={{ background: "var(--magenta)" }} />
                Clases en vivo
              </span>
              <span className="chip">
                <span className="d" style={{ background: "var(--ambar)" }} />
                Plataforma 24/7
              </span>
            </div>
          </div>

          <div className="hero-card">
            <span
              className="float"
              style={{ background: "var(--magenta)", top: "-.6rem", left: "1rem" }}
            >
              Hello!
            </span>
            <span
              className="float"
              style={{
                background: "var(--cian)",
                top: "2.5rem",
                right: "-.5rem",
                animationDelay: "1.2s",
              }}
            >
              Let&apos;s play
            </span>
            <span
              className="float"
              style={{
                background: "var(--verde)",
                bottom: "-.6rem",
                right: "2.5rem",
                animationDelay: "2.4s",
              }}
            >
              Well done!
            </span>
            <h3>El avance de Sofía</h3>
            <div className="beadline">
              <div className="bead">
                <span className="b" style={{ background: "var(--verde)" }}>
                  R
                </span>
                <small>Rookie</small>
              </div>
              <div className="bead">
                <span className="b" style={{ background: "var(--cian)" }}>
                  C
                </span>
                <small>Champion</small>
              </div>
              <div className="bead">
                <span className="b" style={{ background: "var(--ambar)" }}>
                  E
                </span>
                <small>Elite</small>
              </div>
              <div className="bead">
                <span className="b" style={{ background: "var(--line)", color: "var(--muted)" }}>
                  L
                </span>
                <small>Legend</small>
              </div>
            </div>
            <div className="barwrap">
              <div className="bar" />
            </div>
            <div className="foot">
              <span>🏅 2 medallas ganadas</span>
              <span>Nivel Elite</span>
            </div>
          </div>
        </div>
      </header>

      <section className="sec" id="programa">
        <div className="wrap">
          <div className="shead">
            <span className="eyebrow">Por qué funciona</span>
            <h2>Un método pensado para que los niños hablen, no solo estudien</h2>
            <p>
              Diseñado especialmente para niños y pre-adolescentes: dinámico, divertido y con
              acompañamiento real.
            </p>
          </div>
          <div className="grid3">
            {feats.map((f) => (
              <div key={f.h} className={`feat ${f.c}`}>
                <div className="ic">{f.ic}</div>
                <h3>{f.h}</h3>
                <p>{f.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec journey" id="viaje">
        <div className="wrap">
          <div className="shead">
            <span className="eyebrow">El viaje del aprendizaje</span>
            <h2>Cuatro niveles, un montón de medallas y un diploma final</h2>
            <p>
              Cada nivel se completa con sus lecciones y su Level Up. Al terminarlo, el niño gana su
              medalla.
            </p>
          </div>
          <div className="path" id="path">
            {niveles.map((n) => (
              <div key={n.n} className={`node ${n.c}`}>
                <span className="lv">{n.lv}</span>
                <div className="medal" style={{ background: n.bg }}>
                  🏅
                </div>
                <h3>{n.n}</h3>
                <small>{n.d}</small>
              </div>
            ))}
            <div className="node diploma c-ambar">
              <span className="lv">Meta</span>
              <div className="medal">🎓</div>
              <h3>Diploma</h3>
              <small>¡Curso completado!</small>
            </div>
          </div>
          <p className="note">
            Al terminar Junior, el niño puede continuar en <b>Youngster</b>; y al completar
            Youngster, dar el salto a <b>LGS para adultos</b>. Un camino que crece con ellos.
          </p>
        </div>
      </section>

      <section className="sec" id="clases">
        <div className="wrap">
          <div className="shead">
            <span className="eyebrow">Cómo funciona</span>
            <h2>Un ritmo constante, sin que tengas que agendar nada</h2>
          </div>
          <div className="how">
            <div className="steps">
              {pasos.map((s) => (
                <div key={s.n} className={`step ${s.c}`}>
                  <span className="n">{s.n}</span>
                  <div>
                    <h3>{s.h}</h3>
                    <p>{s.p}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="weekcard">
              <h3>Una semana en LGS Kids</h3>
              <div className="wk">
                <span style={{ color: "var(--azul)", fontWeight: 900 }}>Mar</span> Sesión en vivo
                <span className="tag" style={tagAzul}>
                  1 h
                </span>
              </div>
              <div className="wk">
                <span style={{ color: "var(--azul)", fontWeight: 900 }}>Jue</span> Sesión en vivo
                <span className="tag" style={tagAzul}>
                  1 h
                </span>
              </div>
              <div className="wk">
                <span style={{ color: "var(--ambar)", fontWeight: 900 }}>Sáb</span> Club de refuerzo
                <span
                  className="tag"
                  style={{
                    background: "color-mix(in srgb, var(--ambar) 20%, transparent)",
                    color: "var(--ambar)",
                  }}
                >
                  Opcional
                </span>
              </div>
              <div className="wk">
                <span style={{ color: "var(--verde)", fontWeight: 900 }}>7d</span> Plataforma y
                juegos
                <span
                  className="tag"
                  style={{
                    background: "color-mix(in srgb, var(--verde) 18%, transparent)",
                    color: "var(--verde)",
                  }}
                >
                  24/7
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" id="edades">
        <div className="wrap">
          <div className="shead">
            <span className="eyebrow">Para cada edad, su mundo</span>
            <h2>Junior y Youngster</h2>
            <p>
              El programa se adapta a la etapa del niño, con contenidos y dinámicas a su medida.
            </p>
          </div>
          <div className="aud">
            <div className="audc j">
              <div className="age">6–9</div>
              <h3>Junior</h3>
              <p>
                Descubrir el inglés jugando: canciones, personajes y juegos que despiertan el gusto
                por aprender desde pequeños.
              </p>
            </div>
            <div className="audc y">
              <div className="age">10–13</div>
              <h3>Youngster</h3>
              <p>
                Más autonomía y conversación: situaciones reales, retos y proyectos que preparan
                para comunicarse con seguridad.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="trust wrap">
        <p>Un programa avalado por</p>
        <div className="lg">LetsGoSpeak</div>
      </div>

      <section className="sec cta" id="inscribir">
        <div className="wrap">
          <div className="ctabox">
            <h2>Comienza hoy el programa de inglés de tu hijo</h2>
            <p>
              Te ayudamos a encontrar el plan y el horario ideal según su edad y su nivel. Sin
              complicaciones.
            </p>
            <a
              className="btn btn-primary"
              href="https://wa.me/56940852708"
              target="_blank"
              rel="noreferrer"
            >
              Hablar con LGS Kids
            </a>
            <div className="phone">📞 +56 9 4085 2708</div>
            <div className="loc">1 Oriente 946-A · Viña del Mar, Chile</div>
          </div>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap">
          LGS Kids · Curso de inglés online para niños de 6 a 13 años · avalado por LetsGoSpeak ·{" "}
          <a href="/login">Ingresar a la plataforma</a>
        </div>
      </footer>
    </div>
  );
}
