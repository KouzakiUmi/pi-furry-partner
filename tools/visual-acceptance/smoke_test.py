"""End-to-end infrastructure checks against an explicitly owned visual session.

This does not automatically approve the product's visual appearance.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import time

CLI = Path(__file__).with_name('pi-visual.py')

def call(*arguments):
    result = subprocess.run([sys.executable, str(CLI), *map(str,arguments)],capture_output=True,text=True,encoding='utf8',timeout=45)
    reply = json.loads(result.stdout)
    if result.returncode or not reply.get('ok'):
        raise RuntimeError(json.dumps(reply,ensure_ascii=False))
    return reply['result']

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('id')
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    directory=Path(args.output).resolve()
    directory.mkdir(parents=True,exist_ok=True)
    report={'id':args.id,'visualAcceptance':'not-evaluated','checks':[],'screenshots':[]}
    def check(name,condition,details=None):
        report['checks'].append({'name':name,'passed':bool(condition),'details':details})
        if not condition: raise AssertionError(name+': '+str(details))
    def capture(name):
        result=call('screenshot',args.id,'--output',directory/(name+'.png'))
        report['screenshots'].append({'name':name,'file':result['output'],'sha256':result['sha256'],'width':result['width'],'height':result['height']})
        return result
    try:
        initial=call('status',args.id)
        check('offline fixture has no model requests',initial['fixture'] and initial['modelRequests']==0)
        call('scene',args.id,'--mode','fullscreen','--renderer','blocks','--overlay','off','--text','','--phase','thinking')
        state=call('text',args.id,'视觉验收 ABC 123')
        check('text entered through Kitty PTY',state['text']=='视觉验收 ABC 123',state['text'])
        old=state['cursor']
        state=call('key',args.id,'left')
        check('native arrow key moves cursor',state['cursor']!=old,{'before':old,'after':state['cursor']})
        image=capture('maple-thinking')
        check('system Maple font selected',image['font']['family']=='Maple Mono NF CN',image['font'])
        check('native framebuffer PNG captured',image['captureMethod']=='kitty-0.49.1-native-framebuffer' and image['width']>200 and image['height']>200)
        state=call('drag',args.id,'--x1',1,'--y1',2,'--x2',20,'--y2',4)
        check('fullscreen SGR drag creates native selection',state['selectionActive'],state['selectionActive'])
        capture('maple-selection')
        state=call('scene',args.id,'--overlay','right')
        check('right-side native overlay composed',state['overlay'] is not None and any('POPUP ROW 1' in value for value in state['screenText']))
        capture('maple-overlay-right')
        state=call('key',args.id,'escape')
        check('Escape closes overlay',state['overlay'] is None)
        state=call('scene',args.id,'--overlay','crossing')
        check('crossing overlay created',state['overlay'] is not None)
        capture('maple-overlay-crossing')
        call('key',args.id,'escape')
        state=call('scene',args.id,'--mode','regular','--history',120,'--phase','speaking')
        check('real regular renderer active',state['mode']=='regular' and state['rows']>0)
        capture('maple-regular')
        state=call('resize',args.id,'--columns',90,'--rows',32)
        check('native OS window resize applied',(state['columns'],state['rows'])==(90,32),(state['columns'],state['rows']))
        capture('maple-resized')
        state=call('scene',args.id,'--mode','fullscreen','--phase','idle','--history',8)
        check('renderer switch preserves draft',state['text']=='视觉验收 ABC 123',state['text'])
        check('still no model requests',state['modelRequests']==0)
        report['infrastructurePassed']=True
    except Exception as error:
        report['infrastructurePassed']=False
        report['error']=str(error)
    finally:
        file=directory/'smoke-report.json'
        file.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print(json.dumps({'passed':report['infrastructurePassed'],'report':str(file),'error':report.get('error')},ensure_ascii=False))
    return 0 if report['infrastructurePassed'] else 1

if __name__=='__main__':
    raise SystemExit(main())
