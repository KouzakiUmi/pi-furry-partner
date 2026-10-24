#!/usr/bin/env node
// A cell-accurate layout comparison from the actual dock/editor composition.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { dockGeometry, renderDock, joinEditor, editorFrameGeometry, frameEditorLines, activityBorder } from "../lib/editor-layout.mjs";
import { modules } from "../tests/pi-runtime.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const args=process.argv.slice(2), option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1]};
const work=join(root,"work/caption-layout-preview");await mkdir(work,{recursive:true});
const output=resolve(option("--output",join(work,"Umi-bubble-layout-comparison.png")));
const {visibleWidth,truncateToWidth}=await import(pathToFileURL(join(modules,"@earendil-works/pi-tui/dist/index.js")).href);
const {stripTerminalSequences}=await import(pathToFileURL(join(modules,"@earendil-works/pi-tui/dist/utils.js")).href);
const sheet=JSON.parse(await readFile(join(root,"assets/reactions/wumi/reaction-sheet.json"),"utf8"));
const theme={fg:(_color,text)=>text};
const snapshot={face:"idle-open",phase:"idle",language:"en",color:"accent",bubble:"All ears",glyph:"🐾",phrase:"Mm-hm, I'm listening to your idea.",label:"I'm listening",elapsedMs:0,toolCount:0};
const segmenter=new Intl.Segmenter("en",{granularity:"grapheme"});
const samples=[];
for(const [label,geometry]of [["Before · 16-cell caption",{collapsed:false,columns:16,captionColumns:16,imageOffset:0,rows:8,leftWidth:19}],["After · adaptive 20-cell caption",dockGeometry(100,40)]]){
  let display;
  const dock=renderDock({geometry,sheet,snapshot,theme,visibleWidth,truncateToWidth,renderAvatar(frame){display=frame;return Array.from({length:frame.rows},()=>" ".repeat(frame.columns))}});
  assert.equal(display.columns,16);assert.equal(display.rows,8);
  const frame=editorFrameGeometry(100-geometry.leftWidth);
  const native=[activityBorder({snapshot,width:frame.innerWidth,theme,visibleWidth,truncateToWidth}),"  I have an idea for our next change.","── Enter Send · Shift+Enter New line · / Command"];
  const framed=frameEditorLines({nativeLines:native,width:frame.outerWidth,visibleLineCount:1,visibleWidth,truncateToWidth});
  const combined=joinEditor({width:100,nativeLines:framed,dockLines:dock,geometry,snapshot,theme,visibleWidth,truncateToWidth,editorInset:frame.inset});
  assert.ok(combined.lines.every(line=>visibleWidth(line)<=100));
  const rows=combined.lines.map(line=>{let column=0;return [...segmenter.segment(stripTerminalSequences(line))].map(({segment})=>{const value={text:segment,column,width:visibleWidth(segment)};column+=value.width;return value})});
  samples.push({label,geometry,editorStart:combined.leftWidth,contentX:combined.contentX,rows});
}
assert.equal(samples[1].editorStart-samples[0].editorStart,4);
const image=sheet.frames[sheet.ids["idle-open"]];
await writeFile(join(work,"manifest.json"),JSON.stringify({samples,sheet:{width:sheet.width,height:sheet.height,palette:sheet.palette,pixels:image.pixels},cell:[10,20],terminalColumns:100,actualModules:["renderDock","joinEditor","frameEditorLines","activityBorder"],notATerminalScreenshot:true}));
const result=spawnSync(option("--python","python"),[join(root,"scripts/render_caption_layout_preview.py"),"--input",work,"--output",output],{encoding:"utf8"});
if(result.stdout)process.stdout.write(result.stdout);if(result.status!==0)throw new Error(result.stderr||"Caption layout render failed");
