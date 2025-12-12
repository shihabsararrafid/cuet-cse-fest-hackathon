import { ErrorLogEntry } from './Dashboard';

interface ErrorLogProps {
  errors: ErrorLogEntry[];
  onClear: () => void;
}

export function ErrorLog({ errors, onClear }: ErrorLogProps) {
  return (
    <div className="error-log">
      <div className="section-header">
        <h2>Error Log</h2>
        {errors.length > 0 && (
          <button onClick={onClear} className="clear-button">
            Clear
          </button>
        )}
      </div>
      {errors.length === 0 ? (
        <p className="empty-state">No errors logged</p>
      ) : (
        <div className="errors-list">
          {errors.map((error) => (
            <div key={error.id} className="error-item">
              <div className="error-time">
                {error.timestamp.toLocaleTimeString()}
              </div>
              <div className="error-message">{error.message}</div>
              {error.status && (
                <div className="error-status">Status: {error.status}</div>
              )}
              {error.traceId && (
                <div className="error-trace">
                  <strong>Trace ID:</strong>{' '}
                  <code className="trace-id">{error.traceId}</code>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="sentry-info">
        <p className="info-text">
          Errors are automatically captured in Sentry with trace correlation
        </p>
      </div>
    </div>
  );
}
