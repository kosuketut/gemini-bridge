import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { setStateDirForTests } from "../src/config.ts";
import { createBridgeServer } from "../src/server.ts";

test("serves health locally and protects OpenAI endpoints", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aside-antigravity-server-"));
  setStateDirForTests(dir);
  const { server, config } = await createBridgeServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    const healthBody = (await health.json()) as { authenticated: boolean };
    assert.equal(healthBody.authenticated, false);

    const unauthorized = await fetch(`${base}/v1/models`);
    assert.equal(unauthorized.status, 401);

    const missingLogin = await fetch(`${base}/v1/models`, {
      headers: { authorization: `Bearer ${config.apiKey}` },
    });
    assert.equal(missingLogin.status, 503);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    setStateDirForTests(undefined);
  }
});
