from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit,parse_qs
import json,mimetypes

HERE=Path(__file__).resolve().parent
ROOT=Path('D:/Software Projects/pi-furry-partner').resolve()
CONFIG=json.loads((HERE/'auxiliary-review-config.json').read_text(encoding='utf-8'))
ITEMS={}
for key,value in CONFIG['items'].items():
 out=(ROOT/value['output']).resolve();ref=(ROOT/value['reference']).resolve()
 assert out.is_relative_to(ROOT) and ref.is_relative_to(ROOT)
 m=json.loads((out/'manifest.json').read_text(encoding='utf-8'))
 assert len(m['frames'])==107 and m['canvas']==[640,640]
 assert all((out/f'world-{c}.mp4').is_file() for c in ['black','gray','white'])
 ITEMS[key]={**value,'out':out,'ref':ref}
PUBLIC={key:{k:v for k,v in item.items() if k in ['label','note']} for key,item in ITEMS.items()}
PAGE='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>呜咪 · 多待机随机与挥爪</title><style>
:root{--bg:#000}*{box-sizing:border-box}body{margin:0;background:#131a25;color:#e7effd;font:16px/1.65 system-ui,sans-serif}main{max-width:1180px;margin:28px auto;padding:0 25px}h1{font-size:27px}p{color:#c5d3e8}button{font:inherit;background:#b6d6ff;color:#142237;border:0;padding:8px 15px;margin:3px 7px 3px 0;border-radius:7px;cursor:pointer}button.active{outline:2px solid #eac675;background:#d6e7ff}.pair{display:grid;grid-template-columns:1fr 1fr;gap:22px}figure{margin:0}figure img,figure video{width:100%;display:block;background:var(--bg);border-radius:12px}figcaption{padding:9px 0}.note{background:#243044;border-left:3px solid #e8bf6f;padding:13px 17px}small{color:#a8bad6}input{width:70%}.stream video{display:none}.stream video.active{display:block}#still{display:block;width:min(100%,640px);background:var(--bg);border-radius:9px}h2{font-size:21px}@media(max-width:720px){.pair{grid-template-columns:1fr}}
</style><main><h1>待机随机连播 · 挥爪新动作</h1><p>待机由原来的向左留意，加上正面放松、向右留意。随机演示只在完整片段结束后切换，不连续重复同一条。每条保持原速 1×、107 帧／24fps 和同一640px注册构图。</p>
<nav id="modes"><button data-mode="random" onclick="setMode('random')">随机待机连播</button><button data-mode="idle" onclick="setMode('idle')">原待机／左看</button><button data-mode="idle-center" onclick="setMode('idle-center')">正面放松</button><button data-mode="idle-right" onclick="setMode('idle-right')">向右留意</button><button data-mode="wave" onclick="setMode('wave')">挥爪</button></nav>
<p><button onclick="setBg('black','#000')">黑底</button><button onclick="setBg('gray','#7f7f7f')">灰底</button><button onclick="setBg('white','#fff')">白底</button><button onclick="restart()">从头播放</button><button onclick="toggle()">暂停／播放</button></p>
<div class="pair"><figure><img id="reference" src="/reference.png?id=idle"><figcaption>原待机参考 · 身份／配色／注册对照</figcaption></figure><figure><div id="stream" class="stream"></div><figcaption id="now"></figcaption></figure></div>
<div class="note"><strong id="modeTitle"></strong><div id="note"></div><small>源表演未变速、倒放或插帧；紫底通过独立蒙版提取，再修复边缘。此页为候选评审组合，尚未把新待机和挥爪装入正式版本；生产随机机制已有实际控制器验证。</small></div>
<h2>无损 RGBA 帧检查</h2><p>拖动时暂停连播。黑／灰／白底按钮也作用于下面同一份透明图，便于检查细边。</p><p><input id="slider" type="range" min="0" max="106" value="0" oninput="frame(this.value)"> <span id="frameLabel"></span></p><img id="still"><p><small>视频预览存在压缩；边缘以这里的无损帧为准。细暗紫边、毛尖和少量底缘颗粒继续披露，不能把内部检查通过当作零瑕疵。</small></p></main>
<script>const items=__ITEMS__, idleIds=['idle','idle-center','idle-right'], videos={},stream=document.querySelector('#stream');let mode='random',active='idle-center',bg='black';
for(const id of Object.keys(items)){const v=document.createElement('video');v.src='/video.mp4?id='+id+'&bg='+bg;v.preload='auto';v.muted=true;v.playsInline=true;v.controls=true;v.addEventListener('ratechange',()=>{v.playbackRate=1});v.addEventListener('ended',()=>{if(mode==='random'){const pool=idleIds.filter(x=>x!==active);show(pool[Math.floor(Math.random()*pool.length)])}});videos[id]=v;stream.append(v)}
function label(){document.querySelector('#now').textContent=items[active].label+' · '+(mode==='random'?'随机连播':'单条循环')+' · 1×';document.querySelector('#modeTitle').textContent=mode==='random'?'当前随机片段：'+items[active].label:items[active].label;document.querySelector('#note').textContent=items[active].note;document.querySelector('#still').src='/frame.png?id='+active+'&i='+document.querySelector('#slider').value;document.querySelector('#frameLabel').textContent=items[active].label+' '+String(document.querySelector('#slider').value).padStart(3,'0')+' / 106';for(const b of document.querySelectorAll('[data-mode]'))b.classList.toggle('active',b.dataset.mode===mode)}
function show(id){const old=videos[active],v=videos[id];old.pause();active=id;v.loop=mode!=='random';v.currentTime=0;for(const [k,x]of Object.entries(videos))x.classList.toggle('active',k===id);label();v.play().catch(()=>{})}
function setMode(value){mode=value;show(value==='random'?(idleIds.includes(active)?active:'idle-center'):value)}
function setBg(name,color){bg=name;document.documentElement.style.setProperty('--bg',color);for(const [id,v]of Object.entries(videos)){const t=v.currentTime,paused=v.paused;v.src='/video.mp4?id='+id+'&bg='+name;v.addEventListener('loadedmetadata',()=>{v.currentTime=t;if(id===active&&!paused)v.play().catch(()=>{})},{once:true})}}
function restart(){videos[active].currentTime=0;videos[active].play().catch(()=>{})}function toggle(){const v=videos[active];v.paused?v.play().catch(()=>{}):v.pause()}function frame(i){videos[active].pause();label()}
show(active);</script></html>'''.replace('__ITEMS__',json.dumps(PUBLIC,ensure_ascii=False)).encode('utf-8')

class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  u=urlsplit(self.path);q=parse_qs(u.query)
  if u.path=='/':data,mime=PAGE,'text/html; charset=utf-8'
  else:
   key=q.get('id',['idle'])[0]
   if key not in ITEMS:self.send_error(404);return
   item=ITEMS[key]
   if u.path=='/reference.png':path=item['ref']
   elif u.path=='/frame.png':
    try:i=int(q.get('i',['0'])[0]);assert 0<=i<107
    except (ValueError,AssertionError):self.send_error(400);return
    path=item['out']/'rgba'/f'{i:03}.png'
   elif u.path=='/video.mp4':
    color=q.get('bg',['black'])[0]
    if color not in ['black','gray','white']:self.send_error(400);return
    path=item['out']/f'world-{color}.mp4'
   else:self.send_error(404);return
   data=path.read_bytes();mime=mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
(HERE/'auxiliary-review-url.txt').write_text(f'http://127.0.0.1:{server.server_port}/',encoding='utf-8')
server.serve_forever()
