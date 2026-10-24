#!/usr/bin/env python3
"""Windows entry point for the local WSL visual acceptance fixture."""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import uuid

BUNDLE = Path(__file__).resolve().parent

class Arguments(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError(message)

def parser():
    p = Arguments(description='本机 WSL / Kitty 视觉验收 CLI；默认输出 JSON，不监听网络端口。')
    p.add_argument('--distro', default='archlinux')
    sub = p.add_subparsers(dest='op', required=True)
    start = sub.add_parser('start')
    start.add_argument('--source', default=str(BUNDLE.parents[1]))
    start.add_argument('--version', choices=['1.2.0','1.3.0'], default='1.3.0')
    start.add_argument('--columns', type=int, default=110)
    start.add_argument('--rows', type=int, default=38)
    start.add_argument('--ttl', type=int, default=900)
    start.add_argument('--font', default='Maple Mono NF CN')
    start.add_argument('--font-file', action='append', default=[])
    scene_arguments(start)
    for op in ['status','stop']:
        action = sub.add_parser(op); action.add_argument('id')
    sub.add_parser('list')
    scene = sub.add_parser('scene'); scene.add_argument('id'); scene_arguments(scene)
    text = sub.add_parser('text'); text.add_argument('id'); text.add_argument('text')
    key = sub.add_parser('key'); key.add_argument('id'); key.add_argument('key')
    drag = sub.add_parser('drag'); drag.add_argument('id')
    for name in ['x1','y1','x2','y2']: drag.add_argument('--'+name, type=int, required=True)
    resize = sub.add_parser('resize'); resize.add_argument('id')
    resize.add_argument('--columns', type=int, required=True); resize.add_argument('--rows', type=int, required=True)
    screenshot = sub.add_parser('screenshot'); screenshot.add_argument('id'); screenshot.add_argument('--output')
    screenshot.add_argument('--delay', type=float, default=0.2)
    return p

def scene_arguments(p):
    p.add_argument('--mode', choices=['regular','fullscreen'])
    p.add_argument('--renderer', choices=['auto','kitty','blocks'])
    p.add_argument('--style', choices=['umi','umi-pixel','pixel','illustration'])
    p.add_argument('--language', choices=['zh-CN','en'])
    p.add_argument('--phase', choices=['idle','thinking','speaking','reading','editing','running','searching','compacting','waiting','success','error','cancelled','all','off'])
    p.add_argument('--layout', choices=['editor','header'])
    p.add_argument('--history', type=int)
    p.add_argument('--overlay', choices=['off','right','crossing'])
    p.add_argument('--row', type=int); p.add_argument('--col', type=int)
    p.add_argument('--animation', choices=['on','off'])
    p.add_argument('--menu', action='store_true', default=None)
    if p.prog.endswith(' scene'): p.add_argument('--text')

def wsl(distro, arguments, timeout=40):
    result = subprocess.run(['wsl.exe','--distribution',distro,'--exec',*arguments], capture_output=True, timeout=timeout)
    if result.returncode:
        # Linux commands invoked here deliberately emit UTF-8; do not globally decode arbitrary wsl.exe diagnostics.
        raise RuntimeError('WSL command failed; exit='+str(result.returncode)+'; stderrBase64='+base64.b64encode(result.stderr[-4000:]).decode())
    return result.stdout.decode('utf8').strip()

def linux_path(distro, path):
    value = str(Path(path).expanduser().resolve())
    if os.name != 'nt':
        # Native Linux execution is useful for the tool's own tests.
        return value
    return wsl(distro, ['/usr/bin/wslpath','-u',value])

def system_font_files(family):
    if os.name != 'nt':
        return []
    import winreg
    result = []
    fonts_key = r'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
    windows_fonts = Path(os.environ.get('WINDIR', r'C:\Windows'))/'Fonts'
    for hive in [winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE]:
        try:
            with winreg.OpenKey(hive, fonts_key) as key:
                for index in range(winreg.QueryInfoKey(key)[1]):
                    name, value, _ = winreg.EnumValue(key,index)
                    if family.casefold() in name.casefold() or name.startswith('Segoe UI Emoji'):
                        file = Path(os.path.expandvars(value))
                        if not file.is_absolute(): file = windows_fonts/file
                        if file.is_file(): result.append(file.resolve())
        except FileNotFoundError:
            pass
    return list(dict.fromkeys(result))

def main(argv=None):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    try:
        args = vars(parser().parse_args(argv))
        distro = args.pop('distro')
        args = {key:value for key,value in args.items() if value is not None}
        if 'animation' in args: args['animation'] = args['animation'] == 'on'
        if 'id' in args and not re.fullmatch(r'[a-f0-9]{12}', args['id']): raise ValueError('Invalid session id')
        if args['op'] == 'start':
            source = Path(args['source']).expanduser().resolve(strict=True)
            if not (source/'index.ts').is_file(): raise ValueError('Source has no index.ts')
            args['source'] = linux_path(distro, source)
            files = [Path(p).expanduser().resolve(strict=True) for p in args.pop('font_file')]
            if not files: files = system_font_files(args['font'])
            if not files: raise ValueError('Requested system font was not found; supply --font-file or install it locally')
            args['fontFiles'] = [linux_path(distro,file) for file in files]
        output = None
        if args['op'] == 'screenshot':
            output = Path(args.get('output') or Path(os.environ.get('LOCALAPPDATA',str(Path.home()/'.local/share')))/'PiVisualAcceptance'/'artifacts'/args['id']/(uuid.uuid4().hex+'.png')).expanduser().resolve()
            if output.suffix.lower() != '.png': raise ValueError('Output must have .png extension')
            if output.exists() or output.with_suffix('.json').exists(): raise ValueError('Refusing to overwrite existing evidence')
            output.parent.mkdir(parents=True,exist_ok=True)
            args['output'] = linux_path(distro,output)
        payload = base64.b64encode(json.dumps(args,ensure_ascii=False).encode()).decode()
        if os.name == 'nt':
            controller = linux_path(distro,BUNDLE/'controller.py')
            command = ['wsl.exe','--distribution',distro,'--exec','/usr/bin/python3',controller,'--request-base64',payload]
        else:
            command = [sys.executable,str(BUNDLE/'controller.py'),'--request-base64',payload]
        process = subprocess.run(command,capture_output=True,timeout=120)
        raw = process.stdout.decode('utf8')
        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            raise RuntimeError('Controller returned no valid JSON; exit='+str(process.returncode)+'; stderrBase64='+base64.b64encode(process.stderr[-4000:]).decode())
        if output and result.get('ok'):
            result['result']['output'] = str(output)
            output.with_suffix('.json').write_text(json.dumps(result['result'],ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print(json.dumps(result,ensure_ascii=False))
        return 0 if result.get('ok') and process.returncode == 0 else 1
    except Exception as error:
        print(json.dumps({'ok':False,'error':{'type':type(error).__name__,'message':str(error)}},ensure_ascii=False))
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
