import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

if (process.platform !== "darwin") throw new Error("launchd removal is only available on macOS");
const label = "com.local.aside-antigravity-bridge";
const plist = join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
const uid = process.getuid();
spawnSync("launchctl", ["bootout", `gui/${uid}`, plist], { stdio: "ignore" });
await rm(plist, { force: true });
console.log(`Removed ${label}. Credentials were left untouched.`);
