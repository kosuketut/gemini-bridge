import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  configPath,
  loadOrCreateConfig,
  saveCredentials,
  credentialsPath,
  setStateDirForTests,
} from "../src/config.ts";

test("creates protected random local configuration and credential files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aside-antigravity-test-"));
  setStateDirForTests(dir);
  try {
    const first = await loadOrCreateConfig();
    const second = await loadOrCreateConfig();
    assert.deepEqual(second, first);
    assert.equal(first.host, "127.0.0.1");
    assert.ok(first.apiKey.length >= 32);

    await saveCredentials({
      access: "access",
      refresh: "refresh",
      expires: Date.now() + 60_000,
      projectId: "project",
    });

    if (process.platform !== "win32") {
      assert.equal((await stat(dir)).mode & 0o777, 0o700);
      assert.equal((await stat(configPath())).mode & 0o777, 0o600);
      assert.equal((await stat(credentialsPath())).mode & 0o777, 0o600);
    }
  } finally {
    setStateDirForTests(undefined);
  }
});
