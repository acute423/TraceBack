"""Dependency-free cosine similarity helpers."""

import math
from collections.abc import Sequence


def normalized_cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    """Return cosine similarity mapped from [-1, 1] to [0, 1]."""
    if not a or not b:
        raise ValueError("Vectors must not be empty.")
    if len(a) != len(b):
        raise ValueError("Vectors must have the same number of elements.")
    if any(not math.isfinite(value) for value in (*a, *b)):
        raise ValueError("Vector values must be finite numbers.")

    norm_a = math.hypot(*a)
    norm_b = math.hypot(*b)
    if norm_a == 0 or norm_b == 0:
        raise ValueError("Zero vectors do not have a defined cosine similarity.")

    cosine = math.fsum((left / norm_a) * (right / norm_b) for left, right in zip(a, b))
    cosine = min(1.0, max(-1.0, cosine))
    return (cosine + 1.0) / 2.0
