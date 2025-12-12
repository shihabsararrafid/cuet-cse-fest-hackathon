import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace, context } from '@opentelemetry/api';

// Create a resource
const resource = new Resource({
  [ATTR_SERVICE_NAME]: 'observability-dashboard',
});

// Initialize the tracer provider
const provider = new WebTracerProvider({
  resource,
});

// Configure OTLP exporter
const exporter = new OTLPTraceExporter({
  url: import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
});

// Add batch span processor
provider.addSpanProcessor(new BatchSpanProcessor(exporter));

// Register the provider
provider.register({
  contextManager: new ZoneContextManager(),
});

// Register instrumentations
registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({
      propagateTraceHeaderCorsUrls: [/.*/],
      clearTimingResources: true,
      applyCustomAttributesOnSpan: (span, request, result) => {
        if (request instanceof Request) {
          span.setAttribute('http.url', request.url);
          span.setAttribute('http.method', request.method);
        }
        if (result instanceof Response) {
          span.setAttribute('http.status_code', result.status);
        }
      },
    }),
    new DocumentLoadInstrumentation(),
  ],
});

// Export tracer for manual instrumentation
export const tracer = trace.getTracer('observability-dashboard');

// Helper function to create custom spans
export function createSpan<T>(
  name: string,
  fn: () => Promise<T> | T,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        span.setAttribute(key, value);
      });
    }

    try {
      const result = await fn();
      span.setStatus({ code: 1 }); // OK
      return result;
    } catch (error) {
      span.setStatus({
        code: 2, // ERROR
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

// Get current trace ID for correlation
export function getCurrentTraceId(): string | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext?.traceId;
}

// Get current span ID
export function getCurrentSpanId(): string | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext?.spanId;
}

// Create a context-aware wrapper for async functions
export function withTracing<T>(name: string, attributes?: Record<string, string | number | boolean>) {
  return (fn: () => Promise<T> | T): Promise<T> => {
    return createSpan(name, fn, attributes);
  };
}
