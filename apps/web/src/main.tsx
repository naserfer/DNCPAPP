import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Las animaciones de entrada solo se activan si el navegador realmente está dibujando cuadros.
// En una pestaña en segundo plano o un visor que congela las animaciones, el contenido se muestra directo
// (antes podía quedar invisible, detenido en el primer cuadro).
const raiz = document.documentElement;
requestAnimationFrame(() => raiz.classList.add("anima"));
const vigia = setInterval(() => {
  let dibuja = false;
  requestAnimationFrame(() => { dibuja = true; });
  setTimeout(() => { if (!dibuja) { raiz.classList.remove("anima"); clearInterval(vigia); } }, 400);
}, 1000);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
