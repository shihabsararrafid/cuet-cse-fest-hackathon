export function TraceViewer() {
  const jaegerUrl = import.meta.env.VITE_JAEGER_URL || "http://localhost:16686";

  return (
    <div className="trace-viewer">
      <h2>Trace Viewer</h2>
      <p className="info-text">
        View distributed traces in Jaeger UI to debug request flows
      </p>
      <div className="trace-links">
        <a
          href={jaegerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="jaeger-link"
        >
          Open Jaeger UI
        </a>
        <a
          href={`${jaegerUrl}/search?service=observability-dashboard`}
          target="_blank"
          rel="noopener noreferrer"
          className="jaeger-link"
        >
          View Frontend Traces
        </a>
        <a
          href={`${jaegerUrl}/search?service=delineate-hackathon-challenge`}
          target="_blank"
          rel="noopener noreferrer"
          className="jaeger-link"
        >
          View Backend Traces
        </a>
      </div>
      <div className="trace-info">
        <h3>Correlation</h3>
        <p>
          All frontend requests include trace IDs that propagate to the backend.
          Errors in Sentry are tagged with trace IDs for end-to-end correlation.
        </p>
      </div>
    </div>
  );
}
