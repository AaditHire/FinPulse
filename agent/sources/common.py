from __future__ import annotations

from datetime import datetime, timezone
from time import struct_time


def parsed_time(value: struct_time | None) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    return datetime(*value[:6], tzinfo=timezone.utc)
