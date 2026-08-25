"use client";

// Root-level boundary: fires when the root layout itself (providers, fonts)
// fails to render. Next replaces the whole document — this component must
// render its own <html>/<body> and cannot rely on globals.css, providers, or
// context (useAuth is unavailable here), so styles are inline.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#1f2937",
          backgroundColor: "#fafafa",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "#6b7280",
            }}
          >
            Error
          </span>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em" }}>
            Application error
          </h1>
          <p style={{ margin: 0, maxWidth: 420, color: "#6b7280", fontSize: 14, lineHeight: 1.6 }}>
            The app failed to start. Your data is safe — reloading usually fixes it. If it keeps
            happening, contact your administrator.
          </p>
          <p
            style={{
              margin: "8px auto 0",
              maxWidth: 420,
              wordBreak: "break-word",
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              color: "#6b7280",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            {error.message || "Unknown error"}
            {error.digest && <span style={{ opacity: 0.7 }}> · {error.digest}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          style={{
            height: 44,
            padding: "0 20px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            backgroundColor: "#ffffff",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
