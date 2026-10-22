"""Isolated production regression for authored colors, proportions and withdrawal."""
from pathlib import Path
import contextlib
import io
import json
import hashlib
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from expression_publication import (normalize_full_canvas, assert_no_withdrawal,
                                    assert_source_native_metadata)
import build_expression_reactions as builder


class SourceNativeTests(unittest.TestCase):
    def test_full_canvas_uniform_resize_keeps_anatomy_aspect_and_padding(self):
        source=np.zeros((400,800,4),dtype=np.float64)
        source[100:300,200:600]=(.55,.57,.59,1.)
        source[99,200:600]=(.55,.57,.59,.25)
        original=source.copy()
        result=normalize_full_canvas(source)
        yy,xx=np.where(result[:,:,3]>.7)
        self.assertEqual((int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)),(160,240,480,400))
        self.assertEqual((xx.max()-xx.min()+1)/(yy.max()-yy.min()+1),2.)
        self.assertTrue(np.allclose(result[320,320,:3],source[200,400,:3],atol=1e-7))
        self.assertTrue(np.array_equal(source,original))

    def test_640_source_keeps_every_rgba_sample_and_no_foreground_refit(self):
        rng=np.random.default_rng(3)
        image=rng.random((640,640,4))
        self.assertTrue(np.array_equal(normalize_full_canvas(image),image))
        a=np.zeros((400,800,4));a[200:250,300:400]=(1,.4,.2,1.)
        b=a.copy();b[20:30,700:710]=(.1,.4,.8,1.)
        self.assertTrue(np.array_equal(normalize_full_canvas(a)[:,230:350],normalize_full_canvas(b)[:,230:350]))

    def test_withdrawal_is_authoritative_even_with_old_approved_review(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory);record=folder/'withdrawal-record.json'
            (folder/'review.json').write_text('{"qa":{"accepted":true}}')
            for data in [{'schemaVersion':1,'status':'withdrawn-user-rejected','deploymentAllowed':False},
                         {'schemaVersion':1,'status':'withdrawn-user-rejected','deploymentAllowed':True},
                         {'schemaVersion':1,'status':'reviewed','deploymentAllowed':False}]:
                record.write_text(json.dumps(data))
                with self.assertRaisesRegex(ValueError,'withdrawn'):assert_no_withdrawal(folder)
            for malformed in ('{','null','{"schemaVersion":1}'):
                record.write_text(malformed)
                with self.assertRaisesRegex(ValueError,'Cannot verify withdrawal'):assert_no_withdrawal(folder)

    def test_old_calibration_metadata_cannot_bypass_a_missing_sidecar(self):
        for metadata in [{'processing':{'fixedCalibrations':{}}},
                         {'colorCalibration':{'status':'reviewed-root-visual'}},
                         {'aspect':{'scaleX':1,'scaleY':1.10}}]:
            with self.assertRaisesRegex(ValueError,'Withdrawn'):assert_source_native_metadata(metadata)
        assert_source_native_metadata({'processing':{'colorCorrection':False,'nonUniformScale':False}})

    def test_individual_source_entry_point_never_uses_the_old_nine_grid(self):
        with tempfile.TemporaryDirectory(prefix='umi-native-statics-') as directory:
            root=Path(directory);sources=root/'approved';sources.mkdir()
            source=Image.new('RGBA',(800,400),(0,0,0,0))
            data=np.asarray(source).copy();data[100:300,200:600]=(142,145,150,255)
            source=Image.fromarray(data)
            for name in builder.NAMES:source.save(sources/f'emotion-{name}.png')
            for style in ('umi','umi-pixel'):
                folder=root/'assets/reactions'/style;folder.mkdir(parents=True)
                (folder/'reaction-sheet.json').write_text(json.dumps({'palette':[[0,0,0],[255,255,255],[142,145,150]]}))
            with patch.object(builder,'ROOT',root),patch.object(builder,'SOURCE',root/'missing-old-master.png'), \
                 patch.object(sys,'argv',['build_expression_reactions.py','--source-dir',str(sources)]), \
                 contextlib.redirect_stdout(io.StringIO()):builder.main()
            report=json.loads((root/'assets/poses/expressions/metadata.json').read_text())
            self.assertNotIn('aspect',report);self.assertNotIn('colorCalibration',report)
            self.assertEqual(report['processing']['version'],'source-native-v1')
            self.assertEqual(report['scale'],.8)
            hashes=[]
            for name,entry in sorted(report['sourceFiles'].items()):
                archived=root/entry['file']
                self.assertEqual(archived.read_bytes(),(sources/f'emotion-{name}.png').read_bytes())
                self.assertEqual(entry['sha256'],hashlib.sha256(archived.read_bytes()).hexdigest())
                hashes.append(f'{name}:{entry["sha256"]}\n')
            self.assertEqual(report['sourceSha256'],hashlib.sha256(''.join(hashes).encode()).hexdigest())
            expected=np.uint8(np.rint(normalize_full_canvas(data.astype(float)/255)*255))
            for name in builder.NAMES:
                final=np.asarray(Image.open(root/f'Hi-Res/poses-640/emotion-{name}.png'))
                self.assertTrue(np.array_equal(final,expected))
            self.assertFalse((root/'cells').exists(),'Full-canvas builds never touch the legacy master/crops')


if __name__=='__main__':unittest.main()
