"""Export legacy SQLite delivery history for the controlled TypeScript cutover."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", default="data/finpulse.db")
    parser.add_argument("--output", default="data/sent-history-export.json")
    args = parser.parse_args()
    connection = sqlite3.connect(args.database)
    connection.row_factory = sqlite3.Row
    rows = [dict(row) for row in connection.execute("select article_id, url, ticker, title, sent_at from sent_articles order by sent_at")]
    connection.close()
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({"version": 1, "articles": rows}, indent=2), encoding="utf-8")
    print(f"Exported {len(rows)} sent articles to {target}")


if __name__ == "__main__":
    main()
