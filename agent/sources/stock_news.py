from __future__ import annotations

import logging
from urllib.parse import quote_plus

import feedparser
import requests

from agent.models import Article
from agent.sources.common import parsed_time

logger = logging.getLogger(__name__)


def _feeds(ticker: str) -> tuple[tuple[str, str], ...]:
    encoded = quote_plus(ticker)
    return (
        ("Yahoo Finance", f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={encoded}&region=US&lang=en-US"),
        ("Google News", f"https://news.google.com/rss/search?q={encoded}+stock&hl=en-US&gl=US&ceid=US:en"),
    )


def fetch_stock_news(tickers: tuple[str, ...], timeout: float = 15.0) -> list[Article]:
    articles: list[Article] = []
    for ticker in tickers:
        for source, url in _feeds(ticker):
            try:
                response = requests.get(url, headers={"User-Agent": "FinPulse/1.0"}, timeout=timeout)
                response.raise_for_status()
            except requests.RequestException as exc:
                logger.warning("Skipping unavailable %s feed for %s: %s", source, ticker, exc)
                continue
            feed = feedparser.parse(response.content)
            for entry in feed.entries:
                title = str(entry.get("title", "")).strip()
                link = str(entry.get("link", "")).strip()
                if title and link:
                    articles.append(
                        Article(
                            title=title,
                            url=link,
                            source=source,
                            published_at=parsed_time(entry.get("published_parsed") or entry.get("updated_parsed")),
                            ticker=ticker,
                        )
                    )
    return articles
