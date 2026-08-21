from __future__ import annotations

import feedparser
import logging
import requests

from agent.models import Article
from agent.sources.common import parsed_time

FEEDS = {
    "CoinDesk": "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "Cointelegraph": "https://cointelegraph.com/rss",
}
KEYWORDS = {
    "BTC": ("bitcoin", "btc"),
    "ETH": ("ethereum", "ether", "eth"),
}
logger = logging.getLogger(__name__)


def _matches(title: str, ticker: str) -> bool:
    lowered = title.lower()
    return any(keyword in lowered for keyword in KEYWORDS.get(ticker, (ticker.lower(),)))


def fetch_crypto_news(tickers: tuple[str, ...], timeout: float = 15.0) -> list[Article]:
    articles: list[Article] = []
    for source, url in FEEDS.items():
        try:
            response = requests.get(url, headers={"User-Agent": "FinPulse/1.0"}, timeout=timeout)
            response.raise_for_status()
        except requests.RequestException as exc:
            logger.warning("Skipping unavailable %s feed: %s", source, exc)
            continue
        feed = feedparser.parse(response.content)
        for entry in feed.entries:
            title = str(entry.get("title", "")).strip()
            link = str(entry.get("link", "")).strip()
            if not title or not link:
                continue
            for ticker in tickers:
                if _matches(title, ticker):
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
