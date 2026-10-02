import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { streamAntigravity } from "pi-antigravity/src/stream/index.ts";
import { getAntigravityApiKey } from "./auth.ts";
import { loadCredentials, loadOrCreateConfig } from "./config.ts";
import { currentModels, refreshModels, resolveModel } from "./models.ts";
import { toPiContext, toToolChoice } from "./protocol.ts";
import { ToolSignatureCache } from "./signatures.ts";
import type { BridgeConfig, ChatCompletionRequest } from "./types.ts";

const MAX_BODY_BYTES = 25 * 1024 * 1024;
const signatures = new ToolSignatureCache();

type PiUsage = {
  input: number;
  output: number;
  cacheRead: number;
  totalTokens: number;
  reasoning?: number;
};

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(data);
}

function errorBody(message: string, type = "bridge_error") {
  return { error: { message, type, param: null, code: null } };
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function authorized(req: IncomingMessage, config: BridgeConfig): boolean {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7));
  const expected = Buffer.from(config.apiKey);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readRequestJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const raw of req) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body exceeds 25 MiB");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function finishReason(reason: string): "stop" | "length" | "tool_calls" {
  if (reason === "length") return "length";
  if (reason === "toolUse") return "tool_calls";
  return "stop";
}

function openAIUsage(usage: PiUsage | undefined) {
  if (!usage) return undefined;
  return {
    prompt_tokens: usage.input + usage.cacheRead,
    completion_tokens: usage.output,
    total_tokens: usage.totalTokens,
    completion_tokens_details: {
      reasoning_tokens: usage.reasoning || 0,
    },
    prompt_tokens_details: {
      cached_tokens: usage.cacheRead,
    },
  };
}

function writeSse(res: ServerResponse, value: unknown): void {
  res.write(`data: ${typeof value === "string" ? value : JSON.stringify(value)}\n\n`);
}

function streamChunk(
  id: string,
  model: string,
  delta: Record<string, unknown>,
  finish: "stop" | "length" | "tool_calls" | null = null,
) {
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

async function runCompletion(
  body: ChatCompletionRequest,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const apiKey = await getAntigravityApiKey();
  const model = await resolveModel(body.model, apiKey);
  const context = toPiContext(body, signatures);
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });

  const output = streamAntigravity(model, context, {
    apiKey,
    signal: abort.signal,
    temperature: body.temperature,
    maxTokens: body.max_completion_tokens ?? body.max_tokens,
    reasoning: body.reasoning_effort,
    toolChoice: toToolChoice(body.tool_choice),
    ...(body.user ? { sessionId: body.user } : {}),
  });

  const id = `chatcmpl-${randomUUID()}`;
  let text = "";
  let reasoning = "";
  const toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];
  let completedReason: "stop" | "length" | "tool_calls" = "stop";
  let finalUsage: ReturnType<typeof openAIUsage>;

  if (body.stream) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "x-content-type-options": "nosniff",
    });
    writeSse(res, streamChunk(id, body.model, { role: "assistant", content: "" }));
  }

  for await (const event of output) {
    if (event.type === "text_delta") {
      text += event.delta;
      if (body.stream) writeSse(res, streamChunk(id, body.model, { content: event.delta }));
    } else if (event.type === "thinking_delta") {
      reasoning += event.delta;
      if (body.stream) {
        writeSse(res, streamChunk(id, body.model, { reasoning_content: event.delta }));
      }
    } else if (event.type === "toolcall_end") {
      const call = {
        id: event.toolCall.id,
        type: "function" as const,
        function: {
          name: event.toolCall.name,
          arguments: JSON.stringify(event.toolCall.arguments || {}),
        },
      };
      const index = toolCalls.length;
      toolCalls.push(call);
      signatures.set(call.id, {
        name: call.function.name,
        thoughtSignature: event.toolCall.thoughtSignature,
      });
      if (body.stream) {
        writeSse(
          res,
          streamChunk(id, body.model, {
            tool_calls: [{ index, ...call }],
          }),
        );
      }
    } else if (event.type === "done") {
      completedReason = finishReason(event.reason);
      finalUsage = openAIUsage(event.message.usage);
    } else if (event.type === "error") {
      throw new Error(event.error.errorMessage || "Antigravity request failed");
    }
  }

  if (body.stream) {
    writeSse(res, streamChunk(id, body.model, {}, completedReason));
    if (body.stream_options?.include_usage && finalUsage) {
      writeSse(res, {
        id,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [],
        usage: finalUsage,
      });
    }
    writeSse(res, "[DONE]");
    res.end();
    return;
  }

  json(res, 200, {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text || null,
          ...(reasoning ? { reasoning_content: reasoning } : {}),
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: completedReason,
      },
    ],
    ...(finalUsage ? { usage: finalUsage } : {}),
  });
}

async function route(req: IncomingMessage, res: ServerResponse, config: BridgeConfig): Promise<void> {
  const url = new URL(req.url || "/", `http://${config.host}:${config.port}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const credentials = await loadCredentials();
    json(res, 200, {
      status: "ok",
      service: "aside-antigravity-bridge",
      authenticated: Boolean(credentials),
      models: currentModels().length,
    });
    return;
  }

  if (!authorized(req, config)) {
    json(res, 401, errorBody("Invalid bridge API key", "authentication_error"));
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/models") {
    const apiKey = await getAntigravityApiKey();
    let models;
    try {
      models = await refreshModels(apiKey);
    } catch {
      models = currentModels();
    }
    json(res, 200, { object: "list", data: models });
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
    await runCompletion(await readRequestJson<ChatCompletionRequest>(req), req, res);
    return;
  }

  json(res, 404, errorBody("Endpoint not found", "not_found_error"));
}

export async function createBridgeServer(): Promise<{ server: Server; config: BridgeConfig }> {
  const config = await loadOrCreateConfig();
  const server = createServer((req, res) => {
    void route(req, res, config).catch((error) => {
      const message = safeError(error);
      if (res.headersSent) {
        writeSse(res, errorBody(message));
        writeSse(res, "[DONE]");
        res.end();
      } else {
        json(res, /login is not configured/i.test(message) ? 503 : 502, errorBody(message));
      }
    });
  });
  server.requestTimeout = 10 * 60 * 1000;
  server.headersTimeout = 30 * 1000;
  return { server, config };
}

export async function listen(server: Server, config: BridgeConfig): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}
