import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('visual_controller', Path(__file__).with_name('controller.py'))
controller = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controller)

class ControllerTests(unittest.TestCase):
    def test_scene_allowlists_and_bounds(self):
        result = controller.scene_options({'mode':'fullscreen','renderer':'kitty','animation':False,'text':'中文🙂'})
        self.assertEqual(result['op'],'scene')
        self.assertFalse(result['animation'])
        for value in [True, -1, 1000, '10']:
            with self.assertRaises(controller.VisualError): controller.scene_options({'history':value})
        for key,value in [('mode','../other'),('renderer','shell'),('animation','on'),('text','x'*16385)]:
            with self.assertRaises(controller.VisualError): controller.scene_options({key:value})

    def test_session_ids_cannot_escape_root(self):
        for value in ['../', '/tmp', 'a'*13, None, '你好']:
            with self.assertRaises(controller.VisualError): controller.get_session(value)

    def test_snapshot_ignores_user_config_and_credential_files(self):
        with tempfile.TemporaryDirectory(prefix='pi-visual-test-') as temp:
            root = Path(temp).resolve()
            self.assertTrue(str(root).startswith('/tmp/pi-visual-test-'))
            source=root/'project'; source.mkdir(); destination=root/'snapshot'; destination.mkdir()
            (source/'package.json').write_text('{"name":"pi-furry-partner"}')
            (source/'index.ts').write_text('export default function(){}')
            for name in ['lib','assets','themes','prompts']:
                (source/name).mkdir(); (source/name/'fixture.txt').write_text(name)
            (source/'config.json').write_text('PRIVATE_CONFIG')
            (source/'auth.json').write_text('PRIVATE_TOKEN')
            digest,count=controller.snapshot(source,destination)
            self.assertEqual(len(digest),64)
            self.assertEqual(count,6)
            self.assertFalse((destination/'config.json').exists())
            self.assertFalse((destination/'auth.json').exists())
            second=root/'second'; second.mkdir()
            self.assertEqual(controller.snapshot(source,second),(digest,count))

    def test_snapshot_rejects_symlinked_asset(self):
        with tempfile.TemporaryDirectory(prefix='pi-visual-test-') as temp:
            root=Path(temp);source=root/'project';source.mkdir();destination=root/'snapshot';destination.mkdir()
            (source/'package.json').write_text('{"name":"pi-furry-partner"}')
            (source/'index.ts').write_text('export default function(){}')
            for name in ['lib','assets','themes','prompts']:(source/name).mkdir()
            (source/'assets/private').symlink_to('/etc/passwd')
            with self.assertRaises(controller.VisualError):controller.snapshot(source,destination)

    def test_fonts_are_referenced_not_copied(self):
        with tempfile.TemporaryDirectory(prefix='pi-visual-test-') as temp:
            root=Path(temp);font=root/'Maple.ttf';font.write_bytes(b'local-font-reference')
            session=root/'session';session.mkdir()
            matched=SimpleNamespace(returncode=0,stdout=f'Maple Mono NF CN\n{font}\n'.encode(),stderr=b'')
            with patch.object(controller.subprocess,'run',return_value=matched):
                env,metadata=controller.font_configuration(session,{'font':'Maple Mono NF CN','fontFiles':[str(font)]})
            link=session/'fonts/Maple.ttf'
            self.assertTrue(link.is_symlink())
            self.assertEqual(link.resolve(),font)
            self.assertEqual(env['FONTCONFIG_FILE'],str(session/'fonts.conf'))
            self.assertTrue(metadata['localReferenceOnly'])
            self.assertIn('/etc/fonts/fonts.conf',(session/'fonts.conf').read_text())

    def test_font_substitution_is_not_silently_accepted(self):
        with tempfile.TemporaryDirectory(prefix='pi-visual-test-') as temp:
            root=Path(temp);font=root/'Maple.ttf';font.write_bytes(b'font')
            session=root/'session';session.mkdir()
            matched=SimpleNamespace(returncode=0,stdout=f'Other Font\n{font}\n'.encode(),stderr=b'')
            with patch.object(controller.subprocess,'run',return_value=matched):
                with self.assertRaises(controller.VisualError):
                    controller.font_configuration(session,{'font':'Maple Mono NF CN','fontFiles':[str(font)]})

    def test_stop_never_signals_unrelated_process(self):
        with tempfile.TemporaryDirectory(prefix='pi-visual-test-') as temp:
            directory=Path(temp)
            metadata={'id':'abcdef123456','kittyPid':os.getpid(),'kittyStartTime':'wrong'}
            with patch.object(controller.os,'kill') as kill:
                result=controller.stop(directory,metadata)
            kill.assert_not_called()
            self.assertTrue(result['stopped'])
            self.assertEqual(json.loads((directory/'session.json').read_text())['state'],'stopped')

    def test_evidence_is_not_automatic_visual_approval(self):
        with tempfile.TemporaryDirectory(prefix='pi-visual-test-') as temp:
            directory=Path(temp);metadata={'id':'abcdef123456','windowId':1,'sourceHash':'source','version':'1.3.0'}
            def capture(meta,operation,*arguments,data=None):
                self.assertEqual(operation,'screenshot')
                Path(arguments[-1]).write_bytes(b'\x89PNG\r\n\x1a\n'+b'\x00'*8+(100).to_bytes(4,'big')+(80).to_bytes(4,'big'))
            with patch.object(controller,'get_session',return_value=(directory,metadata)), patch.object(controller,'owned_process_alive',return_value=True), patch.object(controller,'app_request',return_value={'modelRequests':0}), patch.object(controller,'kitty',side_effect=capture):
                result=controller.dispatch({'op':'screenshot','id':metadata['id'],'delay':0})
            self.assertEqual(result['visualAcceptance'],'not-evaluated')
            self.assertEqual((result['width'],result['height']),(100,80))
            self.assertEqual(result['captureMethod'],'kitty-0.49.1-native-framebuffer')

    def test_existing_evidence_is_not_overwritten(self):
        with tempfile.TemporaryDirectory(prefix='pi-visual-test-') as temp:
            directory=Path(temp);output=directory/'keep.png';output.write_bytes(b'keep')
            metadata={'id':'abcdef123456','windowId':1,'sourceHash':'source','version':'1.3.0'}
            def capture(meta,operation,*arguments,data=None):
                Path(arguments[-1]).write_bytes(b'\x89PNG\r\n\x1a\n'+b'\x00'*8+(1).to_bytes(4,'big')+(1).to_bytes(4,'big'))
            with patch.object(controller,'get_session',return_value=(directory,metadata)), patch.object(controller,'owned_process_alive',return_value=True), patch.object(controller,'app_request',return_value={}), patch.object(controller,'kitty',side_effect=capture):
                with self.assertRaises(FileExistsError):controller.dispatch({'op':'screenshot','id':metadata['id'],'delay':0,'output':str(output)})
            self.assertEqual(output.read_bytes(),b'keep')

if __name__ == '__main__':
    unittest.main()
