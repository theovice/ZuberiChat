import { StrictMode, Component, type ReactNode, type ErrorInfo } from "react";
import { createRoot } from "react-dom/client";
import { isTauri, installBrowserMocks } from "./lib/platform";
import App from "./App";
import "./globals.css";

// ── Install browser mocks before any component mounts ──
if (!isTauri()) {
  installBrowserMocks();
  // eslint-disable-next-line no-console
  console.info("[Zuberi] Running in browser preview mode");
}

// ── ErrorBoundary: prevent white screen on crash ──
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[Zuberi] Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 32,
            color: "#c03030",
            background: "#0e0d0c",
            fontFamily: "system-ui, sans-serif",
            height: "100vh",
          }}
        >
          <h2 style={{ color: "#f0a020" }}>Zuberi encountered an error</h2>
          <pre
            style={{
              color: "#eae9e9",
              fontSize: 12,
              whiteSpace: "pre-wrap",
              marginTop: 16,
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 16,
              padding: "6px 16px",
              background: "#3a3938",
              color: "#f0a020",
              border: "1px solid #4a4947",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
