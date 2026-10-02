import { spawnSync } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform !== "darwin") throw new Error("launchd installation is only available on macOS");

const label = "com.local.aside-antigravity-bridge";
const project = resolve(process.cwd());
const state = process.env.ASIDE_ANTIGRAVITY_HOME || join(homedir(), ".aside-antigravity-bridge");
const agents = join(homedir(), "Library", "LaunchAgents");
const plist = join(agents, `${label}.plist`);
const uid = process.getuid();

const xml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

await mkdir(agents, { recursive: true });
await mkdir(state, { recursive: true, mode: 0o700 });
const body = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(join(project, "dist", "cli.mjs"))}</string>
    <string>serve</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(project)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${xml(join(state, "bridge.log"))}</string>
  <key>StandardErrorPath</key><string>${xml(join(state, "bridge-error.log"))}</string>
  <key>ProcessType</key><string>Interactive</string>
</dict>
</plist>
`;
await writeFile(plist, body, { mode: 0o644 });
await chmod(plist, 0o644);
spawnSync("launchctl", ["bootout", `gui/${uid}`, plist], { stdio: "ignore" });
const loaded = spawnSync("launchctl", ["bootstrap", `gui/${uid}`, plist], { encoding: "utf8" });
if (loaded.status !== 0) throw new Error(loaded.stderr || "launchctl bootstrap failed");
spawnSync("launchctl", ["kickstart", "-k", `gui/${uid}/${label}`], { stdio: "inherit" });
console.log(`Installed and started ${label}`);
console.log(`Plist: ${plist}`);
console.log(`Logs: ${state}`);
