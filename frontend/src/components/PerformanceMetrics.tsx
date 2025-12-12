import { PerformanceMetric } from "./Dashboard";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface PerformanceMetricsProps {
  metrics: PerformanceMetric[];
  onClear: () => void;
}

export function PerformanceMetrics({
  metrics,
  onClear,
}: PerformanceMetricsProps) {
  const successCount = metrics.filter((m) => m.status === "success").length;
  const failureCount = metrics.filter((m) => m.status === "failure").length;
  const avgDuration =
    metrics.length > 0
      ? metrics.reduce((acc, m) => acc + m.duration, 0) / metrics.length
      : 0;

  const chartData = metrics.slice(-20).map((m, index) => ({
    index: index + 1,
    duration: Math.round(m.duration),
    name: m.endpoint.split("/").pop() || "unknown",
  }));

  return (
    <div className="performance-metrics">
      <div className="section-header">
        <h2>Performance Metrics</h2>
        {metrics.length > 0 && (
          <button onClick={onClear} className="clear-button">
            Clear
          </button>
        )}
      </div>

      <div className="metrics-summary">
        <div className="metric-card">
          <div className="metric-value">{metrics.length}</div>
          <div className="metric-label">Total Requests</div>
        </div>
        <div className="metric-card success">
          <div className="metric-value">{successCount}</div>
          <div className="metric-label">Success</div>
        </div>
        <div className="metric-card failure">
          <div className="metric-value">{failureCount}</div>
          <div className="metric-label">Failures</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{Math.round(avgDuration)}ms</div>
          <div className="metric-label">Avg Response Time</div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="chart-container">
          <h3>Response Time Trend (Last 20 requests)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="index"
                label={{
                  value: "Request #",
                  position: "insideBottom",
                  offset: -5,
                }}
              />
              <YAxis
                label={{
                  value: "Duration (ms)",
                  angle: -90,
                  position: "insideLeft",
                }}
              />
              <Tooltip
                formatter={(value: number) => [`${value}ms`, "Duration"]}
                labelFormatter={(label) => `Request #${label}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="duration"
                stroke="#8884d8"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {metrics.length === 0 && (
        <p className="empty-state">No metrics collected yet</p>
      )}
    </div>
  );
}
