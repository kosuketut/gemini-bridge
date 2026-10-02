import assert from "node:assert/strict";
import test from "node:test";
import { toPiContext, toReasoningLevel, toToolChoice } from "../src/protocol.ts";
import { ToolSignatureCache } from "../src/signatures.ts";

test("converts system, user, assistant tool call, and tool result", () => {
  const signatures = new ToolSignatureCache();
  signatures.set("call_1", { name: "lookup", thoughtSignature: "YWJjZA==" });
  const context = toPiContext(
    {
      model: "gemini-3.8-flash",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Find it." },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "lookup", arguments: "{\"q\":\"x\"}" },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_1", content: "found" },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "lookup",
            description: "Look up a value",
            parameters: { type: "object", properties: { q: { type: "string" } } },
          },
        },
      ],
    },
    signatures,
  );

  assert.equal(context.systemPrompt, "Be concise.");
  assert.equal(context.messages.length, 3);
  const assistant = context.messages[1];
  assert.equal(assistant?.role, "assistant");
  if (assistant?.role !== "assistant") throw new Error("missing assistant");
  const toolCall = assistant.content.find((block) => block.type === "toolCall");
  assert.equal(toolCall?.type, "toolCall");
  if (toolCall?.type === "toolCall") {
    assert.deepEqual(toolCall.arguments, { q: "x" });
    assert.equal(toolCall.thoughtSignature, "YWJjZA==");
  }
  const result = context.messages[2];
  assert.equal(result?.role, "toolResult");
  if (result?.role === "toolResult") assert.equal(result.toolName, "lookup");
  assert.equal(context.tools?.[0]?.name, "lookup");
});

test("accepts data URLs and rejects remote image fetches", () => {
  const signatures = new ToolSignatureCache();
  const context = toPiContext(
    {
      model: "gemini-3.8-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "inspect" },
            { type: "image_url", image_url: { url: "data:image/png;base64,YWJjZA==" } },
          ],
        },
      ],
    },
    signatures,
  );
  const user = context.messages[0];
  assert.equal(user?.role, "user");
  if (user?.role === "user" && Array.isArray(user.content)) {
    assert.equal(user.content[1]?.type, "image");
  }

  assert.throws(
    () =>
      toPiContext(
        {
          model: "gemini-3.8-flash",
          messages: [
            {
              role: "user",
              content: [{ type: "image_url", image_url: "https://example.com/image.png" }],
            },
          ],
        },
        signatures,
      ),
    /remote image URLs are disabled/,
  );
});

test("maps reasoning and tool choice", () => {
  assert.equal(toReasoningLevel("high"), "high");
  assert.equal(toReasoningLevel(undefined), "off");
  assert.equal(toToolChoice("none"), "none");
  assert.equal(toToolChoice("required"), "required");
  assert.equal(toToolChoice({ type: "function" }), "any");
});
