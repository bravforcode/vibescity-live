from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log
)
import logging
from typing import Any, Callable
import httpx

logger = logging.getLogger(__name__)

# Standard Enterprise Retry Policy:
# - Max 3 attempts
# - Exponential backoff (1s, 2s, 4s)
# - Random jitter (automatically handled by wait_exponential)
retry_standard = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True
)

# Specialized Retry for External API (e.g. Stripe, Supabase)
retry_external_api = retry(
    retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True
)

def with_retry_async(
    fn: Callable, 
    max_attempts: int = 3, 
    min_wait: int = 1, 
    max_wait: int = 10
) -> Any:
    """
    Utility wrapper for async functions using tenacity.
    """
    @retry(
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=1, min=min_wait, max=max_wait),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True
    )
    async def wrapped(*args, **kwargs):
        return await fn(*args, **kwargs)
    
    return wrapped
