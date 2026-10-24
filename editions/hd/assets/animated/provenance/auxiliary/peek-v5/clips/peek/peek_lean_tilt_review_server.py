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
    assert len(manifest['frames']) == 107 and manifest['canvas'] == [896, 896]
    assert reference.is_file()
    assert all((output / f'world-{color}.mp4').is_file() for color in ['black', 'gray', 'white'])
    assert all((output / 'rgba' / f'{i:03}.png').is_file() for i in range(107))
    items[key] = {**entry, 'outputPath': output, 'referencePath': reference}
    evidence['items'][key] = {'output': entry['output'], 'manifestSha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest()}
public = {key: {field: value for field, value in item.items() if field in ['label', 'note']} for key, item in items.items()}
page = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>好奇探头 · 前倾与微歪头</title><style>:root{--matte:#000}*{box-sizing:border-box}body{margin:0;background:#151e2b;color:#edf3ff;font:16px/1.7 system-ui,sans-serif}main{max-width:1180px;margin:26px auto;padding:0 24px}h1{font-size:27px}h2{font-size:21px}p,small{color:#bdcee6}button{font:inherit;padding:8px 15px;margin:4px 8px 4px 0;border:0;border-radius:7px;background:#bedbff;cursor:pointer}.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px}figure{margin:0}video,img,canvas{display:block;width:100%;background:var(--matte);border-radius:10px}figcaption{padding:8px 0}.note{border-left:3px solid #eac36f;background:#27364e;padding:12px 18px}input{width:70%}#neutral{max-width:300px}@media(max-width:740px){.pair{grid-template-columns:1fr}}</style><main><h1>好奇探头 · 前倾与微歪头</h1><p>左边是双爪已认可、但前倾感不足的版本，右边是重新生成的前倾＋微歪头候选。重点看是否像好奇地凑近看看，同时留意双爪是否仍稳定支撑；两条均保持原生1×、24fps／107帧与相同世界显示尺度。</p><p><button onclick="background(\'black\',\'#000\')">黑底</button><button onclick="background(\'gray\',\'#7f7f7f\')">灰底</button><button onclick="background(\'white\',\'#fff\')">白底</button><button onclick="restart()">两条从头播放</button><button onclick="toggle()">暂停／播放</button></p><div class="pair"><figure><video id="old" muted loop playsinline controls></video><figcaption>上一版 · 双爪认可，前倾感不足</figcaption></figure><figure><video id="new" muted loop playsinline controls></video><figcaption>新候选 · 上身前倾，微歪脑袋</figcaption></figure></div><div class="note">__KNOWN_ISSUES__</div><h2>同帧无损查看 · 双爪放大</h2><p>拖动暂停两条；放大区域包含两只爪子，使用固定世界坐标，仅作查看，不按每帧爪位追踪、缩放或变形。</p><p><input id="slider" type="range" min="0" max="106" value="36" oninput="frame(this.value)"> <span id="label"></span></p><div class="pair"><figure><canvas id="oldCrop" width="640" height="240"></canvas><figcaption>上一版双爪</figcaption><img id="oldFrame"></figure><figure><canvas id="newCrop" width="640" height="240"></canvas><figcaption>新候选双爪</figcaption><img id="newFrame"></figure></div><h2>原待机参考</h2><p>原二维待机负责身份、配色与爪形；上一版的原位双爪支撑已认可。新候选只加强前倾和微歪头的整体表现，不以伸爪或整体缩放代替探头。</p><img id="neutral" src="/reference.png?id=new"><p><small>视频有压缩，边缘以透明PNG为准。896评审画布仅加固定外边距，完整保留原RGBA和原时间；伸懒腰已通过，本页只评审探头。</small></p></main><script>const videos=[\'old\',\'new\'].map(id=>document.getElementById(id));let matte=\'black\',token=0;for(const v of videos){v.src=\'/video.mp4?id=\'+v.id+\'&bg=\'+matte;v.addEventListener(\'ratechange\',()=>{if(v.playbackRate!==1)v.playbackRate=1})}function restart(){for(const v of videos){v.currentTime=0;v.play().catch(()=>{})}}function toggle(){const pause=!videos[1].paused;for(const v of videos)pause?v.pause():v.play().catch(()=>{})}function background(name,color){matte=name;document.documentElement.style.setProperty(\'--matte\',color);for(const v of videos){const time=v.currentTime,paused=v.paused;v.src=\'/video.mp4?id=\'+v.id+\'&bg=\'+name;v.addEventListener(\'loadedmetadata\',()=>{v.currentTime=time;if(!paused)v.play().catch(()=>{})},{once:true})}}function frame(i){for(const v of videos)v.pause();document.querySelector(\'#label\').textContent=String(i).padStart(3,\'0\')+\' / 106\';const current=++token;for(const id of [\'old\',\'new\']){const img=document.getElementById(id+\'Frame\');img.onload=()=>{if(current!==token)return;const c=document.getElementById(id+\'Crop\'),ctx=c.getContext(\'2d\');ctx.clearRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(img,200,560,480,180,0,0,640,240)};img.src=\'/frame.png?id=\'+id+\'&i=\'+i}}frame(36);restart();</script></html>'.replace('__KNOWN_ISSUES__', config['knownIssues']).encode('utf-8')
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
