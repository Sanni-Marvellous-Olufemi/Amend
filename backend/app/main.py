from __future__ import annotations

import asyncio
import logging
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    HealthResponse,
    MatchRequest,
    MatchResponse,
)
from .services import reconcile
from .services.mock import mock_analyze
from .services.normalize import normalize
from .services.vision import ModelError, client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("amend")

EXTENSION_ORIGIN_RE = re.compile(r"^chrome-extension://[a-p]{32}$")
PROTECTED_PATHS = {"/analyze", "/match"}


def origin_allowed(origin: str | None) -> bool:
    if not origin:
        return False
    if settings.extension_id:
        return origin == f"chrome-extension://{settings.extension_id}"
    return bool(EXTENSION_ORIGIN_RE.match(origin))


@asynccontextmanager
async def lifespan(_: FastAPI):
    mode = "mock" if settings.mock else f"ollama:{settings.ollama_model}"
    log.info("AMEND backend on http://%s:%s (%s)", settings.host, settings.port, mode)
    if not settings.extension_id:
        log.warning("AMEND_EXTENSION_ID is not set; accepting any chrome-extension:// origin")
    warm_task = None if settings.mock else asyncio.create_task(client.warm())
    yield
    if warm_task:
        warm_task.cancel()


app = FastAPI(title="AMEND local service", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def guard(request: Request, call_next):
    if request.url.path in PROTECTED_PATHS and request.method != "OPTIONS":
        if not origin_allowed(request.headers.get("origin")):
            return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
        if request.headers.get("x-amend-client") != "1":
            return JSONResponse({"detail": "Missing X-Amend-Client header"}, status_code=403)
        if not request.headers.get("content-type", "").startswith("application/json"):
            return JSONResponse({"detail": "Expected application/json"}, status_code=415)
        length = int(request.headers.get("content-length") or 0)
        if length > settings.max_body_bytes:
            return JSONResponse({"detail": "Screenshot is too large"}, status_code=413)
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"chrome-extension://{settings.extension_id}"] if settings.extension_id else [],
    allow_origin_regex=None if settings.extension_id else EXTENSION_ORIGIN_RE.pattern,
    allow_methods=["GET", "POST"],
    allow_headers=["content-type", "x-amend-client"],
    max_age=600,
)


def _tz(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise HTTPException(400, f"Unknown timezone '{name}'") from exc


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    if settings.mock:
        return HealthResponse(ok=True, ollama=False, model="mock", model_available=True, mock=True)
    reachable, available, detail = await client.status()
    return HealthResponse(
        ok=reachable and available,
        ollama=reachable,
        model=settings.ollama_model,
        model_available=available,
        mock=False,
        detail=detail,
    )


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    tz = _tz(req.timezone)
    try:
        captured_at = datetime.fromisoformat(req.captured_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(400, "captured_at must be ISO 8601") from exc
    if captured_at.tzinfo is None:
        captured_at = captured_at.replace(tzinfo=tz)

    started = time.perf_counter()
    try:
        if settings.mock:
            output = await mock_analyze(req.source_hint)
        else:
            output = await client.analyze(req.image_b64)
    except ModelError as exc:
        raise HTTPException(exc.status, str(exc)) from exc

    proposals = [
        p
        for p in (
            normalize(mp, captured_at, req.timezone, settings.default_duration_min) for mp in output.proposals
        )
        if p is not None
    ]
    latency = int((time.perf_counter() - started) * 1000)
    log.info("analyze op=%s proposals=%d latency_ms=%d", req.op_id, len(proposals), latency)
    return AnalyzeResponse(
        op_id=req.op_id,
        proposals=proposals,
        model="mock" if settings.mock else settings.ollama_model,
        latency_ms=latency,
        mock=settings.mock,
    )


@app.post("/match", response_model=MatchResponse)
async def match(req: MatchRequest) -> MatchResponse:
    _tz(req.proposal.timezone)
    ranked = reconcile.rank(req.proposal, req.candidates)
    valid_ids = {c.id for c in req.candidates}
    tie_break = None
    if not settings.mock and reconcile.needs_tie_break(ranked):
        top_ids = {r.id for r in ranked}
        tie_break = await client.tie_break(req.proposal, [c for c in req.candidates if c.id in top_ids])
    result = reconcile.decide(req.op_id, ranked, valid_ids, tie_break)
    log.info("match op=%s candidates=%d decision=%s", req.op_id, len(req.candidates), result.decision)
    return result


def run() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=False)


if __name__ == "__main__":
    run()
