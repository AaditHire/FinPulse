from __future__ import annotations

import json
import os
from collections import defaultdict
from collections.abc import Sequence

import requests

from agent.models import Article, AssetSummary

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
SYSTEM_PROMPT = (
    "You are a careful financial analyst. Summarize the supplied headlines for the asset in 3-5 "
    "sentences and explicitly flag news that could move price. Do not invent facts. Return only "
    'valid JSON with this shape: {"ticker":"...","summary":"...","sentiment":'
    '"positive|negative|neutral|mixed"}'
)


def summarize_articles(
    articles: Sequence[Article], api_key: str, timeout: float = 45.0
) -> list[AssetSummary]:
    grouped: dict[str, list[str]] = defaultdict(list)
    for article in articles:
        grouped[article.ticker].append(f"[{article.source}] {article.title}")
    if not grouped:
        return []
    summaries: list[AssetSummary] = []
    for ticker, headlines in grouped.items():
        prompt = f"Asset: {ticker}\n" + "\n".join(f"- {headline}" for headline in headlines)
        response = requests.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": MODEL,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=timeout,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        row = json.loads(content)
        summaries.append(
            AssetSummary(
                ticker=str(row.get("ticker", ticker)).upper(),
                summary=str(row["summary"]),
                sentiment=str(row.get("sentiment", "neutral")).lower(),
            )
        )
    return summaries
