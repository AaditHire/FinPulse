from __future__ import annotations

from collections.abc import Callable, Sequence

import numpy as np

from agent.models import Article

Embedder = Callable[[Sequence[str]], np.ndarray]


def _default_embedder(texts: Sequence[str]) -> np.ndarray:
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    return np.asarray(model.encode(list(texts), normalize_embeddings=True))


def deduplicate(
    articles: Sequence[Article],
    *,
    threshold: float = 0.85,
    embedder: Embedder | None = None,
) -> list[Article]:
    """Keep the newest article from clusters whose title cosine similarity exceeds threshold."""
    if len(articles) < 2:
        return list(articles)
    ordered = sorted(articles, key=lambda article: article.published_at, reverse=True)
    embeddings = (embedder or _default_embedder)([article.title for article in ordered])
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    normalized = embeddings / np.clip(norms, 1e-12, None)
    kept: list[Article] = []
    kept_vectors: list[tuple[str, np.ndarray]] = []
    for article, vector in zip(ordered, normalized, strict=True):
        if any(
            ticker == article.ticker and float(np.dot(vector, existing)) > threshold
            for ticker, existing in kept_vectors
        ):
            continue
        kept.append(article)
        kept_vectors.append((article.ticker, vector))
    return kept
