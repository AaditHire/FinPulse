from __future__ import annotations

import argparse
import logging
import sys
from dataclasses import dataclass
from pathlib import Path

if __package__ in (None, ""):
    script_dir = Path(__file__).resolve().parent
    sys.path = [entry for entry in sys.path if Path(entry or ".").resolve() != script_dir]
    sys.path.insert(0, str(script_dir.parent))

from fastapi import FastAPI, HTTPException

from agent.config import Settings, load_settings
from agent.email.sender import render_digest, send_digest
from agent.models import Article
from agent.pipeline.dedupe import deduplicate
from agent.pipeline.rank import rank_articles
from agent.pipeline.summarize import summarize_articles
from agent.sources.coingecko import PriceQuote, fetch_prices
from agent.sources.crypto_news import fetch_crypto_news
from agent.sources.stock_news import fetch_stock_news
from agent.storage.db import DigestStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("finpulse")
app = FastAPI(title="FinPulse Agent", version="1.0.0")


@dataclass(frozen=True)
class DigestResult:
    status: str
    article_count: int


def _safe_prices(settings: Settings) -> list[PriceQuote]:
    try:
        return fetch_prices(settings.portfolio.crypto)
    except Exception as exc:  # A price outage should not suppress the news digest.
        logger.warning("CoinGecko unavailable: %s", exc)
        return []


def collect_articles(settings: Settings) -> list[Article]:
    collected: list[Article] = []
    for label, fetcher, tickers in (
        ("crypto news", fetch_crypto_news, settings.portfolio.crypto),
        ("stock news", fetch_stock_news, settings.portfolio.stocks),
    ):
        try:
            collected.extend(fetcher(tickers))
        except Exception as exc:
            logger.warning("Failed to fetch %s: %s", label, exc)
    return collected


def run_digest(settings: Settings | None = None, *, dry_run: bool = False) -> DigestResult:
    settings = settings or load_settings()
    settings.validate_for_digest(require_email=not dry_run)
    prices = _safe_prices(settings)
    with DigestStore(settings.database_path) as store:
        unseen = store.unsent(collect_articles(settings))
        if not unseen:
            logger.info("No new articles; digest skipped.")
            return DigestResult(status="skipped", article_count=0)
        ranked = rank_articles(deduplicate(unseen))
        summaries = summarize_articles(ranked, settings.groq_api_key)
        html = render_digest(summaries, ranked, prices)
        if dry_run:
            preview_path = settings.database_path.parent / "digest-preview.html"
            preview_path.write_text(html, encoding="utf-8")
            logger.info("Dry-run preview written to %s", preview_path)
            return DigestResult(status="previewed", article_count=len(ranked))
        send_digest(
            html=html,
            sender=settings.smtp_user,
            password=settings.smtp_pass,
            recipient=settings.portfolio.email_to,
        )
        store.mark_sent(ranked)
    logger.info("Digest sent with %d articles.", len(ranked))
    return DigestResult(status="sent", article_count=len(ranked))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/run")
def trigger_digest() -> dict[str, str | int]:
    try:
        result = run_digest()
        return {"status": result.status, "article_count": result.article_count}
    except Exception as exc:
        logger.exception("Digest run failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate and email the FinPulse digest")
    parser.add_argument("--dry-run", action="store_true", help="render HTML without sending email")
    args = parser.parse_args()
    run_digest(dry_run=args.dry_run)
