import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BridgeConfig, StoredCredentials } from "./types.ts";

let stateDirOverride: string | undefined;

export function stateDir(): string {
  return (
    stateDirOverride ||
    process.env.ASIDE_ANTIGRAVITY_HOME ||
    join(homedir(), ".aside-antigravity-bridge")
  );
}

export function setStateDirForTests(path: string | undefined): void {
  stateDirOverride = path;
}

export function credentialsPath(): string {
  return join(stateDir(), "credentials.json");
}

export function configPath(): string {
  return join(stateDir(), "config.json");
}

async function ensureStateDir(): Promise<void> {
  await mkdir(stateDir(), { recursive: true, mode: 0o700 });
  await chmod(stateDir(), 0o700);
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeSecretJson(path: string, value: unknown): Promise<void> {
  await ensureStateDir();
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  await chmod(path, 0o600);
}

function validateConfig(value: BridgeConfig): BridgeConfig {
  if (value.host !== "127.0.0.1" && value.host !== "::1") {
    throw new Error("Bridge host must be loopback-only (127.0.0.1 or ::1)");
  }
  if (!Number.isInteger(value.port) || value.port < 1024 || value.port > 65535) {
    throw new Error("Bridge port must be an integer from 1024 to 65535");
  }
  if (typeof value.apiKey !== "string" || value.apiKey.length < 32) {
    throw new Error("Bridge API key is invalid");
  }
  return value;
}

export async function loadOrCreateConfig(): Promise<BridgeConfig> {
  const existing = await readJson<BridgeConfig>(configPath());
  if (existing) return validateConfig(existing);
  const created: BridgeConfig = {
    host: "127.0.0.1",
    port: 8787,
    apiKey: `ag-local-${randomBytes(32).toString("base64url")}`,
  };
  await writeSecretJson(configPath(), created);
  return created;
}

export async function loadCredentials(): Promise<StoredCredentials | undefined> {
  const value = await readJson<StoredCredentials>(credentialsPath());
  if (!value) return undefined;
  if (!value.access || !value.refresh || !Number.isFinite(value.expires)) {
    throw new Error(`Credentials file is malformed: ${credentialsPath()}`);
  }
  return value;
}

export async function saveCredentials(credentials: StoredCredentials): Promise<void> {
  await writeSecretJson(credentialsPath(), credentials);
}

export function maskEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local?.slice(0, 2) || ""}***@${domain}`;
}
