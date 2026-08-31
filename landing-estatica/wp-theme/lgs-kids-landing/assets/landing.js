  // Revelar los niveles del viaje al hacer scroll, en secuencia.
  const nodes = document.querySelectorAll("#path .node");
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        nodes.forEach((n, i) => setTimeout(() => n.classList.add("in"), i * 160));
        io.disconnect();
      }
    });
  }, { threshold: 0.3 });
  if (nodes[0]) io.observe(document.getElementById("path"));

  // Tema
  const root = document.documentElement;
  document.getElementById("theme").addEventListener("click", () => {
    const cur = root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    root.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
  });
