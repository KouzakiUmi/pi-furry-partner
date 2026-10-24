import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createChineseAutocompleteFactory } from "../lib/command-chinese.mjs";
import { getMascotArgumentCompletions } from "../lib/mascot-autocomplete.mjs";
import { root, modules, version } from "./pi-runtime.mjs";

const load = (file) => import(pathToFileURL(file));
const { CombinedAutocompleteProvider } = await load(join(modules, "@earendil-works/pi-tui/dist/index.js"));
const suggestions = (prefix, language = "en") => getMascotArgumentCompletions(prefix, language);
const values = (prefix, language) => suggestions(prefix, language)?.map((item) => item.value) ?? [];
const labels = (prefix, language) => suggestions(prefix, language)?.map((item) => item.label) ?? [];
const checks = [];

assert.deepEqual(labels(""), [
  "language", "menu", "poke", "layout", "style", "pause", "play", "on", "off",
  "size", "render", "info", "locale", "prompt", "persona", "demo", "wink",
]);
assert.deepEqual(labels("st"), ["style"]);
assert.deepEqual(values("style"), ["style "]);
assert.deepEqual(values("style "), ["style umi"]);
assert.deepEqual(values("style um"), ["style umi"]);
assert.deepEqual(values("STYLE U"), ["style umi"]);
assert.deepEqual(values("language zh"), ["language zh-CN"]);
assert.deepEqual(values("demo thin"), ["demo thinking"]);
checks.push("Top-level commands and second-level values complete hierarchically and case-insensitively");

assert.equal(suggestions("unknown"), null);
assert.equal(suggestions("pause "), null);
assert.equal(suggestions("style umi "), null);
assert.equal(suggestions("style umi extra"), null);
assert.match(suggestions("style ", "zh-CN")[0].description, /插画风/u);
assert.match(suggestions("style ", "en")[0].description, /Illustrated/u);
checks.push("Invalid extra arguments return no suggestions and descriptions follow the selected language");

let language = "en";
const provider = new CombinedAutocompleteProvider([{
  name: "mascot",
  description: "Umi",
  getArgumentCompletions: (prefix) => getMascotArgumentCompletions(prefix, language),
}], root);
const request = (text, target = provider) => target.getSuggestions([text], 0, text.length, { signal: new AbortController().signal });

const commandResult = await request("/mascot st");
assert.equal(commandResult.prefix, "st");
assert.deepEqual(commandResult.items.map(({ value, label }) => ({ value, label })), [{ value: "style ", label: "style" }]);
assert.deepEqual(provider.applyCompletion(["/mascot st"], 0, 10, commandResult.items[0], commandResult.prefix), {
  lines: ["/mascot style "], cursorLine: 0, cursorCol: 14,
});

const valueResult = await request("/mascot style um");
assert.equal(valueResult.prefix, "style um");
assert.deepEqual(valueResult.items.map(({ value, label }) => ({ value, label })), [
  { value: "style umi", label: "umi" },
]);
assert.deepEqual(provider.applyCompletion(["/mascot style um"], 0, 16, valueResult.items[0], valueResult.prefix), {
  lines: ["/mascot style umi"], cursorLine: 0, cursorCol: 17,
});
language = "zh-CN";
assert.match((await request("/mascot style u")).items[0].description, /插画风/u);
const wrapped = createChineseAutocompleteFactory({ isEnabled: () => true, getLanguage: () => language })(provider);
assert.deepEqual(await request("/mascot style u", wrapped), await request("/mascot style u"));
checks.push("The installed Pi CombinedAutocompleteProvider displays and applies complete nested /mascot arguments correctly, including through the Chinese provider wrapper");

console.log(JSON.stringify({ testedAt: new Date().toISOString(), passed: true, modelRequests: 0, piVersion: version, checks }, null, 2));
