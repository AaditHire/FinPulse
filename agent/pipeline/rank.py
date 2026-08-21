from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone
from math import exp

from agent.models import Article, ensure_utc


def article_score(article: Article, now: datetime | None = None) -> float:
    current = ensure_utc(now or datetime.now(timezone.utc))
    age_hours = max(0.0, (current - ensure_utc(article.published_at)).total_seconds() / 3600)
    recency = exp(-age_hours / 24)
    title = article.title.lower()
    ticker = article.ticker.lower()
    keyword_match = 1.0 if ticker in title else 0.0
    if article.ticker == "BTC" and "bitcoin" in title:
        keyword_match = 1.0
    if article.ticker == "ETH" and ("ethereum" in title or "ether" in title):
        keyword_match = 1.0
    return round(recency * 0.7 + keyword_match * 0.3, 6)


def rank_articles(
    articles: Sequence[Article], *, max_per_ticker: int = 5, now: datetime | None = None
) -> list[Article]:
    ranked: list[Article] = []
    for ticker in dict.fromkeys(article.ticker for article in articles):
        matches = [article for article in articles if article.ticker == ticker]
        matches.sort(key=lambda item: article_score(item, now), reverse=True)
        ranked.extend(matches[:max_per_ticker])
    return sorted(ranked, key=lambda item: article_score(item, now), reverse=True)
