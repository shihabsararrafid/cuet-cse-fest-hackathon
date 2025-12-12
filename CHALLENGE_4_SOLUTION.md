# Challenge 4: Observability Dashboard - Solution Documentation

## Overview

This solution implements a comprehensive observability dashboard that integrates Sentry for error tracking and OpenTelemetry for distributed tracing. The dashboard provides real-time visibility into the download microservice's health, performance, and error states with full end-to-end correlation.

## Deliverables

### 1. React Application (`frontend/` directory)

A complete React application built with:
- **Vite** for fast development and optimized production builds
- **TypeScript** for type safety
- **Sentry React SDK** for error tracking and performance monitoring
- **OpenTelemetry Web SDK** for distributed tracing
- **Recharts** for performance visualization

#### Key Components

- **Dashboard**: Main application interface
- **HealthStatus**: Real-time API health monitoring
- **DownloadJobList**: List of download jobs with status tracking
- **ErrorLog**: Recent errors with Sentry integration
- **TraceViewer**: Links to Jaeger UI for trace visualization
- **PerformanceMetrics**: API performance metrics and charts
- **ErrorBoundary**: React error boundary with Sentry reporting

### 2. Sentry Integration

#### Features Implemented

1. **Error Boundary**
   - Wraps the entire application
   - Catches React component errors
   - Reports to Sentry with full component stack
   - Provides user-friendly error UI

2. **Automatic Error Capture**
   - All API errors automatically captured
   - HTTP status codes included
   - Request context preserved
   - Stack traces available in Sentry

3. **User Feedback**
   - Error messages shown to users
   - Correlation IDs for support
   - Try again functionality

4. **Performance Monitoring**
   - Page load tracking
   - API call duration tracking
   - User interaction spans
   - Browser profiling data

5. **Custom Error Logging**
   - Business logic errors
   - Validation failures
   - Network timeouts
   - Custom tags and contexts

#### Trace Correlation

All Sentry events include the OpenTelemetry trace ID:
```typescript
beforeSend(event, hint) {
  const traceId = getCurrentTraceId();
  if (traceId) {
    event.tags = {
      ...event.tags,
      trace_id: traceId,
    };
  }
  return event;
}
```

### 3. OpenTelemetry Integration

#### Features Implemented

1. **Trace Propagation**
   - W3C Trace Context standard
   - Automatic context propagation
   - Frontend-to-backend correlation
   - Trace ID preservation across services

2. **Custom Spans**
   - User interaction spans
   - API call instrumentation
   - Custom business logic spans
   - Nested span support

3. **Fetch Instrumentation**
   - Automatic HTTP request tracking
   - Request/response attributes
   - Error recording
   - Duration measurement

4. **Document Load Instrumentation**
   - Page load performance
   - Resource timing
   - Navigation timing
   - User-centric metrics

#### Trace Context Propagation

Headers added to all API requests:
```typescript
const traceId = getCurrentTraceId();
if (traceId) {
  headers['x-trace-id'] = traceId;
}
```

### 4. Dashboard Features

#### Health Status
- Real-time health checks every 5 seconds
- Storage connectivity status
- Visual status badges
- Automatic retry on failure

#### Download Jobs
- Job ID tracking
- Status monitoring (queued/processing/completed/failed)
- Processing time display
- File size information
- Download links when ready

#### Error Log
- Chronological error list
- Timestamp for each error
- HTTP status codes
- Trace ID for correlation
- Automatic pruning (keeps last 50)

#### Trace Viewer
- Direct links to Jaeger UI
- Service-specific filtering
- Frontend trace search
- Backend trace search
- Correlation guidance

#### Performance Metrics
- Total request counter
- Success/failure rates
- Average response time
- Visual trend chart (last 20 requests)
- Real-time updates

### 5. Correlation Flow

```
┌──────────────────────────────────────────────────────────┐
│ User Action: Click "Download" Button                    │
└───────────────────┬──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────┐
│ Frontend: Create Span                                    │
│ - span_id: def456                                        │
│ - trace_id: abc123                                       │
│ - operation: "Download Button Click"                    │
└───────────────────┬──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────┐
│ HTTP Request: POST /v1/download/start                   │
│ Headers:                                                 │
│ - traceparent: 00-abc123-def456-01                      │
│ - x-trace-id: abc123                                    │
└───────────────────┬──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────┐
│ Backend: Process Request                                │
│ - Extracts trace context from headers                   │
│ - Creates child span with same trace_id                 │
│ - Logs include trace_id=abc123                          │
└───────────────────┬──────────────────────────────────────┘
                    │
                    ▼ (if error occurs)
┌──────────────────────────────────────────────────────────┐
│ Error Handling                                           │
│ - Frontend catches error                                │
│ - Sentry event created with:                            │
│   tags: { trace_id: "abc123" }                          │
│ - Error displayed in Error Log with trace_id           │
└──────────────────────────────────────────────────────────┘

Result: Can search Jaeger by trace_id to see full flow,
        and find corresponding Sentry error with same trace_id
```

## Setup Instructions

### Prerequisites

- Node.js >= 24.10.0
- npm >= 10.x
- Docker and Docker Compose (for full stack)
- Sentry account (optional but recommended)

### Quick Start

1. **Install Frontend Dependencies**
```bash
cd frontend
npm install
```

2. **Configure Environment**
```bash
cp frontend/.env.example frontend/.env
```

Edit `frontend/.env`:
```env
VITE_API_BASE_URL=http://localhost:3000
VITE_SENTRY_DSN=https://your-sentry-dsn-here  # Optional
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
VITE_JAEGER_URL=http://localhost:16686
```

3. **Run Full Stack with Docker**
```bash
# From project root
npm run docker:dev
```

This starts:
- Backend API (http://localhost:3000)
- Frontend Dashboard (http://localhost:5173)
- Jaeger UI (http://localhost:16686)
- MinIO S3 Storage (http://localhost:9000)

4. **Or Run Frontend in Development Mode**
```bash
# Terminal 1: Start backend
npm run start

# Terminal 2: Start frontend
cd frontend
npm run dev
```

### Setting Up Sentry

1. **Create Sentry Project**
   - Go to https://sentry.io
   - Create a free account
   - Click "Create Project"
   - Select "React" as platform
   - Copy the DSN

2. **Configure Sentry DSN**
   - Add DSN to `frontend/.env`:
   ```env
   VITE_SENTRY_DSN=https://your-key@o12345.ingest.sentry.io/67890
   ```

3. **Test Sentry Integration**
   - Open dashboard at http://localhost:5173
   - Click "Trigger Sentry Test" button
   - Check Sentry dashboard for the error
   - Verify trace_id tag is present

## Testing the Solution

### 1. Test Sentry Error Tracking

**Via Dashboard:**
```
1. Open http://localhost:5173
2. Click "Trigger Sentry Test"
3. Check Error Log for the error with trace ID
4. Open Sentry dashboard
5. Find the error event
6. Verify trace_id tag matches the one in Error Log
```

**Via API:**
```bash
curl -X POST "http://localhost:3000/v1/download/check?sentry_test=true" \
  -H "Content-Type: application/json" \
  -d '{"file_id": 70000}'
```

### 2. Test OpenTelemetry Tracing

**View Traces:**
```
1. Open http://localhost:5173
2. Click "Initiate Download"
3. Note the trace ID shown in the dashboard
4. Open http://localhost:16686 (Jaeger UI)
5. Select service "observability-dashboard"
6. Search for traces
7. Find your trace by ID
8. Verify span hierarchy shows frontend → backend flow
```

**Verify Trace Propagation:**
```
1. Make any API request from dashboard
2. Check browser DevTools Network tab
3. Verify traceparent header is present
4. Check Jaeger for corresponding trace
5. Verify backend span is child of frontend span
```

### 3. Test Correlation

**Error-to-Trace Correlation:**
```
1. Trigger an error (any failed API call or Sentry test)
2. Copy trace ID from Error Log
3. Open Jaeger UI
4. Paste trace ID in search
5. View full request trace
6. Open Sentry
7. Find error with matching trace_id tag
```

### 4. Test Performance Monitoring

**Verify Metrics Collection:**
```
1. Make several API requests
2. Check Performance Metrics section
3. Verify chart shows request durations
4. Check success/failure counts
5. Verify average response time calculation
```

## Architecture

### Technology Stack

**Frontend:**
- React 18.3 with TypeScript
- Vite 6.0 (build tool)
- @sentry/react 8.47.0
- @opentelemetry/sdk-trace-web 1.29.0
- recharts 2.15.0

**Backend (existing):**
- Node.js 24 with Hono framework
- @opentelemetry/sdk-node
- @hono/sentry

**Infrastructure:**
- Jaeger (trace collection/visualization)
- MinIO (S3-compatible storage)
- Docker Compose (orchestration)

### File Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Dashboard.tsx          # Main dashboard
│   │   ├── Dashboard.css          # Dashboard styles
│   │   ├── HealthStatus.tsx       # Health monitoring
│   │   ├── DownloadJobList.tsx    # Job tracking
│   │   ├── ErrorLog.tsx           # Error display
│   │   ├── TraceViewer.tsx        # Jaeger links
│   │   ├── PerformanceMetrics.tsx # Performance charts
│   │   └── ErrorBoundary.tsx      # Error handling
│   ├── api.ts                     # API client with tracing
│   ├── instrumentation.ts         # OpenTelemetry setup
│   ├── sentry.ts                  # Sentry initialization
│   ├── App.tsx                    # Root component
│   └── main.tsx                   # Entry point
├── Dockerfile                     # Production build
├── nginx.conf                     # Nginx configuration
├── .env.example                   # Environment template
└── README.md                      # Frontend documentation
```

## Key Implementation Details

### 1. Trace ID Generation and Propagation

```typescript
// instrumentation.ts - Extract current trace ID
export function getCurrentTraceId(): string | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext?.traceId;
}

// api.ts - Add to request headers
const traceId = getCurrentTraceId();
if (traceId) {
  headers['x-trace-id'] = traceId;
}
```

### 2. Sentry-Trace Correlation

```typescript
// sentry.ts - Tag errors with trace ID
beforeSend(event, hint) {
  const traceId = getCurrentTraceId();
  if (traceId) {
    event.tags = {
      ...event.tags,
      trace_id: traceId,
    };
  }
  return event;
}
```

### 3. Custom Span Creation

```typescript
// instrumentation.ts - Helper for creating spans
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
      span.setStatus({ code: 2, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### 4. Automatic Error Capture

```typescript
// api.ts - Capture API errors
if (!response.ok) {
  const error = new APIError(message, response.status, errorData);

  Sentry.captureException(error, {
    contexts: {
      response: {
        status: response.status,
        url,
      },
    },
    tags: {
      trace_id: getCurrentTraceId(),
    },
  });

  throw error;
}
```

## Docker Compose Integration

### Updated compose.dev.yml

Added frontend service:
```yaml
delineate-frontend:
  build:
    context: ../frontend
    dockerfile: Dockerfile
  ports:
    - "5173:80"
  environment:
    - VITE_API_BASE_URL=http://localhost:3000
    - VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
    - VITE_JAEGER_URL=http://localhost:16686
  depends_on:
    - delineate-app
    - delineate-jaeger
```

### Jaeger Configuration

Already included in compose.dev.yml:
```yaml
delineate-jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "16686:16686"  # Jaeger UI
    - "4318:4318"    # OTLP HTTP endpoint
  environment:
    - COLLECTOR_OTLP_ENABLED=true
```

## Benefits of This Solution

### 1. Full Observability
- **Visibility**: See exactly what's happening in your system
- **Debugging**: Trace errors from user action to root cause
- **Performance**: Identify slow endpoints and bottlenecks

### 2. Production-Ready
- **Error Tracking**: Never miss a production error
- **Alerting**: Sentry can alert on errors and performance issues
- **Compliance**: Audit trail for debugging and compliance

### 3. Developer Experience
- **Fast Debugging**: Trace ID correlation speeds up debugging
- **Clear Insights**: Visual dashboards show system health
- **Easy Setup**: Docker Compose makes local development simple

### 4. Scalability
- **Distributed**: Works across multiple services
- **Batched**: Traces are batched to reduce overhead
- **Sampling**: Can configure sampling rates for production

## Bonus Features Implemented

1. **Performance Visualization**: Real-time charts showing API performance trends
2. **Automatic Health Monitoring**: Polls health endpoint every 5 seconds
3. **Error Pruning**: Automatically limits stored errors to prevent memory issues
4. **Responsive Design**: Works on desktop and mobile
5. **Security Headers**: Nginx configuration includes security best practices
6. **Production Build**: Optimized Docker build with nginx
7. **Development Mode**: Hot reload for rapid development

## Future Enhancements

Possible improvements:
- Session replay integration
- Custom dashboards for specific metrics
- Alert configuration UI
- Trace sampling controls
- Performance budgets
- A/B test tracking
- User journey tracking
- Real User Monitoring (RUM)

## Conclusion

This solution provides a complete observability stack for the download microservice, meeting all requirements of Challenge 4:

✅ React application with Sentry integration
✅ OpenTelemetry distributed tracing
✅ Full trace correlation (frontend ↔ backend ↔ Sentry)
✅ Docker Compose integration
✅ Jaeger UI for trace visualization
✅ Comprehensive documentation
✅ Production-ready deployment

The dashboard provides real-time visibility into system health, performance, and errors with full end-to-end correlation, making debugging and monitoring straightforward and efficient.
