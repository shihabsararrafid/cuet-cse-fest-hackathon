import * as Sentry from "@sentry/react";
import { getCurrentTraceId } from "./instrumentation";

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.warn(
      "Sentry DSN not configured. Error tracking will not be enabled.",
    );
    return;
  }

  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: 1.0, // Capture 100% of transactions for development
    // Session Replay
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% when an error occurs
    environment: import.meta.env.MODE,
    beforeSend(event, hint) {
      // Add OpenTelemetry trace ID to Sentry events for correlation
      const traceId = getCurrentTraceId();
      if (traceId) {
        event.tags = {
          ...event.tags,
          trace_id: traceId,
        };
      }
      return event;
    },
  });
}

// Export Sentry for manual error capture
export { Sentry };
