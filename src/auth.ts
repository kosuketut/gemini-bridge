import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  getApiKey,
  loginAntigravity,
  refreshAntigravityToken,
  type OAuthLoginCallbacks,
} from "pi-antigravity/src/auth/index.ts";
import { loadCredentials, saveCredentials } from "./config.ts";
import type { StoredCredentials } from "./types.ts";

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? { file: "open", args: [url] }
      : process.platform === "win32"
        ? { file: "cmd", args: ["/c", "start", "", url] }
        : { file: "xdg-open", args: [url] };
  const child = spawn(command.file, command.args, {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", () => {});
  child.unref();
}

async function promptForCallback(message: string): Promise<string> {
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    return await prompt.question(`${message}\n> `);
  } finally {
    prompt.close();
  }
}

export async function interactiveLogin(): Promise<StoredCredentials> {
  const manualCallback = process.env.ASIDE_ANTIGRAVITY_MANUAL_CALLBACK === "1";
  const callbacks = {
    onAuth({ url, instructions }: Parameters<OAuthLoginCallbacks["onAuth"]>[0]) {
      if (instructions) console.log(instructions);
      console.log(`\n${url}\n`);
      openBrowser(url);
    },
    onDeviceCode({ userCode, verificationUri }: Parameters<OAuthLoginCallbacks["onDeviceCode"]>[0]) {
      console.log(`Open ${verificationUri} and enter code: ${userCode}`);
      openBrowser(verificationUri);
    },
    async onSelect({ message, options }: Parameters<OAuthLoginCallbacks["onSelect"]>[0]) {
      console.log(message);
      options.forEach((option, index) => console.log(`${index + 1}. ${option.label}`));
      const answer = await promptForCallback("Select a number");
      const selected = options[Number.parseInt(answer, 10) - 1];
      return selected?.id;
    },
    ...(manualCallback
      ? {
          async onPrompt({ message }: Parameters<OAuthLoginCallbacks["onPrompt"]>[0]) {
            return await promptForCallback(message);
          },
        }
      : {}),
  } as OAuthLoginCallbacks;

  const credentials = (await loginAntigravity(callbacks)) as StoredCredentials;
  await saveCredentials(credentials);
  return credentials;
}

export async function getFreshCredentials(): Promise<StoredCredentials> {
  const credentials = await loadCredentials();
  if (!credentials) {
    throw new Error("Google login is not configured. Run: node dist/cli.mjs login");
  }

  if (Date.now() < credentials.expires) return credentials;
  const refreshed = (await refreshAntigravityToken(credentials)) as StoredCredentials;
  await saveCredentials(refreshed);
  return refreshed;
}

export async function getAntigravityApiKey(): Promise<string> {
  return getApiKey(await getFreshCredentials());
}
