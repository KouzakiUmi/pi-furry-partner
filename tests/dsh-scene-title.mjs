import assert from 'node:assert/strict';
import {dshSceneTitle} from '../lib/dsh-scene-title.mjs';
const question={toolName:'ask_user_question',phase:'waiting',toolObject:'internal-payload'};
const modes=[question,{...question,drowsy:true},{...question,reaction:'startled'},{...question,reaction:'listening'}];
for(const language of ['zh-CN','en']) {
 const titles=modes.map(s=>dshSceneTitle(s,language));
 assert.equal(new Set(titles).size,4,'Question, dozing, waking and listening have distinct scene lines');
 for(const title of titles){assert.ok(title.length<50);assert.doesNotMatch(title,/ask_user_question|internal-payload/);}
}
assert.match(dshSceneTitle(question,'zh-CN'),/想法/);
assert.match(dshSceneTitle(question,'en'),/thoughts/);
assert.equal(dshSceneTitle({toolName:'read',toolObject:'src/main.js'},'en'),'read · src/main.js','Other tools retain existing technical display');
assert.equal(dshSceneTitle({},'zh-CN'),'');
assert.deepEqual(question,{toolName:'ask_user_question',phase:'waiting',toolObject:'internal-payload'},'Display mapping does not mutate actual tool metadata');
console.log('DSH question scene titles: bilingual wait/doze/wake/listen, no tool name leakage or metadata mutations passed.');
