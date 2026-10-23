#!/usr/bin/env python3
"""Isolated full-HD rebuild regression. No project runtime files are replaced."""
from pathlib import Path
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('umi_hires_builder',ROOT/'scripts/build-hires-assets.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)

def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')

def fixture(root,accepted=True):
    source=root/'Hi-Res';out=root/'assets/hires/umi'
    image=Image.new('RGBA',(640,640),(0,0,0,0))
    ImageDraw.Draw(image).rectangle((120,120,400,530),fill=(240,245,255,255))
    image.putpixel((119,200),(122,135,180,127))
    for name in ['idle-open','talk-blink','talk-closed','talk-small','talk-medium','talk-wide']:
        target=source/'poses-640'/f'{name}.png';target.parent.mkdir(parents=True,exist_ok=True);image.save(target)
    for kind in ['watch','search']:
        folder=source/'animations-640'/kind;folder.mkdir(parents=True,exist_ok=True)
        for n in range(2):image.save(folder/f'{n:03d}.png')
        write(folder/'timeline.json',{'clips':{kind:{'durationMs':100,'fps':20,'frames':[{'atMs':0,'file':'000.png'},{'atMs':50,'file':'001.png'}]}}})
    for name in ['reaction-sheet','listen-frames','poke-patch']:write(root/f'assets/reactions/umi/{name}.json',{'motion':{'ears':False,'paws':False}})
    action='shy';folder=source/'animations-640/emotion-shy';folder.mkdir()
    qa={'accepted':accepted,'reviewSha256':'a'*64,'sourceSha256':'b'*64}
    ids=[f'gesture-shy-{n:03d}' for n in range(2)]
    frames=[];steps=[];evidence=[]
    for n,fid in enumerate(ids):
        path=folder/f'{fid}.png';im=image.copy();im.putpixel((130,130),(100+n,120,140,153));im.save(path)
        frames.append({'atMs':n*50,'id':fid});steps.append({'id':fid,'durationMs':50})
        evidence.append({'id':fid,'sourceFrame':n*2,'atMs':n*50,'durationMs':50,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    clip={'durationMs':100,'periodMs':100,'qa':qa,'frames':frames,'ids':ids}
    timeline={'schemaVersion':1,'width':640,'height':640,'qa':qa,'source':{'sha256':'b'*64},'clips':{action:clip},
      'sequence':{'periodMs':100,'steps':steps},'sourceFrames':evidence}
    write(folder/'timeline.json',timeline)
    # An unrelated source image must not sneak into the reviewed frame bank.
    image.save(folder/'unreviewed-extra.png')
    write(out/'manifest.json',{'animations':{'gestures':{'shy':clip}}} if accepted else {'animations':{}})
    (out/'sentinel.txt').write_text('previous bank',encoding='utf-8')
    return source,out,timeline

def run_main(root,source,out):
    with patch.object(builder,'ROOT',root),patch.object(builder,'umi_poke_pose',lambda image:image.copy()),         patch.object(sys,'argv',['build-hires-assets.py','--source',str(source),'--output',str(out)]),contextlib.redirect_stdout(io.StringIO()) as stdout:
        builder.main()
        return json.loads(stdout.getvalue())

class HiResRebuildTests(unittest.TestCase):
    def test_expression_only_keeps_authored_rgba_and_rejects_old_material_metadata(self):
        with tempfile.TemporaryDirectory(prefix='umi-expression-only-native-') as directory:
            root=Path(directory);source,out,timeline=fixture(root)
            poses=root/'assets/poses/expressions';poses.mkdir(parents=True)
            image=Image.new('RGBA',(640,640),(0,0,0,0));image.putpixel((300,300),(142,145,150,255))
            image.putpixel((301,300),(88,125,199,127));image.putpixel((302,300),(24,33,45,0))
            for name in ['joy','grumpy','sad','cry','shy','flustered','surprise','proud','affection']:
                image.save(poses/f'emotion-{name}.png')
            metadata={'sourceSha256':'c'*64,'baselineY':602,'processing':{'version':'source-native-v1'}}
            write(poses/'metadata.json',metadata)
            existing=json.loads((out/'manifest.json').read_text());existing['poses']=['idle-open'];write(out/'manifest.json',existing)
            def expressions_only():
                with patch.object(builder,'ROOT',root),patch.object(sys,'argv',['build-hires-assets.py','--source',str(source),'--output',str(out),'--expressions-only']),contextlib.redirect_stdout(io.StringIO()):builder.main()
            bad=copy.deepcopy(metadata);bad['colorCalibration']={'status':'reviewed-root-visual'}
            write(poses/'metadata.json',bad);before=(out/'manifest.json').read_bytes()
            with self.assertRaisesRegex(ValueError,'Withdrawn'):expressions_only()
            self.assertEqual((out/'manifest.json').read_bytes(),before)
            self.assertFalse((out/'poses/emotion-joy.webp').exists())
            write(poses/'metadata.json',metadata);expressions_only()
            with Image.open(out/'poses/emotion-joy.webp') as encoded:
                self.assertEqual(encoded.convert('RGBA').tobytes(),image.tobytes())

    def test_withdrawn_timeline_archive_or_material_mapping_refuses_rebuild(self):
        for defect in ('timeline-withdrawn', 'archive-withdrawn', 'old-fixed-calibration', 'late-withdrawal'):
            with self.subTest(defect=defect), tempfile.TemporaryDirectory(prefix='umi-hires-withdrawal-test-') as directory:
                root=Path(directory);source,out,timeline=fixture(root)
                before=(out/'manifest.json').read_bytes()
                timeline_path=source/'animations-640/emotion-shy/timeline.json'
                record=timeline_path.parent/'withdrawal-record.json'
                if defect=='archive-withdrawn':
                    archive=source/'sources/historical-shy'
                    timeline['source']['file']='Hi-Res/sources/historical-shy/source.mp4'
                    write(timeline_path,timeline);record=archive/'withdrawal-record.json'
                if defect=='old-fixed-calibration':
                    timeline['processing']={'fixedCalibrations':{'geometry':{'scaleY':1.10}}}
                    write(timeline_path,timeline)
                elif defect!='late-withdrawal':
                    write(record,{'schemaVersion':1,'status':'withdrawn-user-rejected','deploymentAllowed':False})
                if defect=='late-withdrawal':
                    original=builder.build_runtime_bank
                    def build_then_withdraw(*args):
                        result=original(*args)
                        write(record,{'schemaVersion':1,'status':'withdrawn-user-rejected','deploymentAllowed':False})
                        return result
                    with patch.object(builder,'build_runtime_bank',build_then_withdraw):
                        with self.assertRaisesRegex(ValueError,'withdrawn|Withdrawn'):run_main(root,source,out)
                else:
                    with self.assertRaisesRegex(ValueError,'withdrawn|Withdrawn'):run_main(root,source,out)
                self.assertEqual((out/'manifest.json').read_bytes(),before)
                self.assertTrue((out/'sentinel.txt').exists())

    def test_full_rebuild_preserves_review_period_frames_and_soft_alpha(self):
        with tempfile.TemporaryDirectory(prefix='umi-hires-rebuild-test-') as directory:
            root=Path(directory);source,out,timeline=fixture(root)
            report=run_main(root,source,out)
            manifest=json.loads((out/'manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(manifest['animations']['gestures']['shy'],timeline['clips']['shy'])
            self.assertEqual(report['gestureFrames'],2);self.assertEqual(report['gestureClips'],['shy'])
            self.assertEqual(len(list((out/'gesture-shy').glob('*.webp'))),2)
            self.assertFalse((out/'gesture-shy/unreviewed-extra.webp').exists())
            self.assertEqual(len(manifest['animations']['watch']['frames']),2)
            self.assertEqual(len(manifest['animations']['search']['frames']),2)
            self.assertFalse((out/'sentinel.txt').exists())
            for fid in timeline['clips']['shy']['ids']:
                with Image.open(source/f'animations-640/emotion-shy/{fid}.png') as original,Image.open(out/f'gesture-shy/{fid}.webp') as rebuilt:
                    self.assertEqual(original.convert('RGBA').tobytes(),rebuilt.convert('RGBA').tobytes(),'H3 WebP rebuild stays lossless including 127/153 alpha')
            self.assertFalse(list(out.parent.glob('.umi-previous-*')))
            self.assertFalse(list(out.parent.glob('.umi-build-*')))

    def test_rejected_and_unsafe_sources_remain_dormant(self):
        with tempfile.TemporaryDirectory(prefix='umi-hires-review-test-') as directory:
            root=Path(directory);source,out,timeline=fixture(root,accepted=False)
            reviewed,skipped=builder.load_reviewed_gestures(source)
            self.assertEqual(reviewed,{});self.assertIn('not approved',skipped[0]['reason'])
            report=run_main(root,source,out)
            self.assertEqual(report['gestureClips'],[]);self.assertFalse((out/'gesture-shy').exists())
            manifest=json.loads((out/'manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(manifest['animations']['gestures'],{})

    def test_changed_reviewed_png_or_missing_source_preserves_existing_bank(self):
        with tempfile.TemporaryDirectory(prefix='umi-hires-tamper-test-') as directory:
            root=Path(directory);source,out,timeline=fixture(root);old=(out/'manifest.json').read_bytes()
            png=source/'animations-640/emotion-shy/gesture-shy-000.png'
            png.write_bytes(png.read_bytes()+b'changed')
            with self.assertRaisesRegex(ValueError,'PNG is missing or changed'):run_main(root,source,out)
            self.assertEqual((out/'manifest.json').read_bytes(),old);self.assertTrue((out/'sentinel.txt').exists())
            shutil.rmtree(source/'animations-640/emotion-shy')
            with self.assertRaisesRegex(ValueError,'Refusing to discard'):run_main(root,source,out)
            self.assertEqual((out/'manifest.json').read_bytes(),old);self.assertTrue((out/'sentinel.txt').exists())

    def test_late_encoding_failure_cannot_clear_the_existing_bank(self):
        with tempfile.TemporaryDirectory(prefix='umi-hires-failure-test-') as directory:
            root=Path(directory);source,out,timeline=fixture(root);old=(out/'manifest.json').read_bytes()
            with patch.object(builder,'save_webp',side_effect=OSError('synthetic encoder failure')):
                with self.assertRaisesRegex(OSError,'synthetic encoder failure'):run_main(root,source,out)
            self.assertEqual((out/'manifest.json').read_bytes(),old);self.assertTrue((out/'sentinel.txt').exists())
            self.assertFalse(list(out.parent.glob('.umi-build-*')))

    def test_concurrent_runtime_publication_is_not_overwritten(self):
        with tempfile.TemporaryDirectory(prefix='umi-hires-concurrent-test-') as directory:
            root=Path(directory);source,out,timeline=fixture(root)
            real_build=builder.build_runtime_bank
            def build_then_publish_other(source_arg,staged,reviewed):
                result=real_build(source_arg,staged,reviewed)
                current=json.loads((out/'manifest.json').read_text(encoding='utf-8'))
                current['concurrentUpdate']='must survive';write(out/'manifest.json',current)
                return result
            with patch.object(builder,'build_runtime_bank',build_then_publish_other):
                with self.assertRaisesRegex(ValueError,'concurrent update'):run_main(root,source,out)
            current=json.loads((out/'manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(current['concurrentUpdate'],'must survive');self.assertTrue((out/'sentinel.txt').exists())
            self.assertFalse(list(out.parent.glob('.umi-build-*')))

    def test_publish_rename_failure_restores_previous_directory(self):
        with tempfile.TemporaryDirectory(prefix='umi-hires-swap-test-') as directory:
            root=Path(directory);old=root/'umi';old.mkdir();(old/'sentinel.txt').write_text('old bank')
            staged=root/'new-umi';staged.mkdir();(staged/'sentinel.txt').write_text('new bank')
            real_rename=Path.rename
            def fail_staged(path,target):
                if path==staged:raise OSError('synthetic destination busy')
                return real_rename(path,target)
            with patch.object(Path,'rename',fail_staged):
                with self.assertRaisesRegex(OSError,'destination busy'):builder.publish_runtime(staged,old)
            self.assertEqual((old/'sentinel.txt').read_text(),'old bank')
            self.assertTrue(staged.exists());self.assertFalse(list(root.glob('.umi-previous-*')))

    def test_revision_includes_timing_metadata_and_safe_contiguous_order(self):
        with tempfile.TemporaryDirectory(prefix='umi-hires-time-test-') as directory:
            root=Path(directory);source,out,timeline=fixture(root)
            first={'animations':{'gestures':{'shy':timeline['clips']['shy']}}}
            second=copy.deepcopy(first);second['animations']['gestures']['shy']['periodMs']=101
            self.assertNotEqual(builder.runtime_revision(out,first),builder.runtime_revision(out,second),'Same pixels with different timing get a new cache revision')
            path=source/'animations-640/emotion-shy/timeline.json'
            bad=copy.deepcopy(timeline);bad['clips']['shy']['ids'][0]='../escape';write(path,bad)
            with self.assertRaisesRegex(ValueError,'ordered safe'):builder.load_reviewed_gestures(source)
            bad=copy.deepcopy(timeline);bad['sequence']['steps'][1]['durationMs']=60;write(path,bad)
            with self.assertRaisesRegex(ValueError,'timing'):builder.load_reviewed_gestures(source)

if __name__=='__main__':unittest.main()
