import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createStatusFooter } from "../lib/footer.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
import { agentDir, version, modules } from "./pi-runtime.mjs";
const { visibleWidth, truncateToWidth } = await import(pathToFileURL(join(modules, "@earendil-works/pi-tui/dist/index.js")));
const { stripTerminalSequences } = await import(pathToFileURL(join(modules, "@earendil-works/pi-tui/dist/utils.js")));
const checks = [];
const usage = (n) => ({ input:n, output:n*2, cacheRead:n*3, cacheWrite:n*4, cost:{total:n === 10 ? 0.1 : n === 1 ? 0.01 : n === 100 ? 1 : n === 1000 ? 2 : 3} });
const entries = [
  {type:"message",message:{role:"assistant",usage:usage(10)}},
  {type:"message",message:{role:"toolResult",usage:usage(1)}},
  {type:"usage",usage:usage(100)},
  {type:"compaction",usage:usage(1000)},
  {type:"branch_summary",usage:usage(10000)},
  {type:"message",message:{role:"assistant"}},
  {type:"compaction"},
  {type:"message",message:{role:"user",usage:usage(999)}},
];
let count=entries.length, leaf="leaf-1", session="session-1", cwd="C:\\Users\\test-user\\project", scans=0, contextScans=0, renders=0, unsubscribed=0, branchCallback;
let context={tokens:34500,percent:34.5,contextWindow:100000};
let currentTheme={fg:(_token,text)=>`\x1b[31m${text}\x1b[0m`};
const manager={getEntryCount:()=>count,getLeafId:()=>leaf,getSessionId:()=>session,getEntries:()=>{scans++;return entries},getCwd:()=>cwd};
const ctx={sessionManager:manager,model:{provider:"测试供应商",id:"超长中文模型名称/alpha-2026-模型",contextWindow:100000},ui:{get theme(){return currentTheme}},getContextUsage:()=>{contextScans++;return context}};
const statuses=new Map([["pi-furry-partner","partner self"],["pi-wink-companion","wink self"],["pi-wink-companion-editor","editor self"]]);
const footerData={getGitBranch:()=>"feature/中文分支",getExtensionStatuses:()=>statuses,onBranchChange(callback){branchCallback=callback;return()=>{unsubscribed++}}};
const footer=createStatusFooter({ctx,tui:{requestRender(){renders++}},theme:{fg:(_token,s)=>s},footerData,visibleWidth,truncateToWidth,getThinkingLevel:()=>"high"});
const plain=(lines)=>lines.map(stripTerminalSequences);
const originalHome=process.env.USERPROFILE;
try {
  process.env.USERPROFILE="C:\\Users\\test-user";
  const full=plain(footer.render(240));
  assert.equal(full.length,2);
  assert.match(full[0],/测试供应商\/超长中文模型名称/);
  assert.match(full[0],/思考 high/);
  assert.match(full[0],/CTX \[[━─]{8}\] 34\.5%\/100k/);
  assert.match(full[1],/~\\project · feature\/中文分支/);
  assert.match(full[1],/↑11k ↓22k R33k W44k \$6\.110/);
  checks.push("All native usage sources aggregated, missing usage skipped, user-message usage ignored, cache/cost and Windows home/branch displayed");

  for (const width of [1,2,3,8,13,16,24,39,40,55,69,70,80,100,160,240]) {
    const lines=footer.render(width);
    assert.equal(lines.length,2);
    for(const line of lines) assert.ok(visibleWidth(line)<=width,`Footer overflow at width ${width}`);
    footer.invalidate();
  }
  assert.equal(scans,1);assert.equal(contextScans,1);
  assert.ok(plain(footer.render(39))[0].includes("35%/100k"));
  checks.push("CJK/long model responsive widths 1–240, compact model/context preserved, repeated render/invalidate scans usage and context only once");

  cwd="C:\\Users\\test-user-other\\project";
  assert.match(plain(footer.render(240))[1],/C:\\Users\\test-user-other\\project/);
  assert.ok(!plain(footer.render(240))[1].includes("~"));
  cwd="D:\\work\\project";
  assert.match(plain(footer.render(240))[1],/D:\\work\\project/);
  cwd="c:\\users\\test-user\\中文目录";
  assert.match(plain(footer.render(240))[1],/~\\中文目录/);
  checks.push("Windows home shortening respects path boundaries, drive changes and case-insensitive Windows paths");

  statuses.set("z-other","\x1b[32mexternal green\x1b[0m");
  statuses.set("a-other","first\nsecond\tstatus");
  const external=footer.render(80);
  assert.equal(external.length,3);
  assert.match(stripTerminalSequences(external[2]),/^first second status  external green/);
  assert.ok(!external[2].includes("self"));
  assert.ok(external[2].includes("\x1b[32m"));
  for (const width of [1,8,24,39,70]) for(const line of footer.render(width)) assert.ok(visibleWidth(line)<=width);
  statuses.delete("a-other");statuses.delete("z-other");
  assert.equal(footer.render(80).length,2);
  currentTheme={fg:(_token,text)=>`\x1b[34m${text}\x1b[0m`};
  assert.ok(footer.render(80)[0].includes("\x1b[34m"));
  assert.equal(scans,1);assert.equal(contextScans,1);
  checks.push("Only external extension statuses create third row, sorted/sanitized while retaining ANSI; theme follows live ctx without scanning session");

  branchCallback();assert.equal(renders,1);footer.render(80);assert.equal(scans,1);
  leaf="leaf-2";footer.render(80);assert.equal(scans,2);assert.equal(contextScans,2);
  count++;footer.render(80);assert.equal(scans,3);
  ctx.model={...ctx.model,contextWindow:200000};footer.render(80);assert.equal(scans,4);
  session="session-2";context={tokens:null,percent:null,contextWindow:200000};
  assert.match(plain(footer.render(240))[0],/\?\/200k/);assert.equal(scans,5);
  checks.push("Branch changes request render without scans; leaf/count/model/session changes refresh usage/context; post-compaction unknown context stays unknown");
  footer.dispose();footer.dispose();assert.equal(unsubscribed,1);
  branchCallback();assert.equal(renders,1);assert.deepEqual(footer.render(80),[]);
  checks.push("Dispose is idempotent, unsubscribes branch watcher and prevents stale context rendering");
} finally {
  footer.dispose();
  if(originalHome===undefined)delete process.env.USERPROFILE;else process.env.USERPROFILE=originalHome;
}

let usageReads=0, fallbackCalls=0, fallbackContextCalls=0;
const fallbackEntries=[{type:"usage",get usage(){usageReads++;return {input:3,output:4}}}];
const fallback=createStatusFooter({
  ctx:{sessionManager:{getEntries(){fallbackCalls++;return fallbackEntries}},model:{id:"fallback-model",provider:"fallback"},cwd:"/outside",getContextUsage(){fallbackContextCalls++;return undefined},ui:{theme:{fg:(_token,s)=>s}}},
  tui:{requestRender(){}},theme:{},footerData:{getExtensionStatuses:()=>new Map()},visibleWidth,truncateToWidth,
});
for(let i=0;i<10;i++)fallback.render(100);
assert.equal(fallbackCalls,10);assert.equal(usageReads,1);assert.equal(fallbackContextCalls,1);
assert.ok(!fallback.render(100).join(" ").includes("$"));
fallbackEntries.push({type:"usage",usage:{input:5,output:6}});fallback.render(100);assert.equal(usageReads,2);
fallback.dispose();
checks.push("Legacy getEntries().length fallback avoids repeated usage aggregation; partial usage is safe and zero cost adds no subscription/cost claims");

const report={testedAt:new Date().toISOString(),piVersion:version,modelRequests:0,passed:true,checks};
await writeFile(join(root,"tests/footer-validation.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
