from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256


@dataclass(frozen=True)
class Article:
    title: str
    url: str
    source: str
    published_at: datetime
    ticker: str

    @property
    def article_id(self) -> str:
        return sha256(self.url.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class AssetSummary:
    ticker: str
    summary: str
    sentiment: str


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
