from __future__ import annotations

import sqlite3
from collections.abc import Iterable, Sequence
from datetime import datetime, timezone
from pathlib import Path

from agent.models import Article


class DigestStore:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sent_articles (
                article_id TEXT PRIMARY KEY,
                url TEXT NOT NULL UNIQUE,
                ticker TEXT NOT NULL,
                title TEXT NOT NULL,
                sent_at TEXT NOT NULL
            )
            """
        )
        self.connection.commit()

    def unsent(self, articles: Sequence[Article]) -> list[Article]:
        if not articles:
            return []
        ids = [article.article_id for article in articles]
        placeholders = ",".join("?" for _ in ids)
        rows = self.connection.execute(
            f"SELECT article_id FROM sent_articles WHERE article_id IN ({placeholders})", ids
        ).fetchall()
        sent = {row[0] for row in rows}
        return [article for article in articles if article.article_id not in sent]

    def mark_sent(self, articles: Iterable[Article]) -> None:
        sent_at = datetime.now(timezone.utc).isoformat()
        self.connection.executemany(
            "INSERT OR IGNORE INTO sent_articles(article_id, url, ticker, title, sent_at) VALUES (?, ?, ?, ?, ?)",
            ((item.article_id, item.url, item.ticker, item.title, sent_at) for item in articles),
        )
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def __enter__(self) -> "DigestStore":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
