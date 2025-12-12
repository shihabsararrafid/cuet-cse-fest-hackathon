# Challenge 2: Long-Running Download Architecture Design

## Problem Statement

This microservice handles file downloads with variable processing times (10-120+ seconds). When deployed behind reverse proxies like Cloudflare (100s timeout), nginx, or AWS ALB, the current synchronous approach causes:

- **Connection Timeouts**: Proxies kill requests exceeding timeout limits
- **Gateway 504 Errors**: Users see errors even when downloads succeed
- **Poor UX**: No progress feedback during long waits
- **Resource Waste**: Open HTTP connections consume server memory
- **Retry Storms**: Failed requests trigger duplicate work

---

## 1. Architecture Diagram

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT (Browser / Mobile)                    │
└────────┬──────────────────────────┬─────────────────────────────┘
         │                          │
         │ 1. POST /initiate        │ 2. GET /subscribe/:jobId (SSE)
         │    Returns jobId         │    ⚡ Real-time updates (PRIMARY)
         ▼                          │
┌─────────────────────────┐         │    3. GET /status/:jobId
│   REVERSE PROXY         │         │       🔄 Polling (FALLBACK)
│ (Cloudflare / nginx)    │         │
│ Timeout: 100s (SSE OK)  │         │
└────────┬────────────────┘         │
         │                          │
         ▼                          ▼
┌────────────────────────────────────────────────────────────────┐
│                      API SERVER (Node.js)                      │
│  • POST /v1/download/initiate        → Create job             │
│  • GET  /v1/download/subscribe/:id   → SSE stream (PRIMARY)   │
│  • GET  /v1/download/status/:id      → Polling (FALLBACK)     │
└────────┬──────────────────────────────┬────────────────────────┘
         │                              │
         │ Enqueue                      │ Subscribe/Read Status
         ▼                              ▼
┌──────────────────┐          ┌─────────────────────┐
│   REDIS QUEUE    │◀────────▶│  REDIS PUB/SUB      │
│   (BullMQ)       │          │  + Status Cache     │
└────────┬─────────┘          └─────────────────────┘
         │                              ▲
         │ Dequeue & Process            │ Publish Updates
         ▼                              │
┌────────────────────────────────────────────────────────────────┐
│                    WORKER PROCESSES                            │
│  • Pull jobs from queue                                        │
│  • Process download (simulate delay)                           │
│  • Publish progress to Redis Pub/Sub → SSE clients            │
│  • Update status cache → Polling clients                       │
│  • Upload result to S3                                         │
└────────┬───────────────────────────────────────────────────────┘
         │
         │ Upload File
         ▼
┌────────────────────────────────────────────────────────────────┐
│                   S3 STORAGE (MinIO)                           │
│  • Store downloaded files                                      │
│  • Generate presigned URLs (7-day expiry)                      │
└────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Client  │     │   API   │     │  Redis  │     │ Worker  │     │   S3    │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │               │
     │ POST /initiate│               │               │               │
     ├──────────────>│               │               │               │
     │               │ Create job    │               │               │
     │               ├──────────────>│               │               │
     │               │               │ Enqueue job   │               │
     │               │               ├──────────────>│               │
     │<──────────────┤               │               │               │
     │  {jobId}      │               │               │               │
     │               │               │               │               │
     │ GET /status   │               │               │               │
     ├──────────────>│               │               │               │
     │               │ Read status   │               │               │
     │               ├──────────────>│               │               │
     │<──────────────┤               │               │               │
     │  {queued}     │               │               │               │
     │               │               │               │               │
     │ GET /status   │               │               │               │
     ├──────────────>│               │               │  Processing   │
     │               ├──────────────>│               │───────────────>
     │<──────────────┤               │               │               │
     │ {processing}  │               │               │               │
     │               │               │               │               │
     │ GET /status   │               │  Update       │  Upload       │
     ├──────────────>│               │<──────────────┤──────────────>│
     │               ├──────────────>│               │               │
     │<──────────────┤               │               │               │
     │ {completed,   │               │               │               │
     │  presigned    │               │               │               │
     │  URL}         │               │               │               │
     │               │               │               │               │
     │ Direct Download                               │               │
     ├───────────────────────────────────────────────────────────────>
     │               │               │               │               │
```

---

## 2. Technical Approach

**Selected Pattern:** Hybrid Pattern - SSE Primary with Polling Fallback

### Why This Pattern?

| Aspect             | Benefit                                                   |
| ------------------ | --------------------------------------------------------- |
| **Real-time UX**   | SSE provides instant progress updates (no 2s delay)       |
| **Efficient**      | Single long-lived connection vs repeated polling requests |
| **Proxy-Friendly** | SSE uses standard HTTP, works through Cloudflare/nginx    |
| **Resilient**      | Auto-fallback to polling if SSE fails or unsupported      |
| **Scalable**       | Workers scale independently of API servers                |

### Pattern Comparison

| Pattern                | Pros                                     | Cons                           | Selected    |
| ---------------------- | ---------------------------------------- | ------------------------------ | ----------- |
| **SSE (Primary)**      | Real-time updates, efficient, HTTP-based | Requires keep-alive connection | ✅ Primary  |
| **Polling (Fallback)** | Universal support, simple                | Higher latency, more requests  | ✅ Fallback |
| WebSocket              | Bidirectional, real-time                 | More complex, proxy issues     | ❌ No       |
| Webhook                | Serverless-friendly                      | Not suitable for browsers      | ❌ No       |

### Why SSE Over WebSocket?

| Feature         | SSE                                          | WebSocket                   |
| --------------- | -------------------------------------------- | --------------------------- |
| Protocol        | HTTP (text/event-stream)                     | ws:// (separate protocol)   |
| Proxy Support   | ✅ Works everywhere                          | ⚠️ Needs special config     |
| Complexity      | Simple (like GET request)                    | Complex (handshake, frames) |
| Reconnection    | ✅ Automatic                                 | ❌ Manual implementation    |
| Direction       | Server → Client (perfect for status updates) | Bidirectional (overkill)    |
| Browser Support | ✅ 97%+ (except IE11)                        | ✅ 98%+                     |

**Decision:** SSE is perfect for our use case (server pushes status updates to client) and simpler than WebSocket.

---

## 3. Implementation Details

### 3.1 API Contract Changes

#### Existing Endpoint (Modified)

```
POST /v1/download/start
```

**Before:** Synchronous processing (blocks 10-120s)
**After:** Returns immediately with job_id

#### New Endpoints

**1. Initiate Download**

```http
POST /v1/download/initiate
Content-Type: application/json

{
  "file_id": 70000
}
```

Response (201 Created):

```json
{
  "job_id": "job_abc123",
  "status": "queued",
  "created_at": "2025-12-12T10:00:00Z",
  "sse_url": "/v1/download/subscribe/job_abc123",
  "status_url": "/v1/download/status/job_abc123"
}
```

**2. Subscribe to Real-time Updates (SSE) - PRIMARY**

```http
GET /v1/download/subscribe/:job_id
Accept: text/event-stream
```

Response (200 OK):

```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: connected
data: {"job_id":"job_abc123"}

event: status
data: {"job_id":"job_abc123","status":"queued","progress":0}

event: status
data: {"job_id":"job_abc123","status":"processing","progress":25}

event: status
data: {"job_id":"job_abc123","status":"processing","progress":50}

event: status
data: {"job_id":"job_abc123","status":"processing","progress":75}

event: completed
data: {"job_id":"job_abc123","status":"completed","progress":100,"download_url":"https://s3.../file.zip","expires_at":"2025-12-19T10:00:00Z"}

event: heartbeat
data: {"timestamp":"2025-12-12T10:01:00Z"}
```

**3. Check Job Status (Polling) - FALLBACK**

```http
GET /v1/download/status/:job_id
```

Response (200 OK):

```json
{
  "job_id": "job_abc123",
  "status": "processing",
  "progress": 45,
  "created_at": "2025-12-12T10:00:00Z",
  "updated_at": "2025-12-12T10:00:30Z"
}
```

When completed:

```json
{
  "job_id": "job_abc123",
  "status": "completed",
  "progress": 100,
  "download_url": "https://s3.../file.zip?signature=...",
  "expires_at": "2025-12-19T10:00:00Z"
}
```

Status values: `queued`, `processing`, `completed`, `failed`

### 3.2 Database Schema

**Redis (Job Queue & Cache)**

```javascript
// 1. Job Queue (BullMQ manages this)
Queue: "download-queue"

// 2. Job Status Cache (for polling fallback)
Key: "job:status:{job_id}"
Value: {
  "job_id": "job_abc123",
  "status": "processing",
  "progress": 45,
  "created_at": "2025-12-12T10:00:00Z",
  "updated_at": "2025-12-12T10:00:30Z"
}
TTL: 86400 seconds (24 hours)

// 3. SSE Connections (track active subscribers)
Key: "sse:subscribers:{job_id}"
Value: Set of connection IDs ["conn_abc", "conn_def"]
TTL: 3600 seconds (1 hour)

// 4. Pub/Sub Channel (for broadcasting status updates to SSE connections)
Channel: "job:updates:{job_id}"
Message: {
  "event": "status",
  "data": {
    "job_id": "job_abc123",
    "status": "processing",
    "progress": 50
  }
}
```

### 3.3 Background Job Processing

**Queue Configuration:**

- Technology: BullMQ + Redis
- Concurrency: 5 workers, 10 jobs per worker
- Retry: 3 attempts with exponential backoff

**Worker Process:**

1. Pull job from queue
2. Update status to "processing"
3. Execute download (with simulated delay)
4. Upload result to S3
5. Generate presigned URL
6. Update status to "completed" with URL
7. Mark job as done

### 3.4 Error Handling

**Retry Strategy:**

- Max attempts: 3
- Backoff: Exponential (5s, 10s, 20s)
- Non-retryable errors: Invalid file_id
- Retryable errors: Network issues, S3 upload failures

### 3.5 Timeout Configuration

```javascript
const TIMEOUTS = {
  // API timeouts
  API_REQUEST: 30000, // 30s - Standard API requests

  // SSE timeouts
  SSE_CONNECTION: 300000, // 5min - Keep SSE connection alive
  SSE_HEARTBEAT_INTERVAL: 30000, // 30s - Send heartbeat to prevent timeout
  SSE_RECONNECT_DELAY: 3000, // 3s - Client reconnect delay

  // Polling timeouts (fallback)
  POLL_INTERVAL: 2000, // 2s - Polling frequency
  POLL_TIMEOUT: 10000, // 10s - Polling request timeout

  // Job processing
  JOB_PROCESSING: 300000, // 5min - Max job duration
  REDIS_COMMAND: 5000, // 5s - Redis operations

  // S3 operations
  S3_UPLOAD: 120000, // 2min - S3 operations
  PRESIGNED_URL_EXPIRY: 604800000, // 7 days - Download URL expiry
};
```

---

## 4. Proxy Configuration

### 4.1 Cloudflare

**Dashboard Settings:**

Navigate to: `Websites → [Your Domain] → Speed → Optimization`

```yaml
# Connection Settings
Connection Timeout: 100 seconds (Free/Pro/Business) - Works for SSE!
                   600 seconds (Enterprise only)

# Speed Settings
- HTTP/2: Enabled
- HTTP/3 (QUIC): Enabled
- WebSockets: Not required (SSE uses standard HTTP)

# Caching Settings
Browser Cache TTL: 4 hours (for static assets)
Edge Cache TTL: Bypass (for /v1/download/* endpoints)

# Page Rules (if needed)
Rule 1: *example.com/v1/download/subscribe/*
  - Cache Level: Bypass
  - Disable Performance
  - Disable Apps

Rule 2: *example.com/v1/download/*
  - Cache Level: Bypass
```

**Cloudflare Workers (Optional):**

```javascript
// workers/download-proxy.js
// Deploy this if you need custom routing or headers

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Forward download API requests to origin
    if (url.pathname.startsWith("/v1/download/")) {
      return fetch(request, {
        cf: {
          // Cloudflare-specific settings
          cacheTtl: 0, // Don't cache API responses
          cacheEverything: false,
        },
      });
    }

    // All other requests
    return fetch(request);
  },
};
```

**Why Polling Works with Cloudflare:**

- ✅ Each polling request completes in <1s (well under 100s timeout)
- ✅ No long-lived connections needed
- ✅ Works on Free tier (no Enterprise upgrade required)
- ✅ No WebSocket support needed

---

### 4.2 nginx

**Complete Configuration:**

```nginx
# /etc/nginx/nginx.conf

http {
    # Upstream backend servers
    upstream download_api {
        least_conn;  # Use least connections load balancing
        server api-1:3000 max_fails=3 fail_timeout=30s;
        server api-2:3000 max_fails=3 fail_timeout=30s;
        server api-3:3000 max_fails=3 fail_timeout=30s;

        # Health check (nginx Plus only)
        # health_check interval=10s fails=3 passes=2;

        keepalive 32;  # Keep 32 connections alive
    }

    # Rate limiting zones
    limit_req_zone $binary_remote_addr zone=download_init:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=download_status:10m rate=100r/s;

    # Connection limits
    limit_conn_zone $binary_remote_addr zone=download_conn:10m;

    server {
        listen 80;
        server_name api.example.com;

        # Global settings
        client_max_body_size 10M;
        client_body_timeout 30s;
        client_header_timeout 30s;

        # CORS headers (if needed)
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type' always;

        # Health check endpoint
        location /health {
            proxy_pass http://download_api;
            proxy_connect_timeout 5s;
            proxy_send_timeout 5s;
            proxy_read_timeout 5s;

            access_log off;  # Don't log health checks
        }

        # Initiate download endpoint
        location /v1/download/initiate {
            proxy_pass http://download_api;

            # Timeouts (short since response is immediate)
            proxy_connect_timeout 10s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;

            # Buffering
            proxy_buffering on;
            proxy_buffer_size 4k;
            proxy_buffers 8 4k;

            # Headers
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";

            # HTTP version
            proxy_http_version 1.1;

            # Rate limiting
            limit_req zone=download_init burst=20 nodelay;
            limit_conn download_conn 10;
        }

        # SSE endpoint - PRIMARY (real-time updates)
        location ~ ^/v1/download/subscribe/(.+)$ {
            proxy_pass http://download_api;

            # SSE-specific settings
            proxy_http_version 1.1;
            proxy_set_header Connection "";

            # CRITICAL: Disable buffering for SSE
            proxy_buffering off;
            proxy_cache off;
            proxy_read_timeout 300s;     # 5min - Keep connection alive
            proxy_connect_timeout 10s;
            proxy_send_timeout 300s;

            # Headers
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

            # SSE headers
            add_header Content-Type text/event-stream;
            add_header Cache-Control no-cache;
            add_header X-Accel-Buffering no;

            # CORS for SSE
            add_header Access-Control-Allow-Origin *;
            add_header Access-Control-Allow-Methods GET;
        }

        # Status polling endpoint - FALLBACK
        location ~ ^/v1/download/status/(.+)$ {
            proxy_pass http://download_api;

            # Timeouts (very short for polling)
            proxy_connect_timeout 5s;
            proxy_send_timeout 10s;
            proxy_read_timeout 10s;

            # Buffering (minimal for small JSON responses)
            proxy_buffering on;
            proxy_buffer_size 4k;
            proxy_buffers 4 4k;

            # Headers
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header Connection "";

            proxy_http_version 1.1;

            # Rate limiting (higher for polling)
            limit_req zone=download_status burst=50 nodelay;
            limit_conn download_conn 50;

            # Optional caching for completed jobs
            proxy_cache_path /var/cache/nginx/download levels=1:2 keys_zone=download_cache:10m max_size=100m inactive=60m;
            proxy_cache download_cache;
            proxy_cache_key "$scheme$request_method$host$request_uri";
            proxy_cache_valid 200 5s;  # Cache for 5 seconds
            proxy_cache_bypass $http_cache_control;
            add_header X-Cache-Status $upstream_cache_status;
        }

        # Catch-all for other download endpoints
        location /v1/download/ {
            proxy_pass http://download_api;

            proxy_connect_timeout 10s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;

            proxy_buffering on;

            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

            proxy_http_version 1.1;
        }

        # Static assets (if serving frontend)
        location / {
            root /usr/share/nginx/html;
            try_files $uri $uri/ /index.html;
        }
    }
}
```

**Key nginx Settings Explained:**

| Setting                 | Value          | Why                                          |
| ----------------------- | -------------- | -------------------------------------------- |
| `proxy_buffering on`    | Enabled        | Buffer small responses, reduces backend load |
| `proxy_connect_timeout` | 5-10s          | Time to establish connection to backend      |
| `proxy_read_timeout`    | 10-30s         | Time to read response (polling is fast)      |
| `limit_req`             | 10-100 r/s     | Prevent abuse                                |
| `keepalive 32`          | 32 connections | Reuse connections to backend                 |
| `least_conn`            | Load balancing | Distribute load evenly                       |

---

### 4.3 AWS Application Load Balancer (ALB)

**CloudFormation Template:**

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: "ALB for Download API"

Resources:
  # Application Load Balancer
  DownloadALB:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Name: download-api-alb
      Type: application
      Scheme: internet-facing
      IpAddressType: ipv4
      SecurityGroups:
        - !Ref ALBSecurityGroup
      Subnets:
        - !Ref PublicSubnet1
        - !Ref PublicSubnet2
      Tags:
        - Key: Name
          Value: download-api-alb

  # Target Group for API servers
  DownloadAPITargetGroup:
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
    Properties:
      Name: download-api-targets
      Port: 3000
      Protocol: HTTP
      VpcId: !Ref VPC
      TargetType: ip

      # Health Check Settings
      HealthCheckEnabled: true
      HealthCheckProtocol: HTTP
      HealthCheckPath: /health
      HealthCheckIntervalSeconds: 30
      HealthCheckTimeoutSeconds: 5
      HealthyThresholdCount: 2
      UnhealthyThresholdCount: 3
      Matcher:
        HttpCode: 200

      # Connection Settings
      DeregistrationDelay: 30

      # Stickiness (optional)
      TargetGroupAttributes:
        - Key: stickiness.enabled
          Value: false
        - Key: deregistration_delay.timeout_seconds
          Value: 30
        - Key: stickiness.type
          Value: lb_cookie
        - Key: load_balancing.algorithm.type
          Value: least_outstanding_requests

  # HTTPS Listener
  HTTPSListener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Properties:
      LoadBalancerArn: !Ref DownloadALB
      Port: 443
      Protocol: HTTPS
      SslPolicy: ELBSecurityPolicy-TLS-1-2-2017-01
      Certificates:
        - CertificateArn: !Ref SSLCertificate
      DefaultActions:
        - Type: forward
          TargetGroupArn: !Ref DownloadAPITargetGroup

  # HTTP Listener (redirect to HTTPS)
  HTTPListener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Properties:
      LoadBalancerArn: !Ref DownloadALB
      Port: 80
      Protocol: HTTP
      DefaultActions:
        - Type: redirect
          RedirectConfig:
            Protocol: HTTPS
            Port: 443
            StatusCode: HTTP_301

  # Security Group for ALB
  ALBSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupName: download-alb-sg
      GroupDescription: Security group for download API ALB
      VpcId: !Ref VPC
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 80
          ToPort: 80
          CidrIp: 0.0.0.0/0
          Description: HTTP from anywhere
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: 0.0.0.0/0
          Description: HTTPS from anywhere
      SecurityGroupEgress:
        - IpProtocol: -1
          CidrIp: 0.0.0.0/0
```

**Key ALB Settings:**

| Setting                 | Value                      | Purpose                                   |
| ----------------------- | -------------------------- | ----------------------------------------- |
| Health Check Interval   | 30s                        | Check backend health every 30s            |
| Deregistration Delay    | 30s                        | Wait 30s before removing unhealthy target |
| Connection Idle Timeout | 60s (default)              | Fine for polling (each request < 1s)      |
| Algorithm               | Least Outstanding Requests | Better load distribution                  |

**Why Polling Works with ALB:**

- ✅ Default 60s idle timeout is sufficient (each poll completes in <1s)
- ✅ No special configuration needed
- ✅ Built-in health checks keep only healthy backends in rotation
- ✅ Connection draining ensures graceful deploys

---

### 4.4 Comparison & Recommendations

| Proxy          | Best For                    | Timeout Limit              | Complexity | Cost                |
| -------------- | --------------------------- | -------------------------- | ---------- | ------------------- |
| **Cloudflare** | Simple setups, CDN benefits | 100s (Free)                | Low        | Free tier available |
| **nginx**      | Full control, on-premise    | Configurable (no limit)    | Medium     | Self-hosted         |
| **AWS ALB**    | AWS-native, auto-scaling    | 60s default (configurable) | Low        | ~$25/month          |

**Recommendation:**

- **Start with Cloudflare** (easiest, free tier works)
- **Add nginx** if you need advanced features (caching, rate limiting)
- **Use ALB** if you're already on AWS (simplest AWS setup)

---

## 5. Frontend Integration

### 5.1 React Hook (SSE Primary, Polling Fallback)

```typescript
// hooks/useDownload.ts
import { useState, useEffect, useRef } from "react";

export function useDownload(fileId: number) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionType, setConnectionType] = useState<"sse" | "polling">(
    "sse",
  );

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initiate download
  const initiateDownload = async () => {
    try {
      const response = await fetch("/v1/download/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
      });

      const data = await response.json();
      setJobId(data.job_id);
      setStatus(data.status);

      // Try SSE first, fallback to polling
      connectSSE(data.job_id);
    } catch (err) {
      setError(err.message);
    }
  };

  // PRIMARY: Connect to SSE for real-time updates
  const connectSSE = (jobId: string) => {
    // Check if SSE is supported
    if (typeof EventSource === "undefined") {
      console.warn(
        "[SSE] Not supported in this browser, falling back to polling",
      );
      setConnectionType("polling");
      startPolling(jobId);
      return;
    }

    try {
      const eventSource = new EventSource(`/v1/download/subscribe/${jobId}`);
      eventSourceRef.current = eventSource;
      setConnectionType("sse");

      // Connection established
      eventSource.addEventListener("connected", (e) => {
        console.log("[SSE] Connected:", e.data);
      });

      // Status updates
      eventSource.addEventListener("status", (e) => {
        const data = JSON.parse(e.data);
        setStatus(data.status);
        setProgress(data.progress || 0);
      });

      // Completed event
      eventSource.addEventListener("completed", (e) => {
        const data = JSON.parse(e.data);
        setStatus("completed");
        setProgress(100);
        setDownloadUrl(data.download_url);
        eventSource.close();
      });

      // Failed event
      eventSource.addEventListener("failed", (e) => {
        const data = JSON.parse(e.data);
        setStatus("failed");
        setError(data.error || "Download failed");
        eventSource.close();
      });

      // Heartbeat (keep-alive)
      eventSource.addEventListener("heartbeat", (e) => {
        console.debug("[SSE] Heartbeat:", e.data);
      });

      // Error handling
      eventSource.onerror = (err) => {
        console.error("[SSE] Connection error:", err);
        eventSource.close();

        // Fallback to polling
        console.log("[SSE] Falling back to polling...");
        setConnectionType("polling");
        startPolling(jobId);
      };
    } catch (err) {
      console.error("[SSE] Failed to establish connection:", err);
      setConnectionType("polling");
      startPolling(jobId);
    }
  };

  // FALLBACK: Polling for browsers without SSE or connection issues
  const startPolling = (jobId: string) => {
    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    const pollStatus = async () => {
      try {
        const response = await fetch(`/v1/download/status/${jobId}`);
        const data = await response.json();

        setStatus(data.status);
        setProgress(data.progress || 0);

        // Stop polling if completed or failed
        if (data.status === "completed") {
          setDownloadUrl(data.download_url);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
        } else if (data.status === "failed") {
          setError(data.error || "Download failed");
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
        }
      } catch (err) {
        console.error("[Polling] Error:", err);
      }
    };

    // Poll every 2 seconds
    pollingIntervalRef.current = setInterval(pollStatus, 2000);

    // Initial poll
    pollStatus();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  return {
    initiateDownload,
    status,
    progress,
    downloadUrl,
    error,
    connectionType, // 'sse' or 'polling'
  };
}
```

### 5.2 UI Component

```typescript
// components/DownloadButton.tsx
import { useDownload } from '@/hooks/useDownload';

export function DownloadButton({ fileId }: { fileId: number }) {
  const { initiateDownload, status, progress, downloadUrl, error, connectionType } = useDownload(fileId);

  if (status === 'idle') {
    return (
      <button onClick={initiateDownload}>
        Download File
      </button>
    );
  }

  if (status === 'queued' || status === 'processing') {
    return (
      <div>
        <p>{status === 'queued' ? 'Queued...' : 'Processing...'}</p>
        <progress value={progress} max={100} />
        <p>{progress}%</p>

        {/* Show connection type */}
        <small style={{ color: '#666' }}>
          {connectionType === 'sse' ? '⚡ Real-time' : '🔄 Polling'}
        </small>
      </div>
    );
  }

  if (status === 'completed' && downloadUrl) {
    return (
      <a href={downloadUrl} download>
        <button>Download Now</button>
      </a>
    );
  }

  if (error) {
    return (
      <div>
        <p>Error: {error}</p>
        <button onClick={initiateDownload}>Retry</button>
      </div>
    );
  }

  return null;
}
```

### 5.3 Retry Logic

```typescript
// Retry with exponential backoff
async function fetchWithRetry(url: string, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      // Don't retry 4xx errors
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      // Wait before retry: 1s, 2s, 4s
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * Math.pow(2, i)),
      );
    }
  }
}
```

---

## Summary

This architecture solves the long-running download problem by:

1. **Decoupling** request/response from processing using job queue
2. **Eliminating timeouts** by returning immediately with job_id
3. **Providing real-time progress** through SSE (Server-Sent Events)
4. **Resilient fallback** to polling if SSE fails or unsupported
5. **Enabling scalability** with independent worker processes
6. **Working reliably** behind any reverse proxy (Cloudflare, nginx, ALB)

**Key Technologies:**

- BullMQ + Redis for job queue and pub/sub
- Server-Sent Events (SSE) for real-time updates
- Polling as fallback mechanism
- MinIO/S3 for file storage
- Presigned URLs for direct downloads

**Benefits:**

- ✅ No timeout issues
- ✅ Real-time progress updates (SSE)
- ✅ Universal compatibility (polling fallback)
- ✅ Efficient (one connection vs repeated polling)
- ✅ Scales horizontally
- ✅ Works everywhere (Cloudflare Free tier compatible)

**Architecture Decision:**

- **Primary:** SSE for 97%+ of users (instant updates, efficient)
- **Fallback:** Polling for IE11 or connection issues (universal support)
