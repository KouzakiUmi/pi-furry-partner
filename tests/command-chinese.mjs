import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, unlink, rmdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createChineseAutocompleteFactory } from "../lib/command-chinese.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = resolve(root, "work");
await mkdir(work, { recursive: true });
const scratch = await mkdtemp(join(work, "command-chinese-"));
assert.ok(scratch.startsWith(work + sep));
import { agentDir, version, modules } from "./pi-runtime.mjs";
const load = (file) => import(pathToFileURL(file));
const { CombinedAutocompleteProvider } = await load(join(modules, "@earendil-works/pi-tui/dist/index.js"));
const { BUILTIN_SLASH_COMMANDS } = await load(join(modules, "@earendil-works/pi-coding-agent/dist/core/slash-commands.js"));
const options = { signal: new AbortController().signal };
const checks = [];
const request = (provider, text, overrides = {}) => provider.getSuggestions([text], 0, text.length, { ...options, ...overrides });
const withoutDescription = ({ description, ...item }) => item;
let enabled = true;
const factory = createChineseAutocompleteFactory({ isEnabled: () => enabled });
const created = ["settings", "hello world.txt"];
try {
  for (const file of created) await writeFile(join(scratch, file), "fixture\n");
  const native = new CombinedAutocompleteProvider(BUILTIN_SLASH_COMMANDS, scratch);
  const wrapped = factory(native);
  const original = await request(native, "/"), translated = await request(wrapped, "/");
  assert.equal(translated.prefix, original.prefix);
  assert.deepEqual(translated.items.map(withoutDescription), original.items.map(withoutDescription));
  for (let index = 0; index < original.items.length; index++) {
    const before = original.items[index], after = translated.items[index];
    assert.notEqual(after.description, before.description, `The installed built-in ${before.value} needs a reviewed Chinese description`);
    assert.ok(/[\u3400-\u9fff]/u.test(after.description));
    const command = BUILTIN_SLASH_COMMANDS.find((item) => item.name === before.value);
    if (command.argumentHint) assert.ok(after.description.startsWith(`${command.argumentHint} — `));
    assert.deepEqual(wrapped.applyCompletion(["/"], 0, 1, after, translated.prefix), native.applyCompletion(["/"], 0, 1, before, original.prefix));
  }
  assert.equal(BUILTIN_SLASH_COMMANDS[0].description, "Open settings menu");
  checks.push("Real CombinedAutocompleteProvider translates all installed built-ins, retains argument hints, order/value/label/prefix and identical native completion results");

  const thirdParty = [
    { name: "settings", description: "Third-party project settings" },
    { name: "skill:settings", description: "Open settings menu" },
    { name: "custom", description: "Open settings menu" },
    { name: "Settings", description: "Open settings menu" },
  ];
  const mixed = new CombinedAutocompleteProvider([...BUILTIN_SLASH_COMMANDS, ...thirdParty], scratch);
  const mixedResult = await request(factory(mixed), "/");
  for (const command of thirdParty) assert.ok(mixedResult.items.some((item) => item.value === command.name && item.description === command.description));
  checks.push("Same-name third-party descriptions, skill names, custom commands and differently cased command values remain untouched in the real provider");

  const args = new CombinedAutocompleteProvider([{ name: "choose", getArgumentCompletions: () => [{ value: "settings", label: "Project settings", description: "Open settings menu" }] }], scratch);
  assert.deepEqual(await request(factory(args), "/choose "), await request(args, "/choose "));
  for (const text of ["set", '"hello']) {
    const before = await request(native, text, { force: true });
    assert.ok(before?.items.length);
    const after = await request(wrapped, text, { force: true });
    assert.deepEqual(after, before);
    for (let index = 0; index < before.items.length; index++) assert.deepEqual(wrapped.applyCompletion([text], 0, text.length, after.items[index], after.prefix), native.applyCompletion([text], 0, text.length, before.items[index], before.prefix));
    assert.equal(wrapped.shouldTriggerFileCompletion([text], 0, text.length), native.shouldTriggerFileCompletion([text], 0, text.length));
  }
  checks.push("Real command-argument suggestions and filename/quoted-filename completion preserve descriptions and completion behavior, including a file named settings");

  const metadata = { owner: "third-party" }, item = Object.freeze({ value: "settings", label: "Keep this label", description: "Open settings menu", metadata });
  const result = Object.freeze({ prefix: "/s", items: Object.freeze([item]), metadata });
  let seen, pendingResolve;
  class PrivateProvider {
    #name = "private-receiver";
    triggerCharacters = ["/", "@"];
    async getSuggestions(...values) { assert.equal(this.#name, "private-receiver"); seen = values; return result; }
    applyCompletion(...values) { return { receiver: this.#name, values }; }
    shouldTriggerFileCompletion() { return this.#name === "private-receiver"; }
  }
  const privateProvider = new PrivateProvider(), localized = factory(privateProvider);
  const value = await request(localized, "/s");
  assert.equal(value.items[0].metadata, metadata);assert.equal(value.metadata, metadata);assert.equal(value.items[0].label, item.label);
  assert.equal(item.description, "Open settings menu");assert.equal(localized.triggerCharacters, privateProvider.triggerCharacters);
  assert.equal(localized.applyCompletion("sentinel").receiver, "private-receiver");assert.equal(localized.shouldTriggerFileCompletion(), true);
  assert.equal(seen[3].signal, options.signal);
  enabled = false;assert.equal(await request(localized, "/s"), result);enabled = true;
  assert.equal(factory(localized), localized);
  checks.push("Frozen upstream items and metadata remain unchanged; private method receivers, trigger characters and AbortSignal delegate correctly; disabled mode returns the exact upstream result and duplicate outermost wrapping is avoided");

  for (const [text, prefix, force] of [["settings", "settings", false], ["/settings", "/settings", true], ["@settings", "@settings", false], ["/choose settings", "settings", false], ["./settings", "./settings", false]]) {
    const foreignResult = { prefix, items: [item] };
    const custom = { getSuggestions: async () => foreignResult, applyCompletion: () => {} };
    assert.equal(await request(factory(custom), text, { force }), foreignResult);
  }
  const spacedNative = await request(native, "  /set"), spacedChinese = await request(wrapped, "  /set");
  assert.equal(spacedChinese.prefix, spacedNative.prefix);assert.equal(spacedChinese.items[0].value, spacedNative.items[0].value);
  assert.notEqual(spacedChinese.items[0].description, spacedNative.items[0].description);
  checks.push("Only a slash-command-name context is localized; forced absolute paths, at-files, relative files and arguments with an identical builtin value/description are untouched");

  let outerCalls = 0;
  const foreign = Object.create(localized);
  foreign.getSuggestions = async (...values) => { outerCalls++; return localized.getSuggestions(...values); };
  const wrappedForeign = factory(foreign);assert.notEqual(wrappedForeign, foreign);await request(wrappedForeign, "/s");assert.equal(outerCalls, 1);
  const upstream = { getSuggestions: () => new Promise((resolve) => { pendingResolve = resolve; }), applyCompletion: () => {} };
  const late = request(factory(upstream), "/s");enabled = false;pendingResolve(result);assert.equal(await late, result);enabled = true;
  const failure = new Error("upstream sentinel"), failing = factory({ getSuggestions: async () => { throw failure; }, applyCompletion: () => {} });
  await assert.rejects(request(failing, "/"), (error) => error === failure);
  assert.equal(await request(factory({ getSuggestions: async () => null, applyCompletion: () => {} }), "/"), null);
  checks.push("Foreign provider layers are never skipped, a toggle while awaiting results takes effect immediately, and upstream rejection/null semantics are preserved");
} finally {
  assert.ok(scratch.startsWith(work + sep));
  for (const file of created) await unlink(join(scratch, file));
  await rmdir(scratch);
}
const report = { testedAt: new Date().toISOString(), passed: true, modelRequests: 0, piVersion: version,
  builtinCommandCount: BUILTIN_SLASH_COMMANDS.length, source: "Actual installed Pi CombinedAutocompleteProvider and core/slash-commands.js", checks };
await writeFile(join(root, "tests/command-chinese-validation.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
