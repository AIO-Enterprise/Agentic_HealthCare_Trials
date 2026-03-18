import React from "react";

/**
 * ErrorBoundary
 * Wraps the wizard card. Catches any render-time JS error in a child component
 * and shows a readable message instead of a blank page.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeStep ... />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(err) {
    return { hasError: true, message: err?.message || "An unexpected error occurred." };
  }

  componentDidCatch(err, info) {
    // Surface to console so devs can see the full trace
    console.error("[OnboardingErrorBoundary]", err, info);
  }

  reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        padding: "24px",
        borderRadius: "12px",
        border: "1px solid rgba(239,68,68,0.3)",
        backgroundColor: "rgba(239,68,68,0.06)",
        textAlign: "center",
      }}>
        <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#ef4444", marginBottom: "6px" }}>
          Something went wrong
        </p>
        <p style={{ fontSize: "0.8rem", color: "var(--color-sidebar-text)", marginBottom: "16px" }}>
          {this.state.message}
        </p>
        <button
          onClick={this.reset}
          style={{
            padding: "6px 16px", borderRadius: "6px", fontSize: "0.8rem",
            border: "1px solid rgba(239,68,68,0.4)", backgroundColor: "transparent",
            color: "#ef4444", cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}