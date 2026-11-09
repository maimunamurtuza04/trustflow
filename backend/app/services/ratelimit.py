import time
from collections import defaultdict, deque
from threading import Lock

_events: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def allow(key: str, *, limit: int, window_seconds: int) -> bool:
    """In-process sliding window limiter. Replace with a shared store for multi-worker deployments."""
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        bucket = _events[key]
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True


def reset() -> None:
    with _lock:
        _events.clear()
