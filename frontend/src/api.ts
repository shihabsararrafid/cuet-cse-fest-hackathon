import { createSpan, getCurrentTraceId } from './instrumentation';
import { Sentry } from './sentry';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  checks: {
    storage: 'ok' | 'error';
  };
}

export interface DownloadJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  totalFileIds?: number;
  file_id?: number;
  downloadUrl?: string | null;
  size?: number | null;
  processingTimeMs?: number;
  message?: string;
}

export interface DownloadCheckResponse {
  file_id: number;
  available: boolean;
  s3Key: string | null;
  size: number | null;
}

export interface ErrorResponse {
  error: string;
  message: string;
  requestId?: string;
}

class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: ErrorResponse
  ) {
    super(message);
    this.name = 'APIError';
  }
}

async function fetchWithTracing<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  return createSpan(
    `HTTP ${options?.method || 'GET'} ${url}`,
    async () => {
      const traceId = getCurrentTraceId();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options?.headers,
      };

      // Add trace ID to request for backend correlation
      if (traceId) {
        headers['x-trace-id'] = traceId;
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: 'Unknown error',
          message: `HTTP ${response.status}`,
        })) as ErrorResponse;

        const error = new APIError(
          errorData.message || `HTTP ${response.status}`,
          response.status,
          errorData
        );

        // Capture error in Sentry
        Sentry.captureException(error, {
          contexts: {
            response: {
              status: response.status,
              statusText: response.statusText,
              url,
            },
          },
          tags: {
            trace_id: traceId,
          },
        });

        throw error;
      }

      return response.json() as Promise<T>;
    },
    {
      'http.url': url,
      'http.method': options?.method || 'GET',
    }
  );
}

export const api = {
  async getHealth(): Promise<HealthResponse> {
    return fetchWithTracing<HealthResponse>(`${API_BASE_URL}/health`);
  },

  async initiateDownload(fileIds: number[]): Promise<DownloadJob> {
    return fetchWithTracing<DownloadJob>(`${API_BASE_URL}/v1/download/initiate`, {
      method: 'POST',
      body: JSON.stringify({ file_ids: fileIds }),
    });
  },

  async checkDownload(fileId: number): Promise<DownloadCheckResponse> {
    return fetchWithTracing<DownloadCheckResponse>(
      `${API_BASE_URL}/v1/download/check`,
      {
        method: 'POST',
        body: JSON.stringify({ file_id: fileId }),
      }
    );
  },

  async startDownload(fileId: number): Promise<DownloadJob> {
    return fetchWithTracing<DownloadJob>(`${API_BASE_URL}/v1/download/start`, {
      method: 'POST',
      body: JSON.stringify({ file_id: fileId }),
    });
  },

  async triggerSentryTest(fileId: number): Promise<never> {
    return fetchWithTracing<never>(
      `${API_BASE_URL}/v1/download/check?sentry_test=true`,
      {
        method: 'POST',
        body: JSON.stringify({ file_id: fileId }),
      }
    );
  },
};

export { APIError };
