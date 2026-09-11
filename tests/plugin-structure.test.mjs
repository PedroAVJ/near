import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginRoot = resolve(root, "plugins/near");

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(root, relativePath), "utf8"));
}

async function readPluginJson(relativePath) {
  return JSON.parse(await readFile(resolve(pluginRoot, relativePath), "utf8"));
}

function normalizeRepository(value) {
  const url = typeof value === "string" ? value : value.url;
  return url.replace(/^git\+/, "").replace(/\.git$/, "");
}

async function exists(relativePath) {
  try {
    await stat(resolve(root, relativePath));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function treeSize(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    total += entry.isDirectory() ? await treeSize(entryPath) : (await stat(entryPath)).size;
  }
  return total;
}

test("dual-client manifests share one plugin identity", async () => {
  const codex = await readPluginJson(".codex-plugin/plugin.json");
  const claude = await readPluginJson(".claude-plugin/plugin.json");
  const packageJson = await readJson("package.json");

  for (const field of ["name", "version", "description", "homepage", "repository", "skills"]) {
    assert.deepEqual(codex[field], claude[field], `${field} must match across clients`);
  }
  assert.equal(packageJson.name, codex.name);
  assert.equal(packageJson.version, codex.version);
  assert.equal(normalizeRepository(packageJson.repository), normalizeRepository(codex.repository));
  assert.equal(codex.skills, "./skills/");
  assert.equal(codex.interface.brandColor, "#9A5F3F");
});

test("installable package stays thin and state-free", async () => {
  for (const statePath of ["ideas", "canon", "context", "confidential", "medical-records", "products"]) {
    assert.equal(await exists(`plugins/near/${statePath}`), false, `${statePath} must not enter the plugin`);
  }
  assert.ok(await treeSize(pluginRoot) < 256 * 1024, "Near plugin package must stay below 256 KiB");
});

test("plugin exposes bounded read-only private context and public profile tools", async () => {
  const mcp = await readPluginJson(".mcp.json");
  const server = await readFile(resolve(pluginRoot, "servers/near_context_mcp.py"), "utf8");

  assert.deepEqual(Object.keys(mcp.mcpServers), ["near-context"]);
  assert.match(server, /search_context/);
  assert.match(server, /read_context/);
  assert.match(server, /read_public_profile/);
  assert.match(server, /configured personal context/);
  assert.doesNotMatch(server, /create_context|update_context|delete_context/);
});

test("plugin requires a chosen repository and explicit filing authority", async () => {
  const skill = await readFile(resolve(pluginRoot, "skills/exocortex/SKILL.md"), "utf8");
  const openAi = await readFile(resolve(pluginRoot, "skills/exocortex/agents/openai.yaml"), "utf8");
  assert.match(skill, /NEAR_CONTEXT_REPO/);
  assert.match(skill, /There is no default/);
  assert.match(skill, /Relationships are directed personal state/);
  assert.match(skill, /does not authorize saving or publishing/);
  assert.match(openAi, /\$exocortex/);
});

test("two-model thinking loads its behavioral contract from the installed release", async () => {
  const skill = await readFile(resolve(pluginRoot, "skills/exocortex/SKILL.md"), "utf8");
  const bootstrap = await readFile(
    resolve(pluginRoot, "skills/exocortex/scripts/load_live_contract.py"),
    "utf8",
  );
  assert.match(skill, /load_live_contract\.py/);
  assert.match(skill, /contract_sha256/);
  assert.match(skill, /host registry/);
  assert.match(bootstrap, /installed_plugins\.json/);
  assert.match(bootstrap, /newest_valid_cache_root/);
});

test("Near owns every turn in its one-to-one thread", async () => {
  const skill = await readFile(resolve(pluginRoot, "skills/exocortex/SKILL.md"), "utf8");
  assert.match(skill, /Near owns that thread/);
  assert.match(skill, /Every later user\s+message remains addressed to Near/);
  assert.match(skill, /Never hand an\s+established Near thread back to Codex/);
  assert.match(skill, /This host has no group chat/);
  assert.match(skill, /Near remains the sole user-facing speaker/);
  assert.match(skill, /start a separate\s+thread for that participant/);
});

test("deployable interfaces remain outside the installable plugin", async () => {
  assert.equal(await exists("apps/web/package.json"), true);
  assert.equal(await exists("services/gateway/package.json"), true);
  assert.equal(await exists("plugins/near/apps"), false);
  assert.equal(await exists("plugins/near/services"), false);
});
