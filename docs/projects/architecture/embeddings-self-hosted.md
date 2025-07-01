---
description: "Step 4: Self-Hosted Embeddings - GPU-accelerated embeddings generation with OpenAI-compatible API, Docker deployment, and complete data sovereignty"
alwaysApply: false
---

# Step 4: Self-Hosted Embeddings

**Prerequisites**:

- [Step 1: Convex Database Foundation](../structure/convex-database.md) - For rate limiting and analytics
- [Step 2: Core AI Services](../structure/ai-core-services.md) - For unified AI service patterns
- [Step 3: Advanced AI Features](../structure/ai-shared-services.md) - Optional, for integration patterns

This document outlines the architecture for self-hosted embeddings generation using GPU-accelerated Docker containers deployed via Coolify and similar platforms. The system provides OpenAI-compatible API endpoints while maintaining complete control over data privacy and processing costs.

## 🎯 Design Goals

1. **OpenAI API Compatibility**: Drop-in replacement for OpenAI embeddings API
2. **GPU Acceleration**: Leverage NVIDIA GPUs for high-performance inference
3. **Container-Based**: Docker containers for easy deployment and scaling
4. **Self-Hosted**: Complete data sovereignty and privacy
5. **Cost Efficiency**: Reduce embeddings costs by 90%+ vs cloud providers
6. **High Availability**: Multi-container deployment with load balancing

## 🏗️ Architecture Components

### 1. Embedding Models Selection

#### Recommended Models for Self-Hosting

| Model | Size | Dimensions | Performance | Use Case |
|-------|------|------------|-------------|----------|
| **all-MiniLM-L6-v2** | 22M params | 384 | Fast (50ms/batch) | General purpose, semantic search |
| **all-mpnet-base-v2** | 110M params | 768 | Balanced (100ms/batch) | High quality semantic search |
| **bge-large-en-v1.5** | 335M params | 1024 | High quality (200ms/batch) | Premium semantic search |
| **e5-large-v2** | 335M params | 1024 | State-of-art (250ms/batch) | Best quality, multilingual |
| **gte-large** | 350M params | 1024 | Excellent (220ms/batch) | General + code understanding |

#### Model Selection Criteria

```yaml
# embeddings-config.yaml
model_selection:
  primary_model: "all-mpnet-base-v2"  # Balance of speed/quality
  fallback_model: "all-MiniLM-L6-v2"  # Fast fallback
  
  criteria:
    - max_sequence_length: 512  # OpenAI compatible
    - min_batch_size: 32        # GPU efficiency
    - output_dimensions: 768    # Storage considerations
    - quantization: "int8"      # Memory optimization
```

### 2. Container Architecture

#### Base Docker Image

```dockerfile
# Dockerfile.embeddings
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

# Security: Create non-root user
RUN groupadd -g 1000 appuser && \
    useradd -r -u 1000 -g appuser appuser

# Install Python and dependencies
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3-pip \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install ML dependencies
RUN pip3 install --no-cache-dir \
    torch==2.1.2+cu121 \
    transformers==4.36.2 \
    sentence-transformers==2.3.1 \
    fastapi==0.109.0 \
    uvicorn[standard]==0.27.0 \
    pydantic==2.5.3 \
    numpy==1.26.3 \
    aiofiles==23.2.1 \
    prometheus-client==0.19.0

# Model cache directory
ENV HF_HOME=/models
VOLUME /models

# Copy application
WORKDIR /app
COPY --chown=appuser:appuser . /app

# Security: Set ownership and permissions
RUN chown -R appuser:appuser /models /app && \
    chmod -R 755 /app && \
    chmod -R 700 /models

# Switch to non-root user
USER appuser

# OpenAI-compatible API port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
```

#### API Implementation

```python
# main.py - OpenAI-compatible embeddings API with Security
from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, validator
from typing import List, Optional, Union
import torch
from sentence_transformers import SentenceTransformer
import numpy as np
from prometheus_client import Counter, Histogram, generate_latest
import asyncio
import time
import os
import secrets
import hashlib
import json
from datetime import datetime, timedelta
import re

app = FastAPI(title="Self-Hosted Embeddings API")
security = HTTPBearer()

# Security: API key validation
VALID_API_KEYS = set(os.getenv('API_KEYS', '').split(',')) if os.getenv('API_KEYS') else {secrets.token_urlsafe(32)}
INJECTION_PATTERNS = re.compile(r'(\bignore\s+previous\b|\bsystem\s+prompt\b|\bdisregard\s+instructions\b)', re.IGNORECASE)

# Metrics
embeddings_counter = Counter('embeddings_requests_total', 'Total embedding requests')
embeddings_histogram = Histogram('embeddings_duration_seconds', 'Embedding generation duration')
batch_size_histogram = Histogram('embeddings_batch_size', 'Batch size distribution')

# Model loading with GPU support
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = None

# Convex client for rate limiting (self-hosted)
from convex import ConvexClient
convex_client = ConvexClient(os.getenv('CONVEX_URL', 'http://localhost:3210'))

# Request tracking for analytics
request_tracker = []

class EmbeddingRequest(BaseModel):
    input: Union[str, List[str]]
    model: str = "text-embedding-ada-002"  # OpenAI compatibility
    encoding_format: Optional[str] = "float"
    user: Optional[str] = None
    
    @validator('input')
    def validate_input(cls, v):
        """Security: Validate input against injection attacks"""
        texts = v if isinstance(v, list) else [v]
        for text in texts:
            if len(text) > 8192:
                raise ValueError("Text exceeds maximum length of 8192 characters")
            if INJECTION_PATTERNS.search(text):
                raise ValueError("Input contains potential injection patterns")
        return v

class EmbeddingResponse(BaseModel):
    object: str = "list"
    data: List[dict]
    model: str
    usage: dict

async def verify_api_key(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Security: Verify API key authentication with rate limiting"""
    token = credentials.credentials
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    
    # Check against valid keys
    if token not in VALID_API_KEYS:
        # Log failed auth attempt to Convex
        await log_auth_failure(token_hash)
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    # Check rate limits for this API key
    rate_limit_ok = await check_api_key_rate_limit(token_hash)
    if not rate_limit_ok:
        raise HTTPException(
            status_code=429, 
            detail="API key rate limit exceeded",
            headers={"Retry-After": "60"}
        )
    
    return token

async def log_auth_failure(key_hash: str):
    """Log failed authentication attempts for bot detection"""
    try:
        await convex_client.mutation("embeddings:logAuthFailure", {
            "keyHash": key_hash,
            "timestamp": time.time()
        })
    except Exception as e:
        print(f"Failed to log auth failure: {e}")

async def check_api_key_rate_limit(key_hash: str) -> bool:
    """Check rate limits using Convex"""
    try:
        result = await convex_client.query("embeddings:checkRateLimit", {
            "keyHash": key_hash,
            "window": 3600  # 1 hour
        })
        return result.get("allowed", True)
    except Exception:
        # Fail open if Convex is unavailable
        return True

@app.on_event("startup")
async def load_model():
    global model
    model_name = os.getenv('EMBEDDING_MODEL', 'sentence-transformers/all-mpnet-base-v2')
    model = SentenceTransformer(model_name, device=device)
    model.eval()
    
    # Security: Log startup with model info
    print(f"Model loaded: {model_name} on {device}")
    print(f"API Keys configured: {len(VALID_API_KEYS)}")
    
    # Warm up GPU
    with torch.no_grad():
        _ = model.encode(["warmup"], convert_to_tensor=True)

@app.post("/v1/embeddings")
@app.post("/embeddings")  # Compatibility
async def create_embeddings(
    request: EmbeddingRequest,
    api_key: str = Depends(verify_api_key),
    x_request_id: Optional[str] = Header(None)
):
    embeddings_counter.inc()
    start_time = time.time()
    
    # Convert input to list
    texts = request.input if isinstance(request.input, list) else [request.input]
    batch_size_histogram.observe(len(texts))
    
    try:
        # Generate embeddings with GPU acceleration
        with torch.no_grad():
            embeddings = model.encode(
                texts,
                convert_to_tensor=True,
                device=device,
                batch_size=min(32, len(texts)),
                show_progress_bar=False
            )
        
        # Convert to numpy for JSON serialization
        if request.encoding_format == "base64":
            # Base64 encoding for bandwidth optimization
            import base64
            embeddings_list = [
                base64.b64encode(emb.cpu().numpy().astype(np.float32).tobytes()).decode('utf-8')
                for emb in embeddings
            ]
        else:
            embeddings_list = embeddings.cpu().numpy().tolist()
        
        # Format response (OpenAI compatible)
        response_data = [
            {
                "object": "embedding",
                "embedding": emb,
                "index": i
            }
            for i, emb in enumerate(embeddings_list)
        ]
        
        # Token counting approximation
        total_tokens = sum(len(text.split()) * 1.3 for text in texts)
        
        embeddings_histogram.observe(time.time() - start_time)
        
        # Security: Audit logging to Convex
        if x_request_id:
            await log_embedding_request({
                "requestId": x_request_id,
                "apiKeyHash": hashlib.sha256(api_key.encode()).hexdigest(),
                "batchSize": len(texts),
                "latencyMs": int((time.time() - start_time) * 1000),
                "tokensUsed": int(total_tokens),
                "success": True
            })

async def log_embedding_request(data: dict):
    """Log embedding requests for analytics"""
    try:
        await convex_client.mutation("embeddings:logRequest", data)
    except Exception as e:
        print(f"Failed to log request: {e}")
        
        return EmbeddingResponse(
            data=response_data,
            model=request.model,
            usage={
                "prompt_tokens": int(total_tokens),
                "total_tokens": int(total_tokens)
            }
        )
    
    except ValueError as e:
        # Security validation errors
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Log error securely (no sensitive data)
        print(f"Error processing request: {type(e).__name__}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "device": str(device),
        "model_loaded": model is not None,
        "gpu_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    }

@app.get("/metrics")
async def metrics():
    return generate_latest()
```

### 3. Coolify Deployment Configuration

#### docker-compose.yml for Coolify

```yaml
version: '3.8'

services:
  embeddings-api:
    build:
      context: .
      dockerfile: Dockerfile.embeddings
    deploy:
      replicas: 2
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
        limits:
          memory: 8G
          cpus: '4.0'
    environment:
      - EMBEDDING_MODEL=sentence-transformers/all-mpnet-base-v2
      - CUDA_VISIBLE_DEVICES=0
      - PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
      - HF_HOME=/models
      - MODEL_CACHE_DIR=/models
      # Security: API keys should be in secrets, not env vars
      - API_KEYS_FILE=/run/secrets/api_keys
    secrets:
      - api_keys
    volumes:
      - embeddings-models:/models:ro  # Read-only
      - embeddings-cache:/app/.cache
    ports:
      - "8080:8080"
    security_opt:
      - no-new-privileges:true
    read_only: true  # Read-only root filesystem
    tmpfs:
      - /tmp:noexec,nosuid,size=1G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    networks:
      - embeddings-net

  nginx-loadbalancer:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - embeddings-api
    networks:
      - embeddings-net

secrets:
  api_keys:
    external: true  # Managed by Docker/Kubernetes secrets

volumes:
  embeddings-models:
    driver: local
  embeddings-cache:
    driver: local

networks:
  embeddings-net:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.name: embeddings0
      com.docker.network.driver.mtu: 1450  # For cloud environments
```

#### NGINX Load Balancer Configuration

```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    upstream embeddings_backend {
        least_conn;
        server embeddings-api:8080 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    # Security headers
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Enhanced rate limiting with multiple zones
    limit_req_zone $binary_remote_addr zone=embeddings_limit:10m rate=10r/s;
    limit_req_zone $http_authorization zone=embeddings_auth_limit:10m rate=100r/s;
    limit_req_zone $request_uri zone=embeddings_uri_limit:10m rate=50r/s;
    limit_req_status 429;
    
    # Bot detection maps
    map $http_user_agent $is_bot {
        default 0;
        ~*bot 1;
        ~*crawler 1;
        ~*spider 1;
        ~*scraper 1;
        ~*(GPTBot|Claude-Web|ChatGPT|CCBot|anthropic-ai|PerplexityBot) 1;
    }

    server {
        listen 80;
        server_name embeddings.yourdomain.com;
        return 301 https://$server_name$request_uri;  # Force HTTPS
    }

    server {
        listen 443 ssl http2;
        server_name embeddings.yourdomain.com;

        # SSL configuration (managed by Certbot/Let's Encrypt)
        ssl_certificate /etc/letsencrypt/live/embeddings.yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/embeddings.yourdomain.com/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        location / {
            # Multi-layer rate limiting
            limit_req zone=embeddings_limit burst=20 nodelay;
            limit_req zone=embeddings_auth_limit burst=50 nodelay;
            
            # Block detected bots
            if ($is_bot) {
                return 403 "Bot detected";
            }
            
            # Security: Request size limit
            client_max_body_size 1M;
            
            proxy_pass http://embeddings_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Request-ID $request_id;
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
            proxy_buffering off;
        }

        location /health {
            access_log off;
            proxy_pass http://embeddings_backend/health;
        }
    }
}
```

### 4. Database Integration

> **📊 Complete Documentation**: Database schemas, rate limiting, and analytics functions are documented in [Step 1: Convex Database Foundation](../structure/convex-database.md#embeddings-service-tables).

The embeddings service uses the same Convex infrastructure from Step 1:

- **Tables**: `embeddingApiKeys`, `embeddingRequests`, `embeddingAuthFailures`
- **Rate Limiting**: Shared rate limiter with AI services
- **Analytics**: Unified logging and monitoring

### 5. Integration with AI Services

The embeddings service integrates seamlessly with the AI services from Steps 2-3:

1. **Unified Provider Interface**: Same pattern as `AIProvider` from [Step 2](../structure/ai-core-services.md)
2. **OpenAI Compatibility**: Drop-in replacement using `/v1/embeddings` endpoint
3. **Shared Infrastructure**: Rate limiting, retry logic, and error handling from Step 1
4. **Fallback Support**: Easy migration path with OpenAI provider fallback

### 5. Performance Optimization

#### GPU Optimization Strategies

1. **Memory-Efficient Attention**: Enable Flash Attention and memory-efficient SDP
2. **Automatic Batching**: Process texts in batches of 32 for optimal GPU utilization
3. **Mixed Precision**: Use FP16 inference for 2x memory reduction
4. **Torch Compilation**: 20-30% speedup with `torch.compile(mode="reduce-overhead")`
5. **Periodic Cache Clearing**: Prevent GPU memory fragmentation

#### Caching Strategy

- **30-day TTL**: Long-lived cache for stable embeddings
- **SHA-256 Keys**: 16-char hash keys for efficient storage
- **Batch Support**: Process cached and uncached texts separately
- **Automatic Merging**: Seamlessly combine cached and fresh embeddings

### 6. Monitoring and Observability

#### Key Metrics

- **Requests per Second**: `rate(embeddings_requests_total[1m])`
- **P95 Latency**: `histogram_quantile(0.95, rate(embeddings_duration_seconds_bucket[5m]))`
- **Batch Size**: Average texts per request
- **GPU Memory**: `nvidia_smi_memory_used_bytes / nvidia_smi_memory_total_bytes`
- **Cache Hit Rate**: Monitor embedding cache efficiency

Prometheus scrapes metrics every 5s from `embeddings-api:8080/metrics`.

### 7. Cost Analysis and Scaling

#### Cost Comparison

| Provider | Cost per 1M tokens | Latency | Privacy | Control |
|----------|-------------------|---------|---------|---------|
| OpenAI text-embedding-3-small | $0.02 | 50-200ms | Cloud | Limited |
| OpenAI text-embedding-3-large | $0.13 | 100-300ms | Cloud | Limited |
| Self-Hosted (T4 GPU) | ~$0.001 | 20-50ms | On-premise | Full |
| Self-Hosted (A10G GPU) | ~$0.002 | 10-30ms | On-premise | Full |

#### Scaling Strategy

**Kubernetes HPA Configuration:**

- **Min Replicas**: 2 (high availability)
- **Max Replicas**: 10 (based on load)
- **Scale Metric**: 100 requests/second per pod
- **GPU Assignment**: 1 GPU per pod
- **Memory**: 6-8GB per pod
- **Health Checks**: Readiness (10s), Liveness (30s)

### 8. Migration Path

#### Phase 1: Parallel Operation

- Deploy self-hosted alongside OpenAI
- Route 10% traffic to self-hosted
- Monitor quality and performance

#### Phase 2: Gradual Migration

- Increase self-hosted traffic to 50%
- A/B test embedding quality
- Optimize model selection

#### Phase 3: Full Migration

- Route 100% traffic to self-hosted
- Keep OpenAI as fallback
- Document cost savings

### 9. Security Considerations

#### Critical Security Requirements

1. **Mandatory Authentication** (CRITICAL - Must implement before deployment)
   - Bearer token authentication with rotating keys
   - Rate limiting per API key
   - Request signing for inter-service communication

2. **Container Security**
   - Run as non-root user (uid: 1000)
   - Drop all capabilities except compute
   - Read-only root filesystem
   - Security scanning in CI/CD

3. **Network Security**
   - mTLS for service-to-service communication
   - Network policies restricting egress
   - WAF rules for injection protection

4. **Secrets Management**
   - API keys in AWS Secrets Manager/HashiCorp Vault
   - Automatic rotation every 30 days
   - Never in environment variables or config files

5. **Input Validation**
   - Maximum text length: 8192 characters
   - Sanitization for prompt injection attempts
   - Request size limits: 1MB max

### 10. Future Enhancements

1. **Multi-Modal Embeddings**: Support for image/text embeddings
2. **Custom Fine-Tuning**: Domain-specific model training
3. **Quantization**: INT8/INT4 for 4x memory reduction
4. **Edge Deployment**: WebAssembly for client-side embeddings
5. **Vector Database Integration**: Direct Pinecone/Weaviate support

## Implementation Checklist

- [ ] Set up GPU-enabled Docker environment
- [ ] Configure Coolify deployment
- [ ] Implement OpenAI-compatible API
- [ ] Set up monitoring stack
- [ ] Configure caching layer
- [ ] Load test with production workloads
- [ ] Implement gradual migration
- [ ] Document API compatibility
- [ ] Set up backup/fallback strategy
- [ ] Monitor cost savings

## Conclusion

This architecture provides a production-ready, cost-effective solution for self-hosted embeddings generation with full OpenAI API compatibility. The system can reduce embedding costs by 95%+ while providing better latency and complete data privacy.

## 🔄 Integration with Steps 1-3

This embeddings service builds on the foundation from previous steps:

### From Step 1 (Convex Database)

- **Rate Limiting**: Uses `selfHostedEmbeddings` rate limit configuration
- **Analytics Tables**: `embeddingApiKeys`, `embeddingRequests`, `embeddingAuthFailures`
- **Monitoring**: Same Convex dashboard and analytics queries

### From Step 2 (Core AI Services)

- **Type Definitions**: Extends types from `@/lib/ai/types.ts`
- **HTTP Patterns**: Same streaming and error handling patterns
- **API Design**: OpenAI-compatible endpoints

### From Step 3 (Advanced Features)

- **Provider Pattern**: Can be added as an `EmbeddingProvider`
- **Circuit Breaker**: Same fault tolerance patterns
- **Secrets Management**: Compatible with AWS Secrets Manager approach

### Integration with Step 5 (Web Search)

- **Embedding Search Results**: Can embed search results for semantic search
- **RAG Pipeline**: Combine embeddings with real-time search for grounded responses
