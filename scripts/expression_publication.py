"""Source-native expression processing and explicit withdrawal publication gates.

These helpers never color-correct or non-uniformly stretch artwork.  Historical
calibration experiments remain separate from every production entry point.
"""
from pathlib import Path
import json

import numpy as np
from build_watch_matte import resize_soft

SOURCE_NATIVE_PROCESSING = {
    'version': 'source-native-v1',
    'method': 'Uniform full-canvas resize and centered transparent padding only',
    'colorCorrection': False,
    'nonUniformScale': False,
    'perFrameFit': False,
    'canvas': [640, 640],
}


def assert_no_withdrawal(*directories):
    """An adjacent withdrawal is authoritative even if an old review says yes."""
    for directory in {Path(p).resolve() for p in directories if p is not None}:
        record = directory / 'withdrawal-record.json'
        if not record.exists():
            continue
        try:
            if not record.is_file() or record.stat().st_size > 1024 * 1024:
                raise ValueError('Invalid withdrawal record file')
            data = json.loads(record.read_text(encoding='utf-8'))
            if not isinstance(data, dict) or data.get('schemaVersion') != 1:
                raise ValueError('Invalid withdrawal record schema')
            if not isinstance(data.get('status'), str) or type(data.get('deploymentAllowed')) is not bool:
                raise ValueError('Invalid withdrawal record decision')
        except (OSError, ValueError, TypeError) as error:
            raise ValueError(f'Cannot verify withdrawal record; publication refused: {record}') from error
        if data['deploymentAllowed'] is not True or data['status'].startswith('withdrawn'):
            raise ValueError(f'Artwork was withdrawn; publication refused: {record}. '
                             'Approve replacement artwork and explicitly migrate the version; '
                             'do not delete the historical withdrawal record.')


def assert_source_native_metadata(metadata):
    """Historical approvals cannot reactivate the rejected color/aspect mapping."""
    if not isinstance(metadata, dict):
        raise ValueError('Expression metadata must be an object')
    processing = metadata.get('processing', {})
    if not isinstance(processing, dict):
        raise ValueError('Invalid expression processing metadata')
    aspect = metadata.get('aspect', {})
    if ('fixedCalibrations' in processing or metadata.get('colorCalibration')
            or processing.get('colorCorrection') is True or processing.get('nonUniformScale') is True
            or (isinstance(aspect, dict) and aspect.get('scaleY', 1) != aspect.get('scaleX', 1))):
        raise ValueError('Withdrawn RGB/aspect calibration cannot enter production')
    native = processing.get('sourceNative')
    if native is not None and native != SOURCE_NATIVE_PROCESSING:
        raise ValueError('Unknown source-native processing; publication refused')


def normalize_full_canvas(rgba, size=(640, 640)):
    """Same canvas transform for all frames; never fit to foreground bounds."""
    array = np.asarray(rgba)
    if array.ndim != 3 or array.shape[2] != 4 or array.dtype.kind != 'f':
        raise ValueError('Source canvas must be float RGBA')
    if not np.isfinite(array).all() or np.any(array < 0) or np.any(array > 1):
        raise ValueError('Source canvas must contain finite RGBA in 0..1')
    height, width = array.shape[:2]
    if min(width, height) < 1:
        raise ValueError('Source canvas must not be empty')
    if (width, height) == size:
        return array.copy()
    scale = min(size[0] / width, size[1] / height)
    resized_size = (max(1, round(width * scale)), max(1, round(height * scale)))
    resized = resize_soft(array, resized_size)
    canvas = np.zeros((size[1], size[0], 4), dtype=resized.dtype)
    x, y = (size[0] - resized_size[0]) // 2, (size[1] - resized_size[1]) // 2
    canvas[y:y + resized_size[1], x:x + resized_size[0]] = resized
    return canvas


def source_native_geometry_metrics(rgba, minimum_margin=4):
    array = np.asarray(rgba)
    if array.shape != (640, 640, 4):
        raise ValueError('Expression geometry requires the fixed 640 canvas')
    yy, xx = np.where(array[:, :, 3] > 180 / 255)
    bounds = None if not len(xx) else [int(xx.min()), int(yy.min()), int(xx.max() + 1), int(yy.max() + 1)]
    margin = None if bounds is None else {'left': bounds[0], 'top': bounds[1],
                                        'right': 640 - bounds[2], 'bottom': 640 - bounds[3]}
    return {'bbox': bounds, 'marginPx': margin, 'minimumMarginPx': minimum_margin,
            'empty': bounds is None, 'withinMargin': bool(margin and min(margin.values()) >= minimum_margin),
            'visibleAlphaThreshold': 180 / 255, 'nonUniformScale': False}
