# Observability Dashboard - Challenge 4

A React-based observability dashboard that integrates with Sentry for error tracking and OpenTelemetry for distributed tracing, providing real-time visibility into the download microservice's health and performance.

## Features

### 1. Sentry Integration

- **Error Boundary**: Wraps the entire application to catch and report React errors
- **Automatic Error Capture**: All failed API calls are automatically logged to Sentry
- **User Feedback Dialog**: Provides context for errors when they occur
- **Performance Monitoring**: Tracks page load and interaction performance
- **Trace Correlation**: All Sentry errors are tagged with OpenTelemetry trace IDs

### 2. OpenTelemetry Integration

- **Distributed Tracing**: Full trace propagation from frontend to backend
- **Custom Spans**: User interactions and API calls create custom spans
- **Fetch Instrumentation**: Automatic instrumentation of all HTTP requests
- **Document Load Instrumentation**: Tracks page load performance
- **Trace Context Propagation**: Uses W3C Trace Context standard

### 3. Dashboard Features

#### Health Status

- Real-time API health monitoring
- Storage service status checking
- Auto-refreshes every 5 seconds

#### Download Jobs

- List of all initiated downloads
- Shows job status, processing time, file size
- Download links when files are ready

#### Error Log

- Recent errors with timestamps
- HTTP status codes
- Trace IDs for correlation
- Automatic Sentry capture

#### Trace Viewer

- Direct links to Jaeger UI
- Frontend and backend trace filtering
- End-to-end trace correlation

#### Performance Metrics

- Total request count
- Success/failure rates
- Average response time
- Response time trend chart (last 20 requests)

### 4. Correlation

The dashboard ensures end-to-end traceability:

```
User clicks "Download" button
│
▼
Frontend creates span with trace-id: abc123
│
▼
API request includes header: traceparent: 00-abc123-...
│
▼
Backend logs include: trace_id=abc123
│
▼
Errors in Sentry tagged with: trace_id=abc123
```

## Setup

### Prerequisites

- Node.js >= 24.10.0
- npm >= 10.x
- Running backend API (see main README)
- Jaeger for trace viewing (included in Docker Compose)

### Installation

1. Install dependencies:

```bash
npm install
```

2. Create `.env` file:

```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:3000

# Sentry Configuration (optional)
# Create a project at https://sentry.io and paste the DSN here
VITE_SENTRY_DSN=your-sentry-dsn-here

# OpenTelemetry Configuration
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces

# Jaeger UI URL
VITE_JAEGER_URL=http://localhost:16686
```

### Development

Run the development server:

```bash
npm run dev
```

The dashboard will be available at http://localhost:5173

### Production Build

Build for production:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Docker Deployment

### Build and Run with Docker

Build the Docker image:

```bash
docker build -t observability-dashboard .
```

Run the container:

```bash
docker run -p 5173:80 observability-dashboard
```

### Run with Docker Compose

From the project root directory:

```bash
npm run docker:dev
```

This will start:

- Backend API (port 3000)
- Frontend Dashboard (port 5173)
- Jaeger UI (port 16686)
- MinIO S3 (port 9000, 9001)

Access the services:

- **Dashboard**: http://localhost:5173
- **API**: http://localhost:3000
- **Jaeger UI**: http://localhost:16686
- **MinIO Console**: http://localhost:9001

## Setting Up Sentry

1. Create a free account at [sentry.io](https://sentry.io)

2. Create a new project:
   - Select "React" as the platform
   - Copy the DSN (Data Source Name)

3. Add the DSN to your `.env` file:

```env
VITE_SENTRY_DSN=https://your-key@o12345.ingest.sentry.io/67890
```

4. Test Sentry integration:
   - Click the "Trigger Sentry Test" button in the dashboard
   - Check your Sentry dashboard for the error
   - The error should include the trace ID tag

## Using the Dashboard

### Initiating Downloads

1. **Initiate Download**: Creates a bulk download job for multiple file IDs
2. **Check Download**: Checks if a single file is available in S3
3. **Start Download (Long-Running)**: Simulates a long-running download (may timeout)
4. **Trigger Sentry Test**: Intentionally triggers an error to test Sentry integration

### Viewing Traces

1. Open Jaeger UI: http://localhost:16686
2. Select service: `observability-dashboard` (frontend) or `delineate-hackathon-challenge` (backend)
3. Search for traces
4. Click on a trace to view the full request flow

### Correlating Errors with Traces

When an error occurs:

1. Check the Error Log section for the trace ID
2. Copy the trace ID
3. Open Jaeger UI
4. Search by trace ID to see the full request context
5. Check Sentry for additional error details

## Architecture

### Frontend Stack

- **React 18**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool and dev server
- **Recharts**: Performance metrics visualization
- **@sentry/react**: Error tracking and performance monitoring
- **@opentelemetry/sdk-trace-web**: Distributed tracing

### Observability Stack

- **Sentry**: Error tracking and performance monitoring
- **OpenTelemetry**: Distributed tracing standard
- **Jaeger**: Trace collection and visualization
- **W3C Trace Context**: Trace propagation standard

### Key Files

- `src/instrumentation.ts`: OpenTelemetry setup and tracer configuration
- `src/sentry.ts`: Sentry initialization with trace correlation
- `src/api.ts`: API client with automatic tracing and error capture
- `src/components/Dashboard.tsx`: Main dashboard component
- `src/components/ErrorBoundary.tsx`: React error boundary with Sentry integration

## Testing Sentry Integration

The API includes a built-in endpoint to test Sentry error tracking:

```bash
curl -X POST "http://localhost:3000/v1/download/check?sentry_test=true" \
  -H "Content-Type: application/json" \
  -d '{"file_id": 70000}'
```

Or click the "Trigger Sentry Test" button in the dashboard.

This will:

1. Trigger an intentional error in the backend
2. Capture the error in the frontend
3. Log it to Sentry with trace correlation
4. Display it in the Error Log with the trace ID

## Troubleshooting

### Traces not appearing in Jaeger

1. Verify Jaeger is running:

```bash
curl http://localhost:16686
```

2. Check OTLP endpoint:

```bash
curl http://localhost:4318/v1/traces
```

3. Verify environment variables are set correctly

### Sentry errors not appearing

1. Verify DSN is correctly set in `.env`
2. Check browser console for Sentry initialization errors
3. Ensure the DSN starts with `https://`
4. Check Sentry project settings for rate limits

### CORS errors

1. Verify the backend is running on the correct port
2. Check `VITE_API_BASE_URL` in `.env`
3. Ensure backend CORS is configured to allow the frontend origin

### Performance chart not rendering

1. Make at least one API request to generate metrics
2. Check browser console for recharts errors
3. Verify recharts is installed: `npm list recharts`

## Performance Considerations

- API health checks run every 5 seconds
- Errors are limited to 50 entries (automatically pruned)
- Metrics are limited to 100 entries (automatically pruned)
- Chart shows only the last 20 data points
- Traces are batched before sending to reduce overhead

## Security

- No sensitive data is logged to Sentry
- Trace IDs are safe to expose (they're public identifiers)
- API endpoints require proper CORS configuration
- Nginx serves the frontend with security headers
- All environment variables are validated at runtime

## Browser Support

Tested and working on:

- Chrome 120+
- Firefox 120+
- Safari 17+
- Edge 120+

## License

See main project README
