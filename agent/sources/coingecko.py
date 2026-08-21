from __future__ import annotations

from dataclasses import dataclass

import requests

API_URL = "https://api.coingecko.com/api/v3/simple/price"
COIN_IDS = {"BTC": "bitcoin", "ETH": "ethereum"}


@dataclass(frozen=True)
class PriceQuote:
    ticker: str
    price_usd: float
    change_24h: float


def fetch_prices(tickers: tuple[str, ...], timeout: float = 15.0) -> list[PriceQuote]:
    requested = {ticker: COIN_IDS[ticker] for ticker in tickers if ticker in COIN_IDS}
    if not requested:
        return []
    response = requests.get(
        API_URL,
        params={
            "ids": ",".join(requested.values()),
            "vs_currencies": "usd",
            "include_24hr_change": "true",
        },
        headers={"User-Agent": "FinPulse/1.0"},
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    return [
        PriceQuote(
            ticker=ticker,
            price_usd=float(payload[coin_id]["usd"]),
            change_24h=float(payload[coin_id].get("usd_24h_change", 0.0)),
        )
        for ticker, coin_id in requested.items()
        if coin_id in payload and "usd" in payload[coin_id]
    ]
