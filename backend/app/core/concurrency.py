"""TRIAD semaphore guards — all DB/vector access must go through these."""

import asyncio

core_db_sem = asyncio.Semaphore(30)
history_db_sem = asyncio.Semaphore(10)
vector_sem = asyncio.Semaphore(20)
