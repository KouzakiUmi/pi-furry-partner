from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
out = Path(r'C:\Users\Fractal\Documents\Codex\2026-10-15\x20\outputs\Umi-H3-Expressions\ordinary-blink-eye-review')
out.mkdir(parents=True, exist_ok=True)
for name in ['open.png', 'closed.png', 'eye-mask.png', 'audit.json']:
    shutil.copy2(root / 'work/blink-eye-pilot' / name, out / name)
out.joinpath('index.html').write_text('''<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Umi · 普通版眨眼试片</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#141820;color:#e8edf5;font:16px/1.7 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1080px;margin:38px auto;padding:0 28px}h1{font-size:30px;margin:0 0 8px}p{color:#b3bed0;margin:8px 0 20px}.tag{display:inline-block;color:#9fc9fa;background:#243043;border:1px solid #3c526f;border-radius:20px;padding:3px 13px;font-size:13px}.controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:22px 0}button{background:#263246;color:#e6efff;border:1px solid #465974;border-radius:9px;padding:9px 16px;cursor:pointer;font:inherit;font-size:14px}button:hover,button[aria-pressed=true]{background:#3b5c84;border-color:#96c9ff}.status{margin-left:10px;color:#a8cbf3;min-width:140px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.card{border:1px solid #354052;border-radius:16px;overflow:hidden;background:#1c2330}.label{padding:12px 16px;font-size:15px}.stage{background:#0b0d11;display:flex;align-items:center;justify-content:center;min-height:222px}.stage img{display:block;width:196px;height:196px;object-fit:contain}.big{margin-top:22px;display:grid;grid-template-columns:minmax(340px,1fr) 1fr}.big .stage{min-height:440px}.big img{width:420px;height:420px;max-width:100%;object-fit:contain}.notes{padding:22px 26px;color:#b7c4d6}.notes h2{color:#edf4ff;font-size:19px}.notes li{margin:9px 0}.notes small{color:#8f9daf}.foot{margin-top:20px;font-size:13px}.bg-controls{margin:14px 0}a{color:#9bc9fb}@media(max-width:750px){.grid{grid-template-columns:1fr}.big{grid-template-columns:1fr}.stage{min-height:210px}h1{font-size:25px}}
</style><main>
<span class="tag">普通版 · 待确认试片 · 尚未安装</span>
<h1>睁眼 → 闭眼：让角色保持原来的大小</h1>
<p>以当前普通版待机睁眼图为底图，只替换双眼区域。请重点看头部、兜帽、肩膀和爪子在眨眼瞬间是否稳定。</p>
<div class="controls"><button data-mode="auto" aria-pressed="true">循环播放</button><button data-mode="open" aria-pressed="false">停在睁眼</button><button data-mode="closed" aria-pressed="false">停在闭眼</button><span class="status" id="status">正在加载</span></div>
<div class="grid">
<section class="card"><div class="label">当前睁眼底图 · 196px</div><div class="stage"><img src="open.png" alt="当前睁眼底图"></div></section>
<section class="card"><div class="label">闭眼试片 · 196px</div><div class="stage"><img src="closed.png" alt="只改变眼区的闭眼试片"></div></section>
<section class="card"><div class="label">实际显示尺寸循环 · 196px</div><div class="stage"><img class="loop" src="open.png" alt="普通版眨眼循环"></div></section>
</div>
<div class="bg-controls controls"><span>检查背景：</span><button data-bg="#0b0d11" aria-pressed="true">深色</button><button data-bg="#808080" aria-pressed="false">灰色</button><button data-bg="#ffffff" aria-pressed="false">白色</button></div>
<section class="card big"><div class="stage"><img class="loop" src="open.png" alt="眨眼放大检查"></div><div class="notes"><h2>这次检查什么</h2><ul><li>眼区以外的 RGBA 像素逐个保持一致。</li><li>全图透明度保持一致；没有全身缩放或位置补偿。</li><li>豆豆眉、头发、兜帽轮廓、身体和爪子保留原图。</li><li>循环沿用普通版节奏：每 4.93 秒一次，闭眼 170 毫秒。</li></ul><small>两个独立辅助审查已完成：眼线和接缝检查、像素差异和实际控制器的显示参数检查。当前仅展示试片，尚未替换安装目录。</small></div></section>
<p class="foot">DSH 风格选项同时精简为「插画 / 像素」；旧配置自动映射。<a href="audit.json">查看试片像素检查记录</a></p>
</main><script>
let mode='auto', epoch=performance.now();const imgs=[...document.querySelectorAll('.loop')];const preload=['open.png','closed.png'].map(src=>{const img=new Image;img.src=src;return img.decode()});
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;epoch=performance.now();document.querySelectorAll('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',x===b))});
document.querySelectorAll('[data-bg]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.stage').forEach(el=>el.style.background=b.dataset.bg);document.querySelectorAll('[data-bg]').forEach(x=>x.setAttribute('aria-pressed',x===b))});
Promise.all(preload).then(()=>{function tick(t){let phase=(t-epoch)%4930,closed=mode==='closed'||mode==='auto'&&phase>=2300&&phase<2470,file=closed?'closed.png':'open.png';for(const el of imgs)if(el.getAttribute('src')!==file)el.src=file;document.querySelector('#status').textContent=(mode==='auto'?'循环 · ':'静止 · ')+(closed?'闭眼':'睁眼');requestAnimationFrame(tick)}requestAnimationFrame(tick)});
</script></html>''', encoding='utf-8')
print(out)
