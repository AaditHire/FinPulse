from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from agent.models import Article
from agent.config import load_settings
from agent.main import scheduled_delivery_due
from agent.pipeline.dedupe import deduplicate
from agent.pipeline.rank import rank_articles
from agent.pipeline.summarize import summarize_articles
from agent.storage.db import DigestStore


def article(title: str, url: str, ticker: str = "BTC", age_hours: int = 0) -> Article:
    return Article(
        title=title,
        url=url,
        source="Test",
        published_at=datetime.now(timezone.utc) - timedelta(hours=age_hours),
        ticker=ticker,
    )


def test_semantic_dedupe_keeps_newest() -> None:
    items = [
        article("Bitcoin rallies after ETF flows", "https://example.com/new"),
        article("BTC rises as ETF inflows grow", "https://example.com/old", age_hours=2),
        article("Ethereum developers announce upgrade", "https://example.com/eth", "ETH", age_hours=1),
    ]
    def fake_embedder(titles: list[str]) -> np.ndarray:
        return np.array(
            [[0.0, 1.0] if "Ethereum" in title else [1.0, 0.05] for title in titles]
        )

    result = deduplicate(items, embedder=fake_embedder)
    assert [item.url for item in result] == ["https://example.com/new", "https://example.com/eth"]


def test_rank_prefers_recent_keyword_match() -> None:
    now = datetime.now(timezone.utc)
    items = [
        article("Markets open quietly", "https://example.com/old", age_hours=36),
        article("Bitcoin climbs on fresh demand", "https://example.com/new", age_hours=1),
    ]
    assert rank_articles(items, now=now)[0].url == "https://example.com/new"


def test_store_filters_and_records_sent_urls(tmp_path: Path) -> None:
    item = article("Bitcoin update", "https://example.com/one")
    with DigestStore(tmp_path / "test.db") as store:
        assert store.unsent([item]) == [item]
        store.mark_sent([item])
        assert store.unsent([item]) == []


def test_summarizer_returns_one_json_record_per_asset(monkeypatch: object) -> None:
    responses = iter(
        [
            {"ticker": "BTC", "summary": "Bitcoin summary.", "sentiment": "positive"},
            {"ticker": "AAPL", "summary": "Apple summary.", "sentiment": "neutral"},
        ]
    )

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, list[dict[str, dict[str, str]]]]:
            import json

            return {"choices": [{"message": {"content": json.dumps(next(responses))}}]}

    monkeypatch.setattr("agent.pipeline.summarize.requests.post", lambda *args, **kwargs: FakeResponse())  # type: ignore[attr-defined]
    result = summarize_articles(
        [article("Bitcoin update", "https://example.com/btc"), article("Apple update", "https://example.com/aapl", "AAPL")],
        "test-key",
    )
    assert [(item.ticker, item.sentiment) for item in result] == [("BTC", "positive"), ("AAPL", "neutral")]


def test_blank_database_path_uses_project_default(monkeypatch: object) -> None:
    monkeypatch.setenv("DATABASE_PATH", "")  # type: ignore[attr-defined]
    assert load_settings().database_path.name == "finpulse.db"


def test_scheduled_delivery_window(monkeypatch: object) -> None:
    monkeypatch.setenv("DIGEST_ACTIVE", "true")  # type: ignore[attr-defined]
    monkeypatch.setenv("DIGEST_DELIVERY_TIME", "08:00")  # type: ignore[attr-defined]
    monkeypatch.setenv("DIGEST_TIMEZONE", "UTC")  # type: ignore[attr-defined]
    assert scheduled_delivery_due(datetime(2026, 8, 21, 8, 12, tzinfo=timezone.utc))
    assert not scheduled_delivery_due(datetime(2026, 8, 21, 8, 45, tzinfo=timezone.utc))
