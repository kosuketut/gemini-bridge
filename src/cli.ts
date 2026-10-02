import { interactiveLogin, getAntigravityApiKey } from "./auth.ts";
import { loadCredentials, loadOrCreateConfig, maskEmail, stateDir } from "./config.ts";
import { refreshModels } from "./models.ts";
import { createBridgeServer, listen } from "./server.ts";

async function main(): Promise<void> {
  const command = process.argv[2] || "serve";

  if (command === "login") {
    await loadOrCreateConfig();
    const credentials = await interactiveLogin();
    console.log(`Login saved for ${maskEmail(credentials.email) || "the selected Google account"}.`);
    console.log(`Credential directory: ${stateDir()}`);
    return;
  }

  if (command === "status") {
    const [config, credentials] = await Promise.all([loadOrCreateConfig(), loadCredentials()]);
    console.log(
      JSON.stringify(
        {
          baseUrl: `http://${config.host}:${config.port}/v1`,
          authenticated: Boolean(credentials),
          account: maskEmail(credentials?.email),
          tokenExpiresAt: credentials ? new Date(credentials.expires).toISOString() : undefined,
          stateDir: stateDir(),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "key") {
    const config = await loadOrCreateConfig();
    console.log("Paste this local-only key into Aside's custom provider API key field:");
    console.log(config.apiKey);
    return;
  }

  if (command === "models") {
    const models = await refreshModels(await getAntigravityApiKey());
    for (const model of models) console.log(model.id);
    return;
  }

  if (command !== "serve") {
    throw new Error(`Unknown command: ${command}`);
  }

  const { server, config } = await createBridgeServer();
  await listen(server, config);
  const credentials = await loadCredentials();
  console.log(`Aside Antigravity bridge listening on http://${config.host}:${config.port}/v1`);
  console.log(credentials ? "Google login: configured" : "Google login: missing (run: node dist/cli.mjs login)");
  console.log("The server is bound to loopback only. Press Ctrl+C to stop.");

  const stop = () => {
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await new Promise<void>(() => {});
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
