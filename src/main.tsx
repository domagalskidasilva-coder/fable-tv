import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

async function bootstrap() {
  // In dev, when there is no real Tauri runtime (i.e. opened in a plain
  // browser for layout previews), install a fake backend with sample data.
  // This branch is dead code in production builds and is tree-shaken away.
  let mockMode = false;
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    const { installTauriMock } = await import("./dev/mock");
    installTauriMock();
    mockMode = true;
  }

  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
  // StrictMode's double-invoke interferes with GSAP intro animations
  // (elements can stay at opacity 0) during browser previews; skip it there.
  root.render(
    mockMode ? <App /> : (
      <React.StrictMode>
        <App />
      </React.StrictMode>
    ),
  );
}

bootstrap();
