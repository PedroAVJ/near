import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getRuntimeConfig } from "./api";
import { initializeTelemetry } from "./analytics";
import { App } from "./App";
import "./styles.css";

async function start() {
  try {
    await initializeTelemetry(await getRuntimeConfig());
  } catch {
    // Telemetry configuration must never block the private app.
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
  }
}

void start();
