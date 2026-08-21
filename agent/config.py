from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_PORTFOLIO_PATH = Path(__file__).with_name("portfolio.json")


@dataclass(frozen=True)
class Portfolio:
    crypto: tuple[str, ...]
    stocks: tuple[str, ...]
    email_to: str

    @property
    def tickers(self) -> tuple[str, ...]:
        return self.crypto + self.stocks


@dataclass(frozen=True)
class Settings:
    portfolio: Portfolio
    groq_api_key: str
    smtp_user: str
    smtp_pass: str
    database_path: Path
    crypto_panic_key: str | None = None

    def validate_for_digest(self, *, require_email: bool = True) -> None:
        missing: list[str] = []
        if not self.groq_api_key:
            missing.append("GROQ_API_KEY")
        if require_email:
            if not self.smtp_user:
                missing.append("SMTP_USER")
            if not self.smtp_pass:
                missing.append("SMTP_PASS")
            if not self.portfolio.email_to:
                missing.append("EMAIL_TO (or portfolio.json email_to)")
        if missing:
            raise ValueError(f"Missing required configuration: {', '.join(missing)}")


def load_portfolio(path: Path = DEFAULT_PORTFOLIO_PATH) -> Portfolio:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return Portfolio(
        crypto=tuple(str(item).upper() for item in raw.get("crypto", [])),
        stocks=tuple(str(item).upper() for item in raw.get("stocks", [])),
        email_to=str(os.getenv("EMAIL_TO") or raw.get("email_to", "")).strip(),
    )


def load_settings(portfolio_path: Path = DEFAULT_PORTFOLIO_PATH) -> Settings:
    load_dotenv(ROOT_DIR / ".env")
    return Settings(
        portfolio=load_portfolio(portfolio_path),
        groq_api_key=os.getenv("GROQ_API_KEY", "").strip(),
        smtp_user=os.getenv("SMTP_USER", "").strip(),
        smtp_pass=os.getenv("SMTP_PASS", "").strip(),
        database_path=Path(os.getenv("DATABASE_PATH", ROOT_DIR / "data" / "finpulse.db")),
        crypto_panic_key=os.getenv("CRYPTOPANIC_KEY") or None,
    )
