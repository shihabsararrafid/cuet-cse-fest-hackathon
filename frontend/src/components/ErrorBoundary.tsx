import React, { Component, ReactNode } from "react";
import * as Sentry from "@sentry/react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to Sentry
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    });

    console.error("Error caught by boundary:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "2rem",
            maxWidth: "600px",
            margin: "2rem auto",
            textAlign: "center",
            background: "#fff3f3",
            border: "2px solid #dc3545",
            borderRadius: "8px",
          }}
        >
          <h1 style={{ color: "#dc3545" }}>Something went wrong</h1>
          <p style={{ color: "#666", margin: "1rem 0" }}>
            {this.state.error?.message ||
              "An unexpected error occurred in the application."}
          </p>
          <p
            style={{
              fontSize: "0.9rem",
              color: "#999",
              marginBottom: "1.5rem",
            }}
          >
            This error has been logged to Sentry for analysis.
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: "0.75rem 1.5rem",
              background: "#0066cc",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
