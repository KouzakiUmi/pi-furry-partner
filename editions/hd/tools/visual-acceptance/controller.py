"""Linux-side local controller. JSON in/out; no TCP listener or shell evaluation."""
from __future__ import annotations

import base64
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import uuid
import xml.etree.ElementTree as ET

ROOT = Path.home() / '.local/share/pi-terminal-test'
SESSIONS = ROOT / 'visual/sessions'
RUNTIME = Path(os.environ.get('XDG_RUNTIME_DIR', f'/run/user/{os.getuid()}')) / 'pi-visual'
KITTY = ROOT / 'kitty-0.49.1/bin/kitty'
KITTEN = ROOT / 'kitty-0.49.1/bin/kitten'
NODE = ROOT / 'node-v24.13.0-linux-x64/bin/node'
BUNDLE = Path(__file__).resolve().parent
VERSIONS = ('1.2.0', '1.3.0')
STYLES = ('umi', 'umi-pixel', 'pixel', 'illustration')
PHASES = ('idle', 'thinking', 'speaking', 'reading', 'editing', 'running', 'searching', 'compacting', 'waiting', 'success', 'error', 'cancelled', 'all', 'off')

class VisualError(Exception):
    pass

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def sha256_file(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def write_json(path, data):
    # A single controller holds the session lock when updating its metadata.
    temporary = path.with_name(path.name + '.new')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    os.replace(temporary, path)

def environment():
    allowed = ('HOME', 'USER', 'LOGNAME', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'PULSE_SERVER', 'WSL_DISTRO_NAME', 'WSL_INTEROP')
    result = {key: os.environ[key] for key in allowed if key in os.environ}
    result.update(PATH=f'{NODE.parent}:/usr/local/bin:/usr/bin:/bin', LANG='C.utf8', LC_ALL='C.utf8', PYTHONUTF8='1')
    return result

def run(arguments, *, data=None, timeout=15):
    result = subprocess.run([str(v) for v in arguments], input=data, capture_output=True, timeout=timeout, env=environment())
    if result.returncode:
        raise VisualError(result.stderr.decode('utf8', errors='replace')[-3000:] or f'Command failed: {result.returncode}')
    return result.stdout

def get_session(identifier):
    if not re.fullmatch(r'[a-f0-9]{12}', identifier or ''):
        raise VisualError('Invalid session id')
    directory = SESSIONS / identifier
    if directory.is_symlink() or not directory.is_dir():
        raise VisualError('Unknown session')
    data = json.loads((directory / 'session.json').read_text())
    if data.get('id') != identifier:
        raise VisualError('Session metadata mismatch')
    return directory, data

@contextlib.contextmanager
def session_lock(directory):
    with (directory / 'control.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield

def app_request(metadata, request):
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(10)
        client.connect(metadata['hostSocket'])
        client.sendall(json.dumps(request, ensure_ascii=False).encode() + b'\n')
        received = b''
        while b'\n' not in received:
            part = client.recv(65536)
            if not part:
                raise VisualError('Fixture disconnected before replying')
            received += part
            if len(received) > 2_000_000:
                raise VisualError('Fixture response too large')
    answer = json.loads(received.split(b'\n')[0])
    if not answer.get('ok'):
        raise VisualError(answer.get('error', 'Fixture rejected operation'))
    return answer['result']

def kitty(metadata, operation, *arguments, data=None):
    return run([KITTEN, '@', '--to', metadata['kittySocket'], '--use-password', 'never', operation, *arguments], data=data)

def owned_process_alive(metadata):
    pid = metadata.get('kittyPid')
    if not isinstance(pid, int) or pid < 2:
        return False
    try:
        stat = Path(f'/proc/{pid}/stat').read_text()
        started = stat[stat.rfind(')') + 2:].split()[19]
        return started == metadata.get('kittyStartTime') and f'pi-visual:{metadata["id"]}'.encode() in Path(f'/proc/{pid}/cmdline').read_bytes()
    except (FileNotFoundError, PermissionError, ProcessLookupError):
        return False

def stop(directory, metadata):
    if owned_process_alive(metadata):
        try:
            app_request(metadata, {'op': 'stop'})
        except (OSError, VisualError):
            pass
        deadline = time.monotonic() + 4
        while owned_process_alive(metadata) and time.monotonic() < deadline:
            time.sleep(0.1)
        if owned_process_alive(metadata):
            # Only this session's verified Kitty instance may be closed.
            try:
                kitty(metadata, 'close-window', '--match', f'id:{metadata.get("windowId", 1)}')
            except VisualError:
                if owned_process_alive(metadata):
                    os.kill(metadata['kittyPid'], signal.SIGTERM)
            deadline = time.monotonic() + 3
            while owned_process_alive(metadata) and time.monotonic() < deadline:
                time.sleep(0.1)
    if owned_process_alive(metadata):
        raise VisualError('Owned window did not exit; no unrelated process was killed')
    metadata.update(state='stopped', stoppedAt=now())
    write_json(directory / 'session.json', metadata)
    return {'id': metadata['id'], 'stopped': True, 'artifactsRetained': str(directory)}

def snapshot(source, destination):
    source = source.resolve(strict=True)
    package = json.loads((source / 'package.json').read_text())
    if package.get('name') != 'pi-furry-partner':
        raise VisualError('Source is not pi-furry-partner')
    for name in ('index.ts', 'lib', 'assets', 'themes', 'prompts'):
        item = source / name
        if not item.exists() or item.is_symlink():
            raise VisualError(f'Missing or symlinked source entry: {name}')
        if item.is_dir():
            for parent, folders, files in os.walk(item, followlinks=False):
                if any((Path(parent)/entry).is_symlink() for entry in folders + files):
                    raise VisualError('Snapshot source must not contain symlinks')
            shutil.copytree(item, destination / name, ignore=shutil.ignore_patterns('node_modules', '__pycache__', '.git'))
        else:
            shutil.copy2(item, destination / name)
    shutil.copy2(source / 'package.json', destination / 'package.json')
    digest = hashlib.sha256()
    count = 0
    for file in sorted(p for p in destination.rglob('*') if p.is_file()):
        digest.update(file.relative_to(destination).as_posix().encode() + b'\0')
        with file.open('rb') as stream:
            for block in iter(lambda: stream.read(1 << 20), b''):
                digest.update(block)
        count += 1
    return digest.hexdigest(), count

def integer(value, minimum, maximum, name):
    if not isinstance(value, int) or isinstance(value, bool) or not minimum <= value <= maximum:
        raise VisualError(f'{name} must be in [{minimum}, {maximum}]')
    return value

def scene_options(request):
    result = {'op': 'scene'}
    choices = {'mode': ('regular', 'fullscreen'), 'renderer': ('auto', 'kitty', 'blocks'), 'style': STYLES,
               'language': ('zh-CN', 'en'), 'phase': PHASES, 'overlay': ('off', 'right', 'crossing'), 'layout': ('editor', 'header')}
    for field, values in choices.items():
        if field in request and request[field] is not None:
            if request[field] not in values:
                raise VisualError(f'Unsupported {field}')
            result[field] = request[field]
    for field, maximum in [('history', 200), ('row', 200), ('col', 400)]:
        if request.get(field) is not None:
            result[field] = integer(request[field], 0, maximum, field)
    for field in ('animation', 'menu'):
        if field in request and request[field] is not None:
            if not isinstance(request[field], bool): raise VisualError(f'{field} must be boolean')
            result[field] = request[field]
    if request.get('text') is not None:
        if not isinstance(request['text'], str) or len(request['text']) > 16384:
            raise VisualError('Text exceeds fixture limit')
        result['text'] = request['text']
    return result

def font_configuration(directory, request):
    family = request.get('font', 'Maple Mono NF CN')
    files = request.get('fontFiles', [])
    if not isinstance(family,str) or not family.isprintable() or not 1 <= len(family) <= 120:
        raise VisualError('Invalid font family')
    if not isinstance(files,list) or not 1 <= len(files) <= 16:
        raise VisualError('System font file references are required')
    links = directory/'fonts'; links.mkdir(mode=0o700)
    for file in files:
        source = Path(file).resolve(strict=True)
        if not source.is_absolute() or not source.is_file() or source.suffix.lower() not in ('.ttf','.otf','.ttc'):
            raise VisualError('Invalid system font file')
        if source.stat().st_size > 100_000_000: raise VisualError('Font file exceeds size limit')
        (links/source.name).symlink_to(source)
    config = ET.Element('fontconfig')
    ET.SubElement(config,'include',{'ignore_missing':'no'}).text = '/etc/fonts/fonts.conf'
    ET.SubElement(config,'dir').text = str(links)
    ET.SubElement(config,'cachedir').text = str(ROOT/'visual/font-cache')
    destination = directory/'fonts.conf'
    ET.ElementTree(config).write(destination,encoding='utf-8',xml_declaration=True)
    env = environment(); env['FONTCONFIG_FILE'] = str(destination)
    matched = subprocess.run(['fc-match','--format','%{family}\\n%{file}\\n',family],capture_output=True,env=env,timeout=30)
    if matched.returncode: raise VisualError('Fontconfig failed: '+matched.stderr.decode('utf8',errors='replace'))
    lines = matched.stdout.decode('utf8').splitlines()
    if len(lines)<2 or family.casefold() not in [value.strip().casefold() for value in lines[0].split(',')]:
        raise VisualError('Requested font did not resolve exactly: '+str(lines))
    file = Path(lines[1]).resolve(strict=True)
    return env, {'family':lines[0],'file':str(file),'sha256':sha256_file(file),'localReferenceOnly':True,'config':str(destination)}

def start(request):
    version = request.get('version', '1.3.0')
    if version not in VERSIONS:
        raise VisualError('Unsupported Pi version')
    selected = scene_options(request)
    columns = integer(request.get('columns', 110), 40, 240, 'columns')
    rows = integer(request.get('rows', 38), 22, 100, 'rows')
    ttl = integer(request.get('ttl', 900), 60, 3600, 'ttl')
    if not NODE.is_file() or not KITTY.is_file():
        raise VisualError('Run the WSL terminal environment setup first')
    SESSIONS.mkdir(parents=True, exist_ok=True, mode=0o700)
    RUNTIME.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(SESSIONS, 0o700); os.chmod(RUNTIME, 0o700)
    identifier = uuid.uuid4().hex[:12]
    directory = SESSIONS / identifier
    directory.mkdir(mode=0o700)
    runtime = RUNTIME / identifier
    runtime.mkdir(mode=0o700)
    font_env, font = font_configuration(directory, request)
    source = directory / 'source'; source.mkdir(mode=0o700)
    source_hash, file_count = snapshot(Path(request['source']), source)
    modules = ROOT / 'pi' / version / 'node_modules'
    config = {'enabled': True, 'animation': True, 'persona': False, 'chineseUI': False, 'compactPrompt': False,
              'language': selected.get('language', 'zh-CN'), 'layout': selected.get('layout', 'editor'),
              'style': selected.get('style', 'umi'), 'renderer': selected.get('renderer', 'auto'), 'info': 'compact', 'dockSize': 'normal'}
    write_json(source / 'config.json', config)
    shutil.copy2(BUNDLE / 'host.mjs', directory / 'host.mjs')
    metadata = {'id': identifier, 'state': 'starting', 'createdAt': now(), 'source': str(Path(request['source']).resolve()),
                'sourceHash': source_hash, 'sourceFileCount': file_count, 'font': font, 'version': version, 'modules': str(modules),
                'mode': selected.get('mode', 'regular'), 'history': selected.get('history', 8), 'ttl': ttl,
                'hostSocket': str(runtime/'host.sock'), 'kittySocket': 'unix:' + str(runtime/'kitty.sock')}
    profile = directory / 'agent'; profile.mkdir(mode=0o700)
    write_json(directory / 'session.json', metadata)
    env = font_env; env.update(PI_CODING_AGENT_DIR=str(profile), PI_PROGRAM_STATUS='0')
    with (directory/'kitty.log').open('wb') as log:
        process = subprocess.Popen([str(KITTY), '--config', 'NONE', '--title', f'pi-visual:{identifier}',
            '--override', 'allow_remote_control=socket-only', '--listen-on', metadata['kittySocket'],
            '--override', f'initial_window_width={columns}c', '--override', f'initial_window_height={rows}c',
            '--override', 'remember_window_size=no', '--override', f'font_family={font["family"]}',
            '--override', 'bold_font=auto', '--override', 'italic_font=auto', '--override', 'bold_italic_font=auto',
            str(NODE), str(directory/'host.mjs'), str(directory)],
            cwd=source, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    metadata['kittyPid'] = process.pid
    try:
        stat = Path(f'/proc/{process.pid}/stat').read_text()
        metadata['kittyStartTime'] = stat[stat.rfind(')') + 2:].split()[19]
        write_json(directory/'session.json', metadata)
        deadline = time.monotonic() + 25
        last_error = None
        while time.monotonic() < deadline:
            if process.poll() is not None:
                log = (directory/'kitty.log').read_text(errors='replace')[-3000:]
                errors = directory/'host-errors.log'
                if errors.exists(): log += '\n' + errors.read_text(errors='replace')[-3000:]
                raise VisualError(log)
            try:
                state = app_request(metadata, {'op': 'status'})
                windows = json.loads(kitty(metadata, 'ls'))
                remote_socket = Path(metadata['kittySocket'].removeprefix('unix:'))
                if not remote_socket.is_socket() or remote_socket.parent.resolve() != runtime.resolve():
                    raise VisualError('Kitty socket is not inside its private runtime directory')
                os.chmod(remote_socket, 0o600)
                metadata['windowId'] = windows[0]['tabs'][0]['windows'][0]['id']
                metadata['state'] = 'running'
                write_json(directory/'session.json', metadata)
                state = app_request(metadata, selected)
                if selected.get('renderer') == 'kitty' and state['renderer'] != 'kitty':
                    raise VisualError('SOURCE_HAS_NO_KITTY_BACKEND: this source falls back to ' + state['renderer'])
                return {'id': identifier, 'sourceHash': source_hash, 'sourceFileCount': file_count, 'font': font, 'piVersion': version,
                        'sessionDirectory': str(directory), 'ttlSeconds': ttl, 'state': state}
            except (FileNotFoundError, ConnectionRefusedError, socket.timeout) as error:
                last_error = error
                time.sleep(0.1)
        raise VisualError(f'Fixture did not become ready: {last_error}')
    except Exception:
        stop(directory, metadata)
        raise

def dispatch(request):
    operation = request.get('op')
    if operation == 'start': return start(request)
    if operation == 'list':
        return [{'id': p.name, 'running': owned_process_alive(json.loads((p/'session.json').read_text()))}
                for p in sorted(SESSIONS.iterdir()) if p.is_dir() and (p/'session.json').is_file()] if SESSIONS.exists() else []
    directory, metadata = get_session(request.get('id'))
    with session_lock(directory):
        if operation == 'stop': return stop(directory, metadata)
        if not owned_process_alive(metadata): raise VisualError('Session is not running (it may have reached its TTL)')
        if operation == 'status': return app_request(metadata, {'op': 'status'})
        if operation == 'scene':
            selected = scene_options(request)
            before = app_request(metadata, {'op': 'status'})
            if selected.get('col', 0) >= before['columns'] - 6 or selected.get('row', 0) >= before['rows']:
                raise VisualError('Overlay origin is outside the terminal')
            state = app_request(metadata, selected)
            if selected.get('renderer') == 'kitty' and state['renderer'] != 'kitty':
                raise VisualError('SOURCE_HAS_NO_KITTY_BACKEND')
            return state
        match = ['--match', f'id:{metadata["windowId"]}']
        if operation == 'text':
            value = request.get('text', '')
            if not isinstance(value, str) or len(value) > 16384 or '\0' in value: raise VisualError('Invalid text')
            kitty(metadata, 'send-text', *match, '--stdin', '--bracketed-paste', 'enable', data=value.encode())
        elif operation == 'key':
            key = request.get('key', '')
            if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9+_-]{0,59}', key): raise VisualError('Invalid key')
            kitty(metadata, 'send-key', *match, key)
        elif operation == 'drag':
            state = app_request(metadata, {'op': 'status'})
            if state['mode'] != 'fullscreen': raise VisualError('PTY mouse drag requires fullscreen; regular terminal-native selection needs desktop input')
            x1 = integer(request.get('x1'), 0, state['columns']-1, 'x1')
            x2 = integer(request.get('x2'), 0, state['columns']-1, 'x2')
            y1 = integer(request.get('y1'), 0, state['rows']-1, 'y1')
            y2 = integer(request.get('y2'), 0, state['rows']-1, 'y2')
            points = [(x1,y1)] + [(round(x1+(x2-x1)*i/8),round(y1+(y2-y1)*i/8)) for i in range(1,9)]
            payload = f'\x1b[<0;{x1+1};{y1+1}M' + ''.join(f'\x1b[<32;{x+1};{y+1}M' for x,y in points[1:]) + f'\x1b[<0;{x2+1};{y2+1}m'
            kitty(metadata, 'send-text', *match, '--stdin', data=payload.encode())
        elif operation == 'resize':
            columns = integer(request.get('columns'), 40, 240, 'columns')
            rows = integer(request.get('rows'), 22, 100, 'rows')
            kitty(metadata, 'resize-os-window', *match, '--unit', 'cells', '--width', str(columns), '--height', str(rows))
        elif operation == 'screenshot':
            delay = request.get('delay', 0.2)
            if not isinstance(delay,(int,float)) or not 0 <= delay <= 10: raise VisualError('Invalid delay')
            time.sleep(delay)
            state = app_request(metadata, {'op': 'status'})
            evidence = directory/'evidence'; evidence.mkdir(exist_ok=True,mode=0o700)
            name = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            png = evidence/(name+'.png')
            kitty(metadata, 'screenshot', *match, str(png))
            with png.open('rb') as stream:
                signature = stream.read(24)
            if signature[:8] != b'\x89PNG\r\n\x1a\n': raise VisualError('Kitty did not produce a PNG')
            result = {'id':metadata['id'],'capturedAt':now(),'sourceHash':metadata['sourceHash'], 'piVersion':metadata['version'],'font':metadata.get('font'),
                      'captureMethod':'kitty-0.49.1-native-framebuffer','visualAcceptance':'not-evaluated',
                      'width':int.from_bytes(signature[16:20],'big'),'height':int.from_bytes(signature[20:24],'big'),
                      'sha256':sha256_file(png),'linuxPath':str(png),'state':state}
            write_json(evidence/(name+'.json'), result)
            if request.get('output'):
                output = Path(request['output'])
                if not output.is_absolute() or output.suffix.lower() != '.png': raise VisualError('Output must be an absolute PNG path')
                with png.open('rb') as source, output.open('xb') as destination: shutil.copyfileobj(source,destination)
                result['output'] = str(output)
            return result
        else:
            raise VisualError('Unknown operation')
        time.sleep(0.2)
        return app_request(metadata, {'op': 'status'})

def main():
    os.umask(0o077)
    try:
        if len(sys.argv) != 3 or sys.argv[1] != '--request-base64': raise VisualError('Expected --request-base64 JSON payload')
        encoded=sys.argv[2]
        if len(encoded)>200000: raise VisualError('Request too large')
        request=json.loads(base64.b64decode(encoded, validate=True))
        result=dispatch(request)
        print(json.dumps({'ok':True,'result':result},ensure_ascii=False))
        return 0
    except Exception as error:
        print(json.dumps({'ok':False,'error':{'type':type(error).__name__,'message':str(error)}},ensure_ascii=False))
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
