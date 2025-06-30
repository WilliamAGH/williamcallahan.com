# Self-Hosted Embeddings Generation Architecture

## Overview

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

# Install Python and dependencies
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3-pip \
    git \
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
COPY . /app

# OpenAI-compatible API port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
```

#### API Implementation

```python
# main.py - OpenAI-compatible embeddings API
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Union
import torch
from sentence_transformers import SentenceTransformer
import numpy as np
from prometheus_client import Counter, Histogram, generate_latest
import asyncio
import time

app = FastAPI(title="Self-Hosted Embeddings API")

# Metrics
embeddings_counter = Counter('embeddings_requests_total', 'Total embedding requests')
embeddings_histogram = Histogram('embeddings_duration_seconds', 'Embedding generation duration')
batch_size_histogram = Histogram('embeddings_batch_size', 'Batch size distribution')

# Model loading with GPU support
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = None

class EmbeddingRequest(BaseModel):
    input: Union[str, List[str]]
    model: str = "text-embedding-ada-002"  # OpenAI compatibility
    encoding_format: Optional[str] = "float"
    user: Optional[str] = None

class EmbeddingResponse(BaseModel):
    object: str = "list"
    data: List[dict]
    model: str
    usage: dict

@app.on_event("startup")
async def load_model():
    global model
    model_name = os.getenv('EMBEDDING_MODEL', 'sentence-transformers/all-mpnet-base-v2')
    model = SentenceTransformer(model_name, device=device)
    model.eval()
    
    # Warm up GPU
    with torch.no_grad():
        _ = model.encode(["warmup"], convert_to_tensor=True)

@app.post("/v1/embeddings")
@app.post("/embeddings")  # Compatibility
async def create_embeddings(request: EmbeddingRequest):
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
        
        return EmbeddingResponse(
            data=response_data,
            model=request.model,
            usage={
                "prompt_tokens": int(total_tokens),
                "total_tokens": int(total_tokens)
            }
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
    volumes:
      - embeddings-models:/models
      - embeddings-cache:/app/.cache
    ports:
      - "8080:8080"
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

volumes:
  embeddings-models:
    driver: local
  embeddings-cache:
    driver: local

networks:
  embeddings-net:
    driver: bridge
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

    server {
        listen 80;
        server_name embeddings.yourdomain.com;

        location / {
            proxy_pass http://embeddings_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
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

### 4. Integration with Existing AI Services

#### Updated UnifiedAIService Integration

```typescript
// lib/ai/providers/self-hosted-embeddings.ts
import { assertServerOnly } from '@/lib/utils/server-only';
import { waitForPermit } from '@/lib/rate-limiter';
import { retryWithDomainConfig } from '@/lib/utils/retry';
import { createCategorizedError } from '@/lib/utils/error-utils';

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  embedSingle(text: string): Promise<number[]>;
}

export class SelfHostedEmbeddingProvider implements EmbeddingProvider {
  private baseUrl: string;
  private apiKey?: string;
  
  constructor() {
    assertServerOnly();
    this.baseUrl = process.env.SELF_HOSTED_EMBEDDINGS_URL || 'http://embeddings:8080';
    this.apiKey = process.env.SELF_HOSTED_EMBEDDINGS_KEY;
  }

  async embed(texts: string[]): Promise<number[][]> {
    await waitForPermit('self-hosted-embeddings');
    
    return retryWithDomainConfig(
      async () => {
        const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
          },
          body: JSON.stringify({
            input: texts,
            model: 'text-embedding-ada-002', // OpenAI compatibility
          }),
        });

        if (!response.ok) {
          throw createCategorizedError(
            new Error(`Embeddings API error: ${response.status}`),
            'ai',
            { status: response.status }
          );
        }

        const data = await response.json();
        return data.data.map((item: any) => item.embedding);
      },
      'AI_PROVIDERS'
    ) || Promise.reject(new Error('Embeddings generation failed'));
  }

  async embedSingle(text: string): Promise<number[]> {
    const results = await this.embed([text]);
    return results[0];
  }
}

// Fallback to OpenAI for comparison/migration
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private client: OpenAI;
  
  constructor() {
    assertServerOnly();
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async embed(texts: string[]): Promise<number[][]> {
    await waitForPermit('openai');
    
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });
    
    return response.data.map(item => item.embedding);
  }

  async embedSingle(text: string): Promise<number[]> {
    const results = await this.embed([text]);
    return results[0];
  }
}
```

### 5. Performance Optimization Strategies

#### GPU Memory Management

```python
# gpu_optimization.py
import torch
from typing import List, Optional
import gc

class OptimizedEmbeddingModel:
    def __init__(self, model_name: str, max_batch_size: int = 32):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = SentenceTransformer(model_name, device=self.device)
        self.model.eval()
        self.max_batch_size = max_batch_size
        
        # Enable memory efficient attention if available
        if hasattr(torch.nn.functional, 'scaled_dot_product_attention'):
            torch.backends.cuda.enable_flash_sdp(True)
            torch.backends.cuda.enable_mem_efficient_sdp(True)
    
    @torch.no_grad()
    def encode_batch(self, texts: List[str]) -> torch.Tensor:
        """Encode texts with automatic batching for GPU efficiency"""
        embeddings = []
        
        for i in range(0, len(texts), self.max_batch_size):
            batch = texts[i:i + self.max_batch_size]
            batch_embeddings = self.model.encode(
                batch,
                convert_to_tensor=True,
                device=self.device,
                show_progress_bar=False
            )
            embeddings.append(batch_embeddings)
            
            # Clear GPU cache periodically
            if i % (self.max_batch_size * 10) == 0:
                torch.cuda.empty_cache()
        
        return torch.cat(embeddings, dim=0)
    
    def optimize_for_inference(self):
        """Apply inference optimizations"""
        # Compile model with torch.compile for 20-30% speedup
        if hasattr(torch, 'compile'):
            self.model = torch.compile(self.model, mode="reduce-overhead")
        
        # Enable mixed precision for memory efficiency
        self.model.half()  # FP16 inference
```

#### Caching Layer

```typescript
// lib/ai/embeddings-cache.ts
import { ServerCache } from '@/lib/cache';
import { createHash } from 'crypto';

export class EmbeddingsCache {
  private cache: ServerCache;
  private ttl = 30 * 24 * 60 * 60; // 30 days
  
  constructor() {
    this.cache = new ServerCache({
      prefix: 'embeddings:',
      defaultTtl: this.ttl,
    });
  }
  
  private getCacheKey(text: string): string {
    return createHash('sha256').update(text).digest('hex').substring(0, 16);
  }
  
  async getOrGenerate(
    text: string,
    generator: () => Promise<number[]>
  ): Promise<number[]> {
    const key = this.getCacheKey(text);
    
    const cached = await this.cache.get<number[]>(key);
    if (cached) return cached;
    
    const embedding = await generator();
    await this.cache.set(key, embedding, this.ttl);
    
    return embedding;
  }
  
  async getBatch(
    texts: string[],
    generator: (uncached: string[]) => Promise<number[][]>
  ): Promise<number[][]> {
    const keys = texts.map(t => this.getCacheKey(t));
    const cached = await Promise.all(
      keys.map(k => this.cache.get<number[]>(k))
    );
    
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];
    
    cached.forEach((result, i) => {
      if (!result) {
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i]);
      }
    });
    
    if (uncachedTexts.length === 0) {
      return cached as number[][];
    }
    
    const newEmbeddings = await generator(uncachedTexts);
    
    // Cache new embeddings
    await Promise.all(
      uncachedIndices.map((originalIndex, i) =>
        this.cache.set(
          keys[originalIndex],
          newEmbeddings[i],
          this.ttl
        )
      )
    );
    
    // Merge results
    const results = [...cached];
    uncachedIndices.forEach((originalIndex, i) => {
      results[originalIndex] = newEmbeddings[i];
    });
    
    return results as number[][];
  }
}
```

### 6. Monitoring and Observability

#### Prometheus Metrics Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'embeddings-api'
    static_configs:
      - targets: ['embeddings-api:8080']
    metrics_path: '/metrics'
    scrape_interval: 5s
```

#### Grafana Dashboard Configuration

```json
{
  "dashboard": {
    "title": "Self-Hosted Embeddings Monitor",
    "panels": [
      {
        "title": "Requests per Second",
        "targets": [
          {
            "expr": "rate(embeddings_requests_total[1m])"
          }
        ]
      },
      {
        "title": "P95 Latency",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(embeddings_duration_seconds_bucket[5m]))"
          }
        ]
      },
      {
        "title": "Batch Size Distribution",
        "targets": [
          {
            "expr": "histogram_quantile(0.5, rate(embeddings_batch_size_bucket[5m]))"
          }
        ]
      },
      {
        "title": "GPU Memory Usage",
        "targets": [
          {
            "expr": "nvidia_smi_memory_used_bytes / nvidia_smi_memory_total_bytes * 100"
          }
        ]
      }
    ]
  }
}
```

### 7. Cost Analysis and Scaling

#### Cost Comparison

| Provider | Cost per 1M tokens | Latency | Privacy | Control |
|----------|-------------------|---------|---------|---------|
| OpenAI text-embedding-3-small | $0.02 | 50-200ms | Cloud | Limited |
| OpenAI text-embedding-3-large | $0.13 | 100-300ms | Cloud | Limited |
| Self-Hosted (T4 GPU) | ~$0.001 | 20-50ms | On-premise | Full |
| Self-Hosted (A10G GPU) | ~$0.002 | 10-30ms | On-premise | Full |

#### Scaling Strategy

```yaml
# kubernetes-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: embeddings-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: embeddings-api
  template:
    spec:
      containers:
      - name: embeddings-api
        image: your-registry/embeddings-api:latest
        resources:
          limits:
            nvidia.com/gpu: 1
            memory: "8Gi"
            cpu: "4"
          requests:
            nvidia.com/gpu: 1
            memory: "6Gi"
            cpu: "2"
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          periodSeconds: 30
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: embeddings-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: embeddings-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Pods
    pods:
      metric:
        name: embeddings_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"
```

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

1. **API Authentication**: Optional bearer token support
2. **Network Isolation**: Container network segregation
3. **TLS Termination**: NGINX handles HTTPS
4. **Model Access**: Read-only model volume
5. **Input Validation**: Pydantic models for API requests

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