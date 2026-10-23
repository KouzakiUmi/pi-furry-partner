"""Meaningful edge-key regressions; run with python tests/watch_matte.py.

The fixtures distinguish lossy codec-edge contamination from legitimate white,
colored, thin, and interior coverage. No production videos/assets are needed.
"""
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_watch_matte import extract_matte,decontaminate_dark_contour_edges,resize_soft,remove_distant_low_alpha_noise


def fixture():
    image=np.zeros((32,32,4),dtype=np.float64)
    image[8:24,8:24]=[.04,.05,.07,1]
    # A neutral bright codec residue immediately outside a dark ink contour.
    image[8:24,7]=[.50,.51,.52,.45]
    return image


class WatchMatteTests(unittest.TestCase):
    def test_action_staging_accepts_the_restored_opt_in_signature(self):
        from process_approved_h3_actions import process_one
        with tempfile.TemporaryDirectory(prefix='watch-matte-staging-') as directory:
            root=Path(directory)
            for name in ['native','rgba','webp','black','gray','white']:
                (root/name).mkdir()
            source=np.zeros((24,24,3),dtype=np.uint8);source[:,:,1]=247
            source[7:17,7:17]=[22,20,30];source[7:17,6]=[63,139,59]
            image=root/'source.png';Image.fromarray(source).save(image)
            record=process_one((image,root,1,1,24,1,0,0))
            self.assertTrue(record['detail']['edgeColorDecontamination']['alphaExactlyUnchanged'])
            self.assertTrue(record['detail']['edgeColorDecontamination']['opaqueRgbExactlyUnchanged'])
            self.assertEqual(Image.open(root/'rgba'/'001.png').size,(640,640))
            self.assertTrue((root/'webp'/'001.webp').is_file())

    def test_default_keeps_original_inverse_compositing(self):
        source=np.zeros((24,24,3),dtype=np.uint8);source[:,:,1]=247
        source[7:17,7:17]=[30,40,65]
        source[7:17,6]=[63,139,59]  # A real watch f0 outer codec-edge sample.
        image=Image.fromarray(source)
        actual,matte,detail=extract_matte(image)
        rgb=source.astype(float)/255;background=np.array([0,247,0])/255
        expected_matte=np.clip(np.maximum(0,rgb[:,:,1]-rgb[:,:,[0,2]].max(2))/(247/255),0,1)
        alpha=1-expected_matte
        expected=np.divide(rgb-expected_matte[:,:,None]*background,alpha[:,:,None],
                           out=np.zeros_like(rgb),where=alpha[:,:,None]>1e-12)
        np.testing.assert_array_equal(matte,expected_matte)
        np.testing.assert_array_equal(actual,np.dstack((expected.clip(0,1),alpha)))
        self.assertNotIn('edgeColorDecontamination',detail)

    def test_real_codec_sample_is_repaired_only_when_opted_in(self):
        source=np.zeros((24,24,3),dtype=np.uint8);source[:,:,1]=247
        source[7:17,7:17]=[22,20,30]
        source[7:17,6]=[63,139,59]
        image=Image.fromarray(source)
        old,old_matte,_=extract_matte(image)
        new,new_matte,detail=extract_matte(image,edge_decontamination=True)
        np.testing.assert_array_equal(old_matte,new_matte)
        np.testing.assert_array_equal(old[:,:,3],new[:,:,3])
        self.assertLess(new[10,6,:3].max(),old[10,6,:3].max())
        self.assertTrue(detail['edgeColorDecontamination']['alphaExactlyUnchanged'])
        self.assertTrue(detail['edgeColorDecontamination']['opaqueRgbExactlyUnchanged'])

    def test_dark_outer_residue_changes_but_alpha_and_opaque_rgb_are_exact(self):
        old=fixture();new,report=decontaminate_dark_contour_edges(old)
        self.assertGreater(report['correctedPixels'],0)
        self.assertLess(new[12,7,:3].max(),old[12,7,:3].max())
        np.testing.assert_array_equal(old[:,:,3],new[:,:,3])
        np.testing.assert_array_equal(old[old[:,:,3]>=.985],new[old[:,:,3]>=.985])

    def test_white_fur_paper_claw_tip_and_saturated_scarf_are_preserved(self):
        for rgb in ([.95,.95,.93],[1,1,1],[.91,.87,.89],[.10,.45,.99]):
            with self.subTest(rgb=rgb):
                old=fixture();old[8:24,7,:3]=rgb
                new,_=decontaminate_dark_contour_edges(old)
                np.testing.assert_array_equal(new,old)

    def test_nearby_reliable_white_or_colored_material_vetoes_guess(self):
        for rgb in ([.9,.91,.94],[.10,.45,.99]):
            with self.subTest(rgb=rgb):
                old=fixture();old[8:24,9,:3]=rgb
                new,_=decontaminate_dark_contour_edges(old)
                np.testing.assert_array_equal(new,old)

    def test_transparent_lens_or_other_enclosed_interior_is_untouched(self):
        old=fixture();old[11:20,11:20]=[.50,.51,.52,.45]
        new,_=decontaminate_dark_contour_edges(old)
        np.testing.assert_array_equal(new[11:20,11:20],old[11:20,11:20])

    def test_isolated_thin_feature_has_no_opaque_prior_and_is_untouched(self):
        old=np.zeros((24,24,4));old[4:20,12]=[.5,.51,.52,.45]
        new,report=decontaminate_dark_contour_edges(old)
        np.testing.assert_array_equal(new,old)
        self.assertEqual(report['correctedPixels'],0)

    def test_reliable_color_beyond_four_pixels_is_never_used(self):
        old=fixture();old[8:24,7]=0;old[8:24,3]=[.5,.51,.52,.45]
        new,_=decontaminate_dark_contour_edges(old)
        np.testing.assert_array_equal(new,old)

    def test_weights_are_soft_in_the_uncertainty_band(self):
        old=fixture();old[8:24,7,:3]=[.23,.24,.26]
        new,_=decontaminate_dark_contour_edges(old)
        self.assertTrue(np.all(new[12,7,:3]<old[12,7,:3]))
        self.assertTrue(np.all(new[12,7,:3]>old[12,8,:3]))

    def test_translation_does_not_change_local_color_or_alpha_decision(self):
        old=fixture();offset=np.zeros((42,46,4));offset[4:36,6:38]=old
        a,_=decontaminate_dark_contour_edges(old);b,_=decontaminate_dark_contour_edges(offset)
        np.testing.assert_array_equal(a,b[4:36,6:38])

    def test_resize_keeps_alpha_identical_for_opt_in_and_legacy_rgb(self):
        old=fixture();new,_=decontaminate_dark_contour_edges(old)
        np.testing.assert_array_equal(resize_soft(old,(23,23))[:,:,3],resize_soft(new,(23,23))[:,:,3])


class DistantLowAlphaTests(unittest.TestCase):
    def test_only_far_sub128_alpha_is_removed_and_rgb_is_exact(self):
        old=np.zeros((32,32,4),dtype=np.uint8)
        old[:,:,:3]=[34,81,126]
        old[14:18,14:18,3]=255
        old[4,4,3]=127
        old[7,7,3]=1
        old[9,9,3]=0
        new,report=remove_distant_low_alpha_noise(old)
        self.assertEqual(report['removedDistantLowAlphaPixels'],2)
        self.assertEqual(new[4,4,3],0)
        self.assertEqual(new[7,7,3],0)
        np.testing.assert_array_equal(new[:,:,:3],old[:,:,:3])
        np.testing.assert_array_equal(new[old[:,:,3]>=128],old[old[:,:,3]>=128])
        self.assertTrue(report['allRgbExactlyUnchanged'])
        self.assertTrue(report['opaqueRgbaIdentical'])
        self.assertTrue(report['supportedAlphaIdentical'])
        self.assertTrue(report['retainedRgbaIdentical'])
        self.assertEqual(old[4,4,3],127,"The input must not be mutated")

    def test_128_is_support_and_square_radius_four_preserves_soft_edge(self):
        old=np.zeros((24,24,4),dtype=np.uint8)
        old[12,12]=[180,190,200,128]
        old[8,8]=[90,100,110,1]  # 9x9 MaxFilter includes the diagonal.
        old[12,8]=[90,100,110,127]
        old[12,7]=[90,100,110,127]  # Five pixels away is outside support.
        new,report=remove_distant_low_alpha_noise(old)
        np.testing.assert_array_equal(new[8,8],old[8,8])
        np.testing.assert_array_equal(new[12,8],old[12,8])
        np.testing.assert_array_equal(new[12,12],old[12,12])
        self.assertEqual(new[12,7,3],0)
        self.assertEqual(report['removedDistantLowAlphaPixels'],1)

    def test_no_support_and_no_soft_alpha_are_well_defined(self):
        old=np.full((16,16,4),[8,16,32,127],dtype=np.uint8)
        new,report=remove_distant_low_alpha_noise(old)
        self.assertEqual(report['removedDistantLowAlphaPixels'],256)
        self.assertFalse(new[:,:,3].any())
        opaque=old.copy();opaque[:,:,3]=255
        retained,report=remove_distant_low_alpha_noise(opaque)
        np.testing.assert_array_equal(retained,opaque)
        self.assertEqual(report['removedDistantLowAlphaPixels'],0)

    def test_cleanup_is_idempotent_and_rejects_unquantized_float_input(self):
        old=np.zeros((16,16,4),dtype=np.uint8);old[4,4]=[255,128,0,12]
        first,_=remove_distant_low_alpha_noise(old)
        second,report=remove_distant_low_alpha_noise(first)
        np.testing.assert_array_equal(first,second)
        self.assertEqual(report['removedDistantLowAlphaPixels'],0)
        with self.assertRaisesRegex(ValueError,'uint8'):
            remove_distant_low_alpha_noise(old.astype(float)/255)


if __name__=='__main__':unittest.main()
