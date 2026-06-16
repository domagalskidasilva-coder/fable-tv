import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/**
 * App-wide safety net: if any screen throws during render, show a recoverable
 * message instead of a blank window (the worst "it doesn't work" for users).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Surfaces in the webview console / dev logs without crashing the app.
    console.error("Fable TV — erro de interface:", error, info);
  }

  private reset = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "#0e0e10",
          color: "#f5f5f6",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div
            style={{
              margin: "0 auto 1.25rem",
              display: "grid",
              placeItems: "center",
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "#e8b65a",
              color: "#1a1305",
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            F
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 0.5rem" }}>
            Algo deu errado
          </h1>
          <p style={{ color: "#a6a6ad", lineHeight: 1.6, margin: "0 0 1.5rem", fontSize: 14 }}>
            A tela encontrou um erro inesperado. Você pode recarregar o aplicativo para continuar —
            seus perfis e configurações estão salvos.
          </p>
          <button
            onClick={this.reset}
            style={{
              cursor: "pointer",
              borderRadius: 12,
              border: "none",
              background: "#f5f5f6",
              color: "#0e0e10",
              fontWeight: 700,
              fontSize: 15,
              padding: "0.7rem 1.75rem",
            }}
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
