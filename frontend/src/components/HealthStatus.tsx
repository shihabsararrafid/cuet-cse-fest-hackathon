import { HealthResponse } from "../api";

interface HealthStatusProps {
  health: HealthResponse | null;
}

export function HealthStatus({ health }: HealthStatusProps) {
  return (
    <div className="health-status">
      <h2>Health Status</h2>
      {health ? (
        <div className="health-info">
          <div className={`status-badge ${health.status}`}>
            {health.status.toUpperCase()}
          </div>
          <div className="checks">
            <h3>Checks</h3>
            <div className="check-item">
              <span className="check-label">Storage:</span>
              <span className={`check-status ${health.checks.storage}`}>
                {health.checks.storage.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="loading">Loading health status...</div>
      )}
    </div>
  );
}
