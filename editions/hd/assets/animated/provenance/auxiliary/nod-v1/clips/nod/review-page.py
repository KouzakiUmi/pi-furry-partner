from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit,parse_qs
import json,mimetypes

HERE=Path(__file__).resolve().parent
BASE=Path('D:/Software Projects/pi-furry-partner/Hi-Res/sources/h3-motion-polish-20261023/nod/key-purple-pilot-v1').resolve()
config=json.loads((HERE/'nod-alpha-config.json').read_text(encoding='utf-8'))
OUT=(BASE/config['outputDirectory']).resolve()
assert OUT.parent==BASE and (OUT/'manifest.json').is_file()
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
assert len(manifest['frames'])==107 and manifest['canvas']==[640,640]
PAGE='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>呜咪 · 点头透明边缘复核</title><style>
:root{--bg:#000}body{margin:0;background:#151b25;color:#e8f0ff;font:16px/1.7 system-ui,sans-serif}main{max-width:1150px;margin:28px auto;padding:0 24px}h1{font-size:26px}p{color:#c5d3e9}.pair{display:grid;grid-template-columns:1fr 1fr;gap:22px}figure{margin:0}figure img,video{display:block;width:100%;background:var(--bg);border-radius:12px}figcaption{padding:9px 0}button{font:inherit;border:0;border-radius:6px;background:#b3d2ff;color:#152131;padding:7px 15px;cursor:pointer;margin:3px 7px 3px 0}.note{border-left:3px solid #e7bc63;padding:11px 16px;background:#242e3f}small{color:#a4b8d3}a{color:#b3d2ff}input{width:70%}@media(max-width:700px){.pair{grid-template-columns:1fr}}
</style><main><h1>点头 · 透明边缘复核</h1><p>沿用你认可的源片表演，保持原生 107 帧 / 24 fps / 4.458 秒与固定 640px 构图。原速播放，没有提速、倒放、混帧或逐帧缩放。</p>
<p><button onclick="bg('black','#000')">黑底</button><button onclick="bg('gray','#7f7f7f')">灰底</button><button onclick="bg('white','#fff')">白底</button><button onclick="video.currentTime=0;video.play()">重播</button><button onclick="video.paused?video.play():video.pause()">暂停 / 播放</button></p>
<div class="pair"><figure><img src="/reference.png"><figcaption>批准的待机参考 · 相同锚点</figcaption></figure><figure><video id="v" src="/black.mp4" autoplay loop muted playsinline controls></video><figcaption>透明处理后的新点头 · 原速 1×</figcaption></figure></div>
<div class="note">紫底已通过独立蒙版提取与前景颜色恢复移除，另做暗轮廓白边处理；只恢复本片已核实的实心脸内误透明，保持外轮廓与原动作。视频预览有压缩，下面可查看同一份无损 RGBA 的黑／灰／白底效果。细暗边和毛尖颗粒仍需以实际观感判断。</div>
<h2 style="font-size:20px">无损帧检查</h2><p><input id="slider" type="range" min="0" max="106" value="0" oninput="frame(this.value)"> <span id="frameLabel">000 / 106</span></p><img id="still" src="/frame.png?i=0" style="display:block;width:min(100%,640px);background:var(--bg);image-rendering:auto;border-radius:10px">
<p><small>本页仅供透明边缘评审；尚未替换正式素材、安装或发布。高清主线去像素与执行／阅读修复已另行构建，不依赖这段新素材。</small></p></main><script>
const video=document.querySelector('#v');video.addEventListener('ratechange',()=>{video.playbackRate=1});
function bg(name,color){const t=video.currentTime,paused=video.paused;document.documentElement.style.setProperty('--bg',color);video.src='/'+name+'.mp4';video.addEventListener('loadedmetadata',()=>{video.currentTime=t;if(!paused)video.play()},{once:true})}
function frame(i){document.querySelector('#still').src='/frame.png?i='+i;document.querySelector('#frameLabel').textContent=String(i).padStart(3,'0')+' / 106'}
</script></html>'''.encode('utf-8')

class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  u=urlsplit(self.path)
  routes={'/reference.png':BASE/'registered-reference.png',**{f'/{c}.mp4':OUT/f'world-{c}.mp4' for c in ['black','gray','white']}}
  if u.path=='/':data,mime=PAGE,'text/html; charset=utf-8'
  else:
   if u.path=='/frame.png':
    try:index=int(parse_qs(u.query).get('i',['0'])[0]);assert 0<=index<107
    except (ValueError,AssertionError):self.send_error(400);return
    path=OUT/'rgba'/f'{index:03}.png'
   elif u.path in routes:path=routes[u.path]
   else:self.send_error(404);return
   if not path.is_file():self.send_error(404);return
   data=path.read_bytes();mime=mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 def log_message(self,*args):pass

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
(HERE/'nod-alpha-review-url.txt').write_text(f'http://127.0.0.1:{server.server_port}/',encoding='utf-8')
server.serve_forever()
