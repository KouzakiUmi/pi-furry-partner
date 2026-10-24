import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// PI_TEST_MODULES can target a portable install without a home-directory Pi
// launcher/current-version file. Otherwise find an npm install or managed Pi.
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
let candidates = process.env.PI_TEST_MODULES ? [resolve(process.env.PI_TEST_MODULES)] : [join(root, "node_modules")];
if (!process.env.PI_TEST_MODULES) {
  try {
    const managedVersion = (await readFile(join(agentDir, "install/current-version"), "utf8")).trim();
    candidates.push(join(agentDir, "install/releases", managedVersion, "node_modules"));
  } catch { /* npm-only users do not have the managed launcher's version file. */ }
  candidates.push(join(agentDir, "npm/node_modules"));
}
export let modules, version;
for (const candidate of candidates) {
  try {
    const pkg = JSON.parse(await readFile(join(candidate, "@earendil-works/pi-coding-agent/package.json"), "utf8"));
    modules = candidate; version = pkg.version; break;
  } catch { /* Try the next explicit/local/managed module location. */ }
}
if (!modules) throw new Error("Pi test runtime not found. Install @earendil-works/pi-coding-agent@1.2.0 locally or set PI_TEST_MODULES to its node_modules directory.");
