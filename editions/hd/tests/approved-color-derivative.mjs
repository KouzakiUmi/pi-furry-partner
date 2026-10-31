// Exact current color derivatives are separate from historical original-source approval tests.
// Alpha stays byte-identical; RGB is checked with alpha-weighted PSNR/dE76 because the
// shipped hi-res frames are lossy q90 WebP bound back to the approved bytes.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const result=spawnSync('python',[resolve(root,'tools/verify-approved-color-consistency.py')],{cwd:root,encoding:'utf8',maxBuffer:1024*1024,timeout:600000});
assert.equal(result.status,0,result.stderr||result.error?.message);
const proof=JSON.parse(result.stdout.trim().split('\n').at(-1));
assert.equal(proof.passed,true);assert.equal(proof.clipCount,29);assert.equal(proof.HDWholeRGBAFrames,3048);assert.equal(proof.HDAlphaExact,true);
assert.ok(proof.HDRgbSampledFrames>=270,'Every clip contributes sampled RGB reconstruction frames');
assert.ok(proof.HDAlphaWeightedPsnrMin>=35,`Lowest alpha-weighted PSNR ${proof.HDAlphaWeightedPsnrMin} dB`);
assert.ok(proof.HDAlphaWeightedDe76Max<=2.2,`Worst alpha-weighted dE76 ${proof.HDAlphaWeightedDe76Max}`);
assert.equal(proof.lossyRecordBoundToApproval,true,'Lossy re-encode stays bound to the frozen approval bytes');
assert.equal(proof.PiOriginalNoncolorMetadataExact,true);assert.equal(proof.sameReviewedCommonPalette,true);assert.equal(proof.workInputsRequired,false);
console.log('Current approved color derivatives:',JSON.stringify(proof));
