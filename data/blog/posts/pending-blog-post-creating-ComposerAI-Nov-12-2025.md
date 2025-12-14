---
title: "Building an Email App Around OpenAI's Java SDK (Spring Boot + Svelte)"
slug: "building-email-openai-java-spring-boot-svelte"
excerpt: "A practical file tree, the exact SDKs, and the minimal DTOs/use-cases/services I defined to make OpenAI's Responses API work cleanly in a Java 21 + Spring Boot app—with quick provider swaps (OpenAI, OpenRouter, local llama.cpp)."
publishedAt: "2025-11-12"
updatedAt: "2025-11-12"
author: "william-callahan"
tags: ["java", "spring boot", "openai", "sse", "svelte", "clean architecture", "rag"]
coverImage: "/images/posts/composerai-architecture.png"
draft: true
---

I wanted a focused way to reason over inbox content—parse real emails, add retrieval when available, and stream a response that doesn’t surprise the UI. This post documents the minimal shape that made the OpenAI Java SDK slot neatly into a Spring Boot app with Svelte on the front-end.

Highlights:

- One source of truth for LLM config (model, base URL, prompts, timeouts)
- Thin controllers, typed DTOs, single chat service, optional vector search
- SSE streaming wired to the SDK’s Responses API events
- Fast provider swap between OpenAI, OpenRouter, and local OpenAI-compatible servers (e.g., llama.cpp)

## File tree (backend and front-end)

```text
src/main/java/com/example/app
├── boot/                         # Typed @ConfigurationProperties, main app
├── application/
│   └── usecase/                  # One class per action (optional, but helps)
├── domain/                       # Ports + invariants (framework-free)
├── adapters/
│   ├── in/web/                   # REST controllers + web DTOs
│   └── out/persistence/          # Repos or external adapters (Qdrant, etc.)
└── service/                      # LLM orchestration, context building, helpers

frontend/email-client (Svelte + Vite)
├── src/App.svelte                # Layout + stream wiring
└── src/lib/**                    # Stores, services, components
```

## Dependencies (what I imported)

Maven:

```xml
<dependency>
  <groupId>com.openai</groupId>
  <artifactId>openai-java</artifactId>
  <version>4.6.1</version>
</dependency>

<!-- Optional: Qdrant for vector search -->
<dependency>
  <groupId>io.qdrant</groupId>
  <artifactId>client</artifactId>
  <version>1.7.0</version>
</dependency>

<!-- HTML cleanup and Markdown rendering for safe output -->
<dependency>
  <groupId>org.jsoup</groupId>
  <artifactId>jsoup</artifactId>
  <version>1.17.2</version>
</dependency>
<dependency>
  <groupId>com.vladsch.flexmark</groupId>
  <artifactId>flexmark</artifactId>
  <version>0.64.8</version>
</dependency>
```

## What the SDK gives you vs. what you define

What the SDK provides:

- Responses API: request builder, sync/streaming, typed streaming events (including reasoning events)
- Embeddings API

What I define:

- Typed config (`@ConfigurationProperties`) for API key, base URL, model, prompts, timeouts
- DTOs (`ChatRequest`, `ChatResponse`) with validation
- A single `OpenAiChatService` that builds `ResponseCreateParams`, adds system and context messages, and either returns text or streams SSE events to the client
- A thin `ChatController` (and optional catalog/command controller) that only translates HTTP <-> DTOs and delegates
- Optional vector search service (Qdrant) and a small `ContextBuilder`

## Configuration (single source of truth)

```properties
# application.properties (env vars override these)
openai.api.key=${OPENAI_API_KEY}
openai.api.base-url=${OPENAI_BASE_URL:https://api.openai.com/v1}

# Default chat model; swap with LLM_MODEL
openai.model.chat=${LLM_MODEL:gpt-4o-mini}

# Server-sent events (SSE) timeout + heartbeat
openai.stream.timeout-seconds=120
openai.stream.heartbeat-interval-seconds=10

# Reasoning effort. If a provider doesn’t support "minimal", fall back to "low"
openai.reasoning.default-effort=low

# Optional: vector search
qdrant.enabled=false
qdrant.host=localhost
qdrant.port=6333
qdrant.collection-name=emails
```

Provider swaps (no code changes):

```bash
# OpenAI (default)
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://api.openai.com/v1
export LLM_MODEL=gpt-4o-mini

# OpenRouter
export OPENAI_API_KEY={{OPENROUTER_API_KEY}}
export OPENAI_BASE_URL=https://openrouter.ai/api/v1
export LLM_MODEL=anthropic/claude-3.7-sonnet  # or any supported id
# Optional: route providers
export LLM_PROVIDER_ORDER="anthropic,openai"
export LLM_PROVIDER_SORT=price
export LLM_PROVIDER_ALLOW_FALLBACKS=true

# Local OpenAI-compatible server (e.g., llama.cpp, vLLM, LM Studio)
export OPENAI_API_KEY=dummy-or-local-token
export OPENAI_BASE_URL=http://localhost:8080/v1
export LLM_MODEL=llama-3.1-8b-instruct
```

Notes:

- Embeddings aren’t supported by many non-OpenAI endpoints—guard calls accordingly
- Some providers don’t support the “minimal” reasoning effort; normalize to `low`

## Minimal DTOs

```java
// ChatRequest.java
public class ChatRequest {
  @jakarta.validation.constraints.NotBlank
  @jakarta.validation.constraints.Size(max = 4000)
  private String message;
  private String conversationId;
  @jakarta.validation.constraints.Min(1)
  @jakarta.validation.constraints.Max(20)
  private int maxResults = 5;
  private boolean thinkingEnabled;
  @jakarta.validation.constraints.Pattern(
    regexp = "^(minimal|low|medium|high)$", flags = jakarta.validation.constraints.Pattern.Flag.CASE_INSENSITIVE)
  private String thinkingLevel;
  private boolean jsonOutput;
  private String aiCommand;         // optional (compose, summarize, etc.)
  private String commandVariant;    // optional (e.g., language code)
  private java.util.Map<String,String> commandArgs = new java.util.LinkedHashMap<>();
  private String subject;
  private String recipientName;
  private String recipientEmail;
  // getters/setters
}
```

```java
// ChatResponse.java
public class ChatResponse {
  private String response;          // raw text
  private String sanitizedHtml;     // markdown -> safe HTML (server-side)
  private String conversationId;
  private java.time.LocalDateTime timestamp = java.time.LocalDateTime.now();
  // optional context preview list
  public record EmailContext(String id, String subject, String sender, String snippet, double score) {}
  private java.util.List<EmailContext> emailContext;
  // getters/setters
}
```

## Typed configuration

```java
// OpenAiProperties.java
@org.springframework.boot.context.properties.ConfigurationProperties(prefix = "openai")
public class OpenAiProperties {
  public static class Api { String key; String baseUrl = "https://api.openai.com/v1"; /* getters/setters */ }
  public static class Model { String chat = "gpt-4o-mini"; Double temperature = 0.5; Long maxOutputTokens; Double topP; }
  public static class Stream { int timeoutSeconds = 120; int heartbeatIntervalSeconds = 10; }
  public static class Reasoning { java.util.List<String> supportedModelPrefixes = java.util.List.of("o1","o3","o4","gpt-5"); String defaultEffort = "low"; }
  public static class Prompts { String emailAssistantSystem = "You are an email analysis assistant..."; String intentAnalysisSystem = "Classify intent..."; }
  private Api api = new Api(); private Model model = new Model(); private Stream stream = new Stream();
  private Reasoning reasoning = new Reasoning(); private Prompts prompts = new Prompts();
  // getters/setters
}
```

## Service: building and streaming a response

```java
// OpenAiChatService.java (core excerpt)
@Service
public class OpenAiChatService {
  private final com.openai.client.OpenAIClient client;
  private final OpenAiProperties props;

  public OpenAiChatService(@Autowired(required=false) com.openai.client.OpenAIClient client, OpenAiProperties props) {
    this.client = client; this.props = props;
  }

  public String generate(String userMessage, String context, java.util.List<ConversationTurn> history, boolean json, boolean thinking, String level) {
    var params = buildParams(userMessage, context, history, json, thinking, level).build();
    var res = client == null ? null : client.responses().create(params);
    return res == null ? "OpenAI is unavailable" : res.output().stream()
      .flatMap(it -> it.message().stream()).flatMap(m -> m.content().stream())
      .flatMap(c -> c.outputText().stream()).map(t -> t.text()).collect(java.util.stream.Collectors.joining());
  }

  public void stream(String userMessage, String context, java.util.List<ConversationTurn> history, boolean json,
                     boolean thinking, String level,
                     java.util.function.Consumer<StreamEvent> onEvent,
                     Runnable onComplete, java.util.function.Consumer<Throwable> onError) {
    var params = buildParams(userMessage, context, history, json, thinking, level).build();
    try (var stream = client.responses().createStreaming(params)) {
      stream.stream().forEach(ev -> {
        ev.outputTextDelta().ifPresent(delta -> onEvent.accept(StreamEvent.rawText(delta.delta())));
        // optionally map reasoning events -> UI-friendly payloads
      });
      onComplete.run();
    } catch (Exception e) { onError.accept(e); }
  }

  private com.openai.models.responses.ResponseCreateParams.Builder buildParams(String userMessage, String context,
      java.util.List<ConversationTurn> history, boolean json, boolean thinking, String level) {
    var b = com.openai.models.responses.ResponseCreateParams.builder()
      .model(com.openai.models.ChatModel.of(props.getModel().getChat()))
      .inputOfResponse(buildMessages(context, userMessage, history, json));
    // temperature / topP / max tokens
    if (props.getModel().getTemperature() != null) b.temperature(props.getModel().getTemperature());
    if (props.getModel().getTopP() != null) b.topP(props.getModel().getTopP());
    if (props.getModel().getMaxOutputTokens() != null) b.maxOutputTokens(props.getModel().getMaxOutputTokens());
    // reasoning effort (provider-dependent)
    if (thinking) b.reasoning(com.openai.models.Reasoning.builder().effort(effort(level)).build());
    return b;
  }

  private java.util.List<com.openai.models.responses.ResponseInputItem> buildMessages(String context, String userMessage,
    java.util.List<ConversationTurn> history, boolean json) {
    var items = new java.util.ArrayList<com.openai.models.responses.ResponseInputItem>();
    if (props.getPrompts().getEmailAssistantSystem() != null && !props.getPrompts().getEmailAssistantSystem().isBlank()) {
      items.add(msg(com.openai.models.responses.EasyInputMessage.Role.SYSTEM, props.getPrompts().getEmailAssistantSystem()));
    }
    if (context != null && !context.isBlank()) {
      items.add(msg(com.openai.models.responses.EasyInputMessage.Role.SYSTEM, "Email Context:\n" + context));
    }
    if (history != null) for (var turn : history) items.add(msg(turn.role(), turn.content()));
    var prompt = userMessage == null ? "" : userMessage;
    if (json && !prompt.toLowerCase(java.util.Locale.ROOT).contains("respond strictly as a json object")) {
      prompt += "\n\nRespond strictly as a JSON object. Do not include markdown fences or explanatory text.";
    }
    items.add(msg(com.openai.models.responses.EasyInputMessage.Role.USER, prompt));
    return items;
  }

  private com.openai.models.ReasoningEffort effort(String level) {
    if (level == null) return com.openai.models.ReasoningEffort.LOW; // safe default
    return switch (level.toLowerCase(java.util.Locale.ROOT)) {
      case "minimal" -> com.openai.models.ReasoningEffort.MINIMAL;
      case "medium" -> com.openai.models.ReasoningEffort.MEDIUM;
      case "high", "heavy" -> com.openai.models.ReasoningEffort.HIGH;
      default -> com.openai.models.ReasoningEffort.LOW;
    };
  }

  private static com.openai.models.responses.ResponseInputItem msg(
    com.openai.models.responses.EasyInputMessage.Role role, String content) {
    return com.openai.models.responses.ResponseInputItem.ofEasyInputMessage(
      com.openai.models.responses.EasyInputMessage.builder().role(role).content(content).build());
  }

  public record ConversationTurn(com.openai.models.responses.EasyInputMessage.Role role, String content) { }
  public sealed interface StreamEvent permits StreamEvent.RawText { record RawText(String value) implements StreamEvent {} static StreamEvent rawText(String v){return new RawText(v);} }
}
```

## Controller and (optional) use case

```java
// ChatController.java
@RestController
@RequestMapping("/api/chat")
public class ChatController {
  private final OpenAiChatService chat;
  public ChatController(OpenAiChatService chat) { this.chat = chat; }

  @PostMapping public ResponseEntity<ChatResponse> chat(@Valid @RequestBody ChatRequest req) {
    var result = chat.generate(req.getMessage(), /*context*/ "", /*history*/ java.util.List.of(), req.isJsonOutput(), req.isThinkingEnabled(), req.getThinkingLevel());
    var resp = new ChatResponse(); resp.setResponse(result); return ResponseEntity.ok(resp);
  }

  @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter stream(@Valid @RequestBody ChatRequest req) {
    var emitter = new SseEmitter(java.time.Duration.ofSeconds(120).toMillis());
    chat.stream(req.getMessage(), "", java.util.List.of(), req.isJsonOutput(), req.isThinkingEnabled(), req.getThinkingLevel(),
      ev -> { try { if (ev instanceof OpenAiChatService.StreamEvent.RawText t) emitter.send(SseEmitter.event().data(t.value())); } catch (Exception ignored) {} },
      emitter::complete,
      emitter::completeWithError);
    return emitter;
  }
}
```

If you prefer explicit orchestration boundaries, add a dedicated use case (e.g., `SummarizeEmailUseCase`) that prepares the context (uploads and/or vector matches) and calls `OpenAiChatService`. Controllers stay thin either way.

## Vector search (optional but useful)

If you want retrieval, embed the query and hit Qdrant. Keep it off by default so local dev stays simple.

```java
@Service
public class VectorSearchService {
  private final io.qdrant.client.QdrantClient qdrant; private final boolean enabled;
  public VectorSearchService(io.qdrant.client.QdrantClient q, QdrantProperties p){ this.qdrant=q; this.enabled=p.isEnabled(); }
  public java.util.List<ChatResponse.EmailContext> searchSimilarEmails(float[] query, int limit){ if(!enabled||query==null||query.length==0) return java.util.List.of(); /* build SearchPoints, map payload -> EmailContext */ return java.util.List.of(); }
}
```

## Front-end (Svelte) notes

- Use an `EventSource` (or fetch + ReadableStream) to consume `text/event-stream`
- Route events into a store; render progressively
- Keep one shared nonce-aware fetch client to centralize 403/renew logic

## Practical guardrails

- Sanitize model output server-side before sending HTML to the browser
- Use explicit timeouts for streaming and send heartbeat comments to keep proxies from closing idle streams
- Treat provider swaps as configuration only; code shouldn’t care

That’s the bare minimum that made the Java SDK feel ergonomic in a modern web app. From here you can layer richer prompts, add a catalog of AI actions, or wire real inbox providers. The important part is the shape: tight DTOs, one clear service for the model, optional use cases, and configuration that actually owns the behavior.
