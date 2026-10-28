"""Small helpers for deterministic HD build and audit reports."""
import os
from datetime import datetime, timezone
from pathlib import Path


def source_date_epoch():
    raw = os.environ.get('SOURCE_DATE_EPOCH', '0')
    try:
        value = int(raw)
    except ValueError as error:
        raise ValueError('SOURCE_DATE_EPOCH must be an integer') from error
    if value < 0:
        raise ValueError('SOURCE_DATE_EPOCH must not be negative')
    return value


def source_date_utc():
    return datetime.fromtimestamp(source_date_epoch(), timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def logical_path(path, root):
    path = Path(path)
    root = Path(root).resolve()
    try:
        return path.resolve().relative_to(root).as_posix()
    except ValueError:
        return path.name
