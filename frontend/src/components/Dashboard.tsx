import { useState, useEffect } from "react";
import { api, HealthResponse, DownloadJob, APIError } from "../api";
import { Sentry } from "../sentry";
import { getCurrentTraceId } from "../instrumentation";
import { HealthStatus } from "./HealthStatus";
import { DownloadJobList } from "./DownloadJobList";
import { ErrorLog } from "./ErrorLog";
import { TraceViewer } from "./TraceViewer";
import { PerformanceMetrics } from "./PerformanceMetrics";
import "./Dashboard.css";

export interface ErrorLogEntry {
  id: string;
  timestamp: Date;
  message: string;
  traceId?: string;
  status?: number;
}

export interface PerformanceMetric {
  timestamp: Date;
  endpoint: string;
  duration: number;
  status: "success" | "failure";
}

export function Dashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [errors, setErrors] = useState<ErrorLogEntry[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentTraceId, setCurrentTraceId] = useState<string | undefined>();

  // Poll health status
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const startTime = performance.now();
        const healthData = await api.getHealth();
        const duration = performance.now() - startTime;

        setHealth(healthData);
        setMetrics((prev) => [
          ...prev.slice(-99),
          {
            timestamp: new Date(),
            endpoint: "/health",
            duration,
            status: "success",
          },
        ]);
      } catch (error) {
        const duration = performance.now();
        setMetrics((prev) => [
          ...prev.slice(-99),
          {
            timestamp: new Date(),
            endpoint: "/health",
            duration,
            status: "failure",
          },
        ]);

        addError(
          error instanceof APIError
            ? error.message
            : "Failed to fetch health status",
        );
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  // Update current trace ID periodically
  useEffect(() => {
    const updateTraceId = () => {
      setCurrentTraceId(getCurrentTraceId());
    };

    updateTraceId();
    const interval = setInterval(updateTraceId, 1000);
    return () => clearInterval(interval);
  }, []);

  const addError = (message: string, status?: number) => {
    const traceId = getCurrentTraceId();
    const errorEntry: ErrorLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      message,
      traceId,
      status,
    };

    setErrors((prev) => [errorEntry, ...prev.slice(0, 49)]);

    // Capture in Sentry
    Sentry.captureMessage(message, {
      level: "error",
      tags: {
        trace_id: traceId,
      },
      contexts: {
        error_log: {
          status,
        },
      },
    });
  };

  const handleInitiateDownload = async () => {
    setLoading(true);
    try {
      const fileIds = [70000, 70001, 70002];
      const startTime = performance.now();
      const job = await api.initiateDownload(fileIds);
      const duration = performance.now() - startTime;

      setJobs((prev) => [job, ...prev]);
      setMetrics((prev) => [
        ...prev.slice(-99),
        {
          timestamp: new Date(),
          endpoint: "/v1/download/initiate",
          duration,
          status: "success",
        },
      ]);
    } catch (error) {
      const duration = performance.now();
      setMetrics((prev) => [
        ...prev.slice(-99),
        {
          timestamp: new Date(),
          endpoint: "/v1/download/initiate",
          duration,
          status: "failure",
        },
      ]);

      addError(
        error instanceof APIError
          ? error.message
          : "Failed to initiate download",
        error instanceof APIError ? error.status : undefined,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCheckDownload = async () => {
    setLoading(true);
    try {
      const fileId = 70000;
      const startTime = performance.now();
      const result = await api.checkDownload(fileId);
      const duration = performance.now() - startTime;

      setMetrics((prev) => [
        ...prev.slice(-99),
        {
          timestamp: new Date(),
          endpoint: "/v1/download/check",
          duration,
          status: "success",
        },
      ]);

      alert(
        `File ${fileId}: ${result.available ? "Available" : "Not Available"}\nSize: ${result.size ? `${(result.size / 1024 / 1024).toFixed(2)} MB` : "N/A"}`,
      );
    } catch (error) {
      const duration = performance.now();
      setMetrics((prev) => [
        ...prev.slice(-99),
        {
          timestamp: new Date(),
          endpoint: "/v1/download/check",
          duration,
          status: "failure",
        },
      ]);

      addError(
        error instanceof APIError ? error.message : "Failed to check download",
        error instanceof APIError ? error.status : undefined,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStartDownload = async () => {
    setLoading(true);
    try {
      const fileId = 70000;
      const startTime = performance.now();
      const job = await api.startDownload(fileId);
      const duration = performance.now() - startTime;

      setJobs((prev) => [job, ...prev]);
      setMetrics((prev) => [
        ...prev.slice(-99),
        {
          timestamp: new Date(),
          endpoint: "/v1/download/start",
          duration,
          status: "success",
        },
      ]);
    } catch (error) {
      const duration = performance.now();
      setMetrics((prev) => [
        ...prev.slice(-99),
        {
          timestamp: new Date(),
          endpoint: "/v1/download/start",
          duration,
          status: "failure",
        },
      ]);

      addError(
        error instanceof APIError ? error.message : "Failed to start download",
        error instanceof APIError ? error.status : undefined,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerSentryTest = async () => {
    setLoading(true);
    try {
      await api.triggerSentryTest(70000);
    } catch (error) {
      // This is expected to fail - it's a test error
      addError(
        error instanceof APIError
          ? error.message
          : "Sentry test error triggered",
        error instanceof APIError ? error.status : 500,
      );
    } finally {
      setLoading(false);
    }
  };

  const clearErrors = () => {
    setErrors([]);
  };

  const clearMetrics = () => {
    setMetrics([]);
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Observability Dashboard</h1>
        <p className="subtitle">
          Real-time monitoring for Download Microservice
        </p>
      </header>

      <div className="trace-info">
        <strong>Current Trace ID:</strong>{" "}
        <code>{currentTraceId || "No active trace"}</code>
      </div>

      <div className="controls">
        <button onClick={handleInitiateDownload} disabled={loading}>
          Initiate Download
        </button>
        <button onClick={handleCheckDownload} disabled={loading}>
          Check Download
        </button>
        <button onClick={handleStartDownload} disabled={loading}>
          Start Download (Long-Running)
        </button>
        <button
          onClick={handleTriggerSentryTest}
          disabled={loading}
          className="danger"
        >
          Trigger Sentry Test
        </button>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-section">
          <HealthStatus health={health} />
        </div>

        <div className="dashboard-section">
          <TraceViewer />
        </div>

        <div className="dashboard-section full-width">
          <DownloadJobList jobs={jobs} />
        </div>

        <div className="dashboard-section">
          <ErrorLog errors={errors} onClear={clearErrors} />
        </div>

        <div className="dashboard-section">
          <PerformanceMetrics metrics={metrics} onClear={clearMetrics} />
        </div>
      </div>
    </div>
  );
}
