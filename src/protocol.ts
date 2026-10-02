import type {
  AssistantMessage,
  Context,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  Tool,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@earendil-works/pi-ai";
import { ToolChoice } from "pi-antigravity/src/types/enums.ts";
import type { ChatCompletionRequest, OpenAIContent, OpenAIMessage } from "./types.ts";
import { ToolSignatureCache } from "./signatures.ts";

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function contentToText(content: OpenAIContent | undefined): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function parseDataUrl(url: string): ImageContent {
  const match = url.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    throw new Error("Only base64 data: image URLs are accepted; remote image URLs are disabled");
  }
  return {
    type: "image",
    mimeType: match[1] || "image/png",
    data: match[2]!.replace(/\s/g, ""),
  };
}

function contentToUserContent(content: OpenAIContent | undefined): UserMessage["content"] {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const blocks: Array<TextContent | ImageContent> = [];
  for (const part of content) {
    if (part.type === "text") {
      blocks.push({ type: "text", text: part.text });
    } else if (part.type === "image_url") {
      const url = typeof part.image_url === "string" ? part.image_url : part.image_url.url;
      blocks.push(parseDataUrl(url));
    }
  }
  return blocks;
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // The upstream provider expects an object. Preserve malformed input as text.
  }
  return { _raw: raw };
}

function findToolNames(messages: OpenAIMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    for (const call of message.tool_calls || []) names.set(call.id, call.function.name);
  }
  return names;
}

function assistantMessage(
  message: OpenAIMessage,
  modelId: string,
  signatures: ToolSignatureCache,
): AssistantMessage {
  const content: Array<TextContent | ThinkingContent | ToolCall> = [];
  const text = contentToText(message.content);
  if (text) content.push({ type: "text", text });
  if (message.reasoning_content) {
    content.push({ type: "thinking", thinking: message.reasoning_content });
  }
  for (const call of message.tool_calls || []) {
    const cached = signatures.get(call.id);
    content.push({
      type: "toolCall",
      id: call.id,
      name: call.function.name,
      arguments: parseArguments(call.function.arguments),
      ...(cached?.thoughtSignature ? { thoughtSignature: cached.thoughtSignature } : {}),
    });
  }
  return {
    role: "assistant",
    content,
    api: "antigravity-api",
    provider: "antigravity",
    model: modelId,
    usage: { ...EMPTY_USAGE, cost: { ...EMPTY_USAGE.cost } },
    stopReason: message.tool_calls?.length ? "toolUse" : "stop",
    timestamp: Date.now(),
  };
}

function toolResultMessage(message: OpenAIMessage, toolNames: Map<string, string>): ToolResultMessage {
  const id = message.tool_call_id || "missing_tool_call_id";
  return {
    role: "toolResult",
    toolCallId: id,
    toolName: message.name || toolNames.get(id) || "unknown_tool",
    content: [{ type: "text", text: contentToText(message.content) }],
    isError: false,
    timestamp: Date.now(),
  };
}

export function toPiContext(
  request: ChatCompletionRequest,
  signatures: ToolSignatureCache,
): Context {
  if (!request.model || !Array.isArray(request.messages)) {
    throw new Error("model and messages are required");
  }

  const systemPrompt = request.messages
    .filter((message) => message.role === "system" || message.role === "developer")
    .map((message) => contentToText(message.content))
    .filter(Boolean)
    .join("\n\n");
  const toolNames = findToolNames(request.messages);
  const messages: Message[] = [];

  for (const message of request.messages) {
    if (message.role === "system" || message.role === "developer") continue;
    if (message.role === "user") {
      messages.push({
        role: "user",
        content: contentToUserContent(message.content),
        timestamp: Date.now(),
      });
    } else if (message.role === "assistant") {
      messages.push(assistantMessage(message, request.model, signatures));
    } else if (message.role === "tool") {
      messages.push(toolResultMessage(message, toolNames));
    }
  }

  const tools = request.tools?.map(
    (tool): Tool => ({
      name: tool.function.name,
      description: tool.function.description || "",
      parameters: (tool.function.parameters || { type: "object", properties: {} }) as Tool["parameters"],
    }),
  );

  return {
    ...(systemPrompt ? { systemPrompt } : {}),
    messages,
    ...(tools?.length ? { tools } : {}),
  };
}

export function toReasoningLevel(
  effort: ChatCompletionRequest["reasoning_effort"],
): "off" | "minimal" | "low" | "medium" | "high" {
  return effort || "off";
}

export function toToolChoice(choice: ChatCompletionRequest["tool_choice"]): ToolChoice {
  if (choice === "none") return ToolChoice.None;
  if (choice === "required") return ToolChoice.Required;
  if (choice && typeof choice === "object") return ToolChoice.Any;
  return ToolChoice.Auto;
}
