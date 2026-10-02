export type JsonObject = Record<string, unknown>;

export type OpenAITextPart = { type: "text"; text: string };
export type OpenAIImagePart = {
  type: "image_url";
  image_url: string | { url: string; detail?: string };
};
export type OpenAIContent = string | Array<OpenAITextPart | OpenAIImagePart> | null;

export type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type OpenAIMessage = {
  role: "system" | "developer" | "user" | "assistant" | "tool";
  content?: OpenAIContent;
  reasoning_content?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type OpenAITool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: JsonObject;
  };
};

export type ChatCompletionRequest = {
  model: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  tools?: OpenAITool[];
  tool_choice?: "none" | "auto" | "required" | JsonObject;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning_effort?: "minimal" | "low" | "medium" | "high";
  user?: string;
};

export type StoredCredentials = {
  refresh: string;
  access: string;
  expires: number;
  projectId?: string;
  email?: string;
};

export type BridgeConfig = {
  host: "127.0.0.1" | "::1";
  port: number;
  apiKey: string;
};

export type ToolSignature = {
  thoughtSignature?: string;
  name: string;
  storedAt: number;
};
