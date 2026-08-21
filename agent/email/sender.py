from __future__ import annotations

import smtplib
from collections.abc import Sequence
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from agent.models import Article, AssetSummary
from agent.sources.coingecko import PriceQuote

TEMPLATE_DIR = Path(__file__).resolve().parent


def render_digest(
    summaries: Sequence[AssetSummary], articles: Sequence[Article], prices: Sequence[PriceQuote]
) -> str:
    environment = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR), autoescape=select_autoescape(["html", "xml"])
    )
    template = environment.get_template("template.html")
    by_ticker = {
        ticker: [article for article in articles if article.ticker == ticker]
        for ticker in dict.fromkeys(article.ticker for article in articles)
    }
    return template.render(
        summaries=summaries,
        articles_by_ticker=by_ticker,
        prices={price.ticker: price for price in prices},
        generated_at=datetime.now(timezone.utc),
    )


def send_digest(*, html: str, sender: str, password: str, recipient: str) -> None:
    message = EmailMessage()
    message["Subject"] = f"FinPulse Daily Brief — {datetime.now().strftime('%b %d, %Y')}"
    message["From"] = sender
    message["To"] = recipient
    message.set_content("Your FinPulse market brief is best viewed as HTML.")
    message.add_alternative(html, subtype="html")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as smtp:
        smtp.login(sender, password)
        smtp.send_message(message)
