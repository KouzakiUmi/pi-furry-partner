"""Meaningful edge-key regressions; run with python tests/watch_matte.py.

The fixtures distinguish lossy codec-edge contamination from legitimate white,
colored, thin, and interior coverage. No production videos/assets are needed.
"""
from pathlib import Path
import sys
import unittest

import numpy as np
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_watch_matte import extract_matte,decontaminate_dark_contour_edges,resize_soft


def fixture():
    image=np.zeros((32,32,4),dtype=np.float64)
    image[8:24,8:24]=[.04,.05,.07,1]
    # A neutral bright codec residue immediately outside a dark ink contour.
    image[8:24,7]=[.50,.51,.52,.45]
    return image


class WatchMatteTests(unittest.TestCase):
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


if __name__=='__main__':unittest.main()
