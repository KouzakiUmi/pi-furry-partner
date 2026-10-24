"""Serve an explicit, read-only two-action review without changing approved pages."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs
import argparse
import hashlib
import json
import mimetypes

parser = argparse.ArgumentParser()
parser.add_argument('--config', required=True)
args = parser.parse_args()
config_path = Path(args.config).resolve()
config = json.loads(config_path.read_text(encoding='utf-8'))
root = Path(config['root']).resolve()
items = {}
evidence = {'config': str(config_path), 'configSha256': hashlib.sha256(config_path.read_bytes()).hexdigest(), 'items': {}}
for key, entry in config['items'].items():
    output = (root / entry['output']).resolve()
    reference = (root / entry['reference']).resolve()
    assert output.is_relative_to(root) and reference.is_relative_to(root)
    manifest_path = output / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    assert len(manifest['frames']) == 107 and manifest['canvas'] == [640, 640]
    assert reference.is_file()
    assert all((output / f'world-{color}.mp4').is_file() for color in ['black', 'gray', 'white'])
    assert all((output / 'rgba' / f'{i:03}.png').is_file() for i in range(107))
    items[key] = {**entry, 'outputPath': output, 'referencePath': reference}
    evidence['items'][key] = {'output': entry['output'], 'manifestSha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest()}
public = {key: {field: value for field, value in item.items() if field in ['label', 'note']} for key, item in items.items()}
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>呜咪 · 抖耳与晃脑袋原速评审</title>
<style>:root{--matte:#000}*{box-sizing:border-box}body{margin:0;background:#141c28;color:#eaf1ff;font:16px/1.7 system-ui,sans-serif}main{max-width:1180px;margin:28px auto;padding:0 24px}h1{font-size:27px}h2{font-size:21px}p{color:#c6d5eb}button{font:inherit;background:#bcd9ff;border:0;border-radius:7px;padding:8px 15px;margin:3px 8px 3px 0;cursor:pointer}button.active{outline:2px solid #edc56f;background:#e0edff}.pair{display:grid;grid-template-columns:1fr 1fr;gap:22px}figure{margin:0}img,video{width:100%;display:block;background:var(--matte);border-radius:10px}figcaption{padding:8px 0}.note{border-left:3px solid #efc870;background:#263247;padding:13px 18px}small{color:#afc3df}input{width:70%}#frames{max-width:640px}@media(max-width:740px){.pair{grid-template-columns:1fr}}</style>
<main><h1>抖耳＋晃脑袋 · 原速与透明边缘评审</h1><p>每条保持 H3 原生 1× 时间、完整 107 帧与统一 640px 世界注册。先确认动作表达、爪形、服装体积和循环，再确认不同底色的透明边缘。</p><nav id="actions"></nav><p><button onclick="background('black','#000')">黑底</button><button onclick="background('gray','#7f7f7f')">灰底</button><button onclick="background('white','#fff')">白底</button><button onclick="restart()">从头播放</button><button onclick="toggle()">暂停／播放</button></p>
<div class="pair"><figure><img id="reference"><figcaption>批准的二维基准 · 身份、配色与尺度对照</figcaption></figure><figure><video id="movie" muted playsinline loop controls preload="auto"></video><figcaption id="caption"></figcaption></figure></div><div class="note"><strong id="name"></strong><div id="note"></div><small>本页两条新候选尚未进入正式资源；探头已获批准并另行接入。评审通过后才接入本页动作。技术检查不能代替动作、造型和配色验收。</small></div>
<h2>同一份无损 RGBA 帧</h2><p>拖动暂停视频。下图直接显示透明 PNG；黑／灰／白底按钮同时作用于视频预览和无损帧。</p><p><input id="slider" type="range" min="0" max="106" value="0" oninput="frame(this.value)"> <span id="frameLabel"></span></p><img id="frames"><p><small>视频预览有压缩；细边以无损 PNG 为准。已知细暗边、毛尖或底缘颗粒按各片说明披露。</small></p></main>
<script>const items=__ITEMS__,movie=document.querySelector('#movie');let active=Object.keys(items)[0],matte='black';
for(const [id,item]of Object.entries(items)){const b=document.createElement('button');b.textContent=item.label;b.dataset.id=id;b.onclick=()=>select(id);document.querySelector('#actions').append(b)}
function updateFrame(){const i=document.querySelector('#slider').value;document.querySelector('#frames').src='/frame.png?id='+encodeURIComponent(active)+'&i='+i;document.querySelector('#frameLabel').textContent=String(i).padStart(3,'0')+' / 106'}
function select(id){if(!items[id])return;movie.pause();active=id;document.querySelector('#reference').src='/reference.png?id='+encodeURIComponent(id);document.querySelector('#name').textContent=items[id].label;document.querySelector('#note').textContent=items[id].note;document.querySelector('#caption').textContent=items[id].label+' · 完整原速循环 · 1×';history.replaceState(null,'','#'+encodeURIComponent(id));for(const b of document.querySelectorAll('[data-id]'))b.classList.toggle('active',b.dataset.id===id);document.querySelector('#slider').value=0;updateFrame();movie.src='/video.mp4?id='+encodeURIComponent(id)+'&bg='+matte;movie.play().catch(()=>{})}
function background(name,color){const time=movie.currentTime,paused=movie.paused;matte=name;document.documentElement.style.setProperty('--matte',color);movie.src='/video.mp4?id='+encodeURIComponent(active)+'&bg='+name;movie.addEventListener('loadedmetadata',()=>{movie.currentTime=Math.min(time,movie.duration||time);if(!paused)movie.play().catch(()=>{})},{once:true})}
function restart(){movie.currentTime=0;movie.play().catch(()=>{})}function toggle(){movie.paused?movie.play().catch(()=>{}):movie.pause()}function frame(){movie.pause();updateFrame()}movie.addEventListener('ratechange',()=>{if(movie.playbackRate!==1)movie.playbackRate=1});const initial=decodeURIComponent(location.hash.slice(1));select(items[initial]?initial:active);</script></html>'''.replace('__ITEMS__', json.dumps(public, ensure_ascii=False)).encode('utf-8')
evidence['serverSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
evidence['pageSha256'] = hashlib.sha256(page).hexdigest()

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlsplit(self.path)
        query = parse_qs(parsed.query)
        if parsed.path == '/':
            data, mime = page, 'text/html; charset=utf-8'
        else:
            key = query.get('id', [''])[0]
            if key not in items:
                self.send_error(404)
                return
            item = items[key]
            if parsed.path == '/reference.png':
                path = item['referencePath']
            elif parsed.path == '/frame.png':
                try:
                    number = int(query.get('i', ['0'])[0])
                    assert 0 <= number < 107
                except (ValueError, AssertionError):
                    self.send_error(400)
                    return
                path = item['outputPath'] / 'rgba' / f'{number:03}.png'
            elif parsed.path == '/video.mp4':
                color = query.get('bg', ['black'])[0]
                if color not in ['black', 'gray', 'white']:
                    self.send_error(400)
                    return
                path = item['outputPath'] / f'world-{color}.mp4'
            else:
                self.send_error(404)
                return
            data = path.read_bytes()
            mime = mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
url = f'http://127.0.0.1:{server.server_port}/'
config_path.with_suffix('.url.txt').write_text(url, encoding='utf-8')
config_path.with_suffix('.evidence.json').write_text(json.dumps({**evidence, 'url': url}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(url, flush=True)
server.serve_forever()
