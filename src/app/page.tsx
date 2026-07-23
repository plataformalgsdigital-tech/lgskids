export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
      }}
    >
      <h1 style={{ color: "var(--lgs-azul)", fontSize: "2.5rem" }}>
        LGS <span style={{ color: "var(--lgs-magenta)" }}>Kids</span>
      </h1>
      <p style={{ color: "var(--texto-suave)" }}>Plataforma en construcción — Fase 2: cimientos.</p>
    </main>
  );
}
