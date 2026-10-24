"""WITHDRAWN non-uniform aspect experiment; never use in production builders.

All input/output is straight float RGBA on the same 640px canvas.  Resample
premultiplied RGB and alpha together; never fit a frame's silhouette or change
the horizontal scale.  Title-wave and older non-expression art do not call it.
"""
from __future__ import annotations

import copy
import numpy as np
from PIL import Image

CANVAS_SIZE = (640, 640)
SCALE_X = 1.0
SCALE_Y = 1.10
BASELINE_Y = 602.0
MINIMUM_MARGIN_PX = 4
VISIBLE_ALPHA_THRESHOLD = 180 / 255
ASPECT_METADATA = {
    'version': 'expression-aspect-1',
    'status': 'withdrawn-user-rejected', 'deploymentAllowed': False,
    'method': 'Fixed whole-canvas premultiplied float RGBA bicubic affine',
    'canvas': [640, 640], 'scaleX': SCALE_X, 'scaleY': SCALE_Y,
    'anchor': {'name': 'grounded-paw-baseline', 'x': None, 'y': BASELINE_Y},
    'forwardIndexCoordinates': 'x_out=x_in; y_out=602+(y_in-602)*1.10',
    'pixelCenters': 'Input/output pixel index y denotes sample centre y+0.5',
    'minimumVisibleMarginPx': MINIMUM_MARGIN_PX,
    'visibleAlphaThreshold': VISIBLE_ALPHA_THRESHOLD,
    'perFrameFit': False, 'perFrameAlignment': False,
    'localWarp': False, 'runtimeWarp': False,
}


def geometry_metadata():
    return copy.deepcopy(ASPECT_METADATA)


def _rgba(value):
    array = np.asarray(value)
    if array.shape != (640, 640, 4) or array.dtype.kind != 'f':
        raise ValueError('Expression aspect input must be float 640x640 RGBA in 0..1')
    if not np.isfinite(array).all() or np.any(array < 0) or np.any(array > 1):
        raise ValueError('Expression aspect input must contain finite 0..1 float RGBA')
    return array


def _bounds(alpha):
    points = np.argwhere(alpha > VISIBLE_ALPHA_THRESHOLD)
    if not len(points):
        return None
    return [int(points[:, 1].min()), int(points[:, 0].min()),
            int(points[:, 1].max() + 1), int(points[:, 0].max() + 1)]


def expression_geometry_metrics(result, *, source=None):
    array = _rgba(result)
    bounds = _bounds(array[:, :, 3])
    margin = None if bounds is None else {
        'left': bounds[0], 'top': bounds[1],
        'right': 640 - bounds[2], 'bottom': 640 - bounds[3],
    }
    projected = None
    source_within = True
    if source is not None:
        before = _bounds(_rgba(source)[:, :, 3])
        if before is None:
            source_within = False
        else:
            # Predict the source support too: an isolated icon that leaves the
            # canvas completely must not silently vanish and pass output QC.
            projected = [float(before[0]), BASELINE_Y + (before[1] - BASELINE_Y) * SCALE_Y,
                         float(before[2]), BASELINE_Y + (before[3] - 1 - BASELINE_Y) * SCALE_Y + 1]
            source_within = (projected[0] >= MINIMUM_MARGIN_PX and projected[1] >= MINIMUM_MARGIN_PX
                             and projected[2] <= 640 - MINIMUM_MARGIN_PX
                             and projected[3] <= 640 - MINIMUM_MARGIN_PX)
    within = bool(margin and min(margin.values()) >= MINIMUM_MARGIN_PX and source_within)
    return {'bbox': bounds, 'marginPx': margin, 'minimumMarginPx': MINIMUM_MARGIN_PX,
            'empty': bounds is None, 'withinMargin': within,
            'projectedSourceBounds': projected, 'projectedSourceWithinMargin': source_within,
            'visibleAlphaThreshold': VISIBLE_ALPHA_THRESHOLD}


def apply_expression_geometry(rgba, *, check_margin=True):
    array = _rgba(rgba)
    alpha = array[:, :, 3]
    # Pillow maps sample centres.  Including +0.5 keeps pixel row 602 fixed,
    # rather than accidentally shifting the grounded paw baseline by half a px.
    pivot_center = BASELINE_Y + .5
    inverse = (1., 0., 0., 0., 1. / SCALE_Y, pivot_center * (1. - 1. / SCALE_Y))
    channels = []
    for channel in range(4):
        values = array[:, :, channel] * alpha if channel < 3 else alpha
        plane = Image.fromarray(values.astype(np.float32))
        channels.append(np.asarray(plane.transform(CANVAS_SIZE, Image.Transform.AFFINE,
                           inverse, Image.Resampling.BICUBIC, fillcolor=0), dtype=np.float64))
    transformed_alpha = np.clip(channels[3], 0, 1)
    premultiplied = np.stack(channels[:3], axis=2)
    color = np.divide(premultiplied, transformed_alpha[:, :, None], out=np.zeros_like(premultiplied),
                      where=transformed_alpha[:, :, None] > 1e-12)
    result = np.dstack((np.clip(color, 0, 1), transformed_alpha))
    if check_margin:
        metrics = expression_geometry_metrics(result, source=array)
        if not metrics['withinMargin']:
            raise ValueError(f'Fixed expression aspect exceeds the {MINIMUM_MARGIN_PX}px visible canvas margin: {metrics}')
    return result
