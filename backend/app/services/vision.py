"""Ollama client for screenshot extraction and candidate tie-breaking."""

from __future__ import annotations

import json
import logging
from datetime import datetime

import httpx
from pydantic import ValidationError

from ..config import settings
from ..schemas import Candidate, ModelOutput, Proposal, TieBreakOutput
from .prompts import ANALYZE_SYSTEM, TIEBREAK_SYSTEM, analyze_user_prompt

log = logging.getLogger("amend.vision")


class ModelError(RuntimeError):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def strip_data_url(image_b64: str) -> str:
    if image_b64.startswith("data:"):
        _, _, image_b64 = image_b64.partition(",")
    return image_b64.strip()


def inline_schema(schema: dict) -> dict:
    """Resolve local $refs so Ollama's grammar converter gets a flat schema."""
    defs = schema.get("$defs", {})

    def resolve(node):
        if isinstance(node, dict):
            if "$ref" in node:
                return resolve(defs[node["$ref"].split("/")[-1]])
            return {
                k: resolve(v)
                for k, v in node.items()
                if k != "$defs" and not (k == "title" and isinstance(v, str))
            }
        if isinstance(node, list):
            return [resolve(n) for n in node]
        return node

    return resolve(schema)


class OllamaClient:
    def __init__(self, base_url: str = settings.ollama_url, model: str = settings.ollama_model):
        self.base_url = base_url
        self.model = model

    async def status(self) -> tuple[bool, bool, str | None]:
        """(ollama_reachable, model_available, detail)"""
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                res.raise_for_status()
                names = {m.get("name", "") for m in res.json().get("models", [])}
        except Exception as exc:  # noqa: BLE001
            return False, False, f"Ollama is not reachable at {self.base_url} ({type(exc).__name__})"
        available = self.model in names or f"{self.model}:latest" in names
        detail = None if available else f"Model '{self.model}' is not pulled. Run: ollama pull {self.model}"
        return True, available, detail

    async def warm(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=settings.timeout_s) as client:
                await client.post(
                    f"{self.base_url}/api/generate",
                    json={"model": self.model, "prompt": "", "keep_alive": "30m"},
                )
        except Exception as exc:  # noqa: BLE001
            log.info("Model warm-up skipped: %s", type(exc).__name__)

    async def _chat(self, messages: list[dict], schema: dict) -> str:
        payload = {
            "model": self.model,
            "messages": messages,
            "format": schema,
            "stream": False,
            "keep_alive": "30m",
            "options": {"temperature": 0},
        }
        try:
            async with httpx.AsyncClient(timeout=settings.timeout_s) as client:
                res = await client.post(f"{self.base_url}/api/chat", json=payload)
        except httpx.TimeoutException as exc:
            raise ModelError("The local model took too long to respond", status=504) from exc
        except httpx.HTTPError as exc:
            raise ModelError(f"Could not reach Ollama at {self.base_url}", status=503) from exc
        if res.status_code == 404:
            raise ModelError(f"Model '{self.model}' is not available. Run: ollama pull {self.model}", status=503)
        if res.status_code >= 400:
            raise ModelError(f"Ollama returned HTTP {res.status_code}")
        return res.json().get("message", {}).get("content", "")

    async def analyze(self, image_b64: str, captured_at: datetime, tz_name: str) -> ModelOutput:
        messages: list[dict] = [
            {"role": "system", "content": ANALYZE_SYSTEM},
            {
                "role": "user",
                "content": analyze_user_prompt(captured_at, tz_name),
                "images": [strip_data_url(image_b64)],
            },
        ]
        schema = inline_schema(ModelOutput.model_json_schema())
        content = await self._chat(messages, schema)
        try:
            return ModelOutput.model_validate_json(content)
        except ValidationError as exc:
            log.info("Model output failed validation; retrying once")
            messages += [
                {"role": "assistant", "content": content[:4000]},
                {
                    "role": "user",
                    "content": "That JSON did not match the schema: "
                    f"{exc.errors(include_url=False)[:5]}. Return corrected JSON only.",
                },
            ]
            content = await self._chat(messages, schema)
            try:
                return ModelOutput.model_validate_json(content)
            except ValidationError as exc2:
                raise ModelError("The model returned an unreadable answer", status=422) from exc2

    async def tie_break(self, proposal: Proposal, candidates: list[Candidate]) -> TieBreakOutput | None:
        announcement = {
            "intent": proposal.intent,
            "title": proposal.title,
            "new_date": proposal.partial.date,
            "new_start_time": proposal.partial.start_time,
            "previous": proposal.previous_hint.model_dump() if proposal.previous_hint else None,
            "location": proposal.location,
            "evidence": proposal.evidence,
        }
        body = json.dumps(
            {"announcement": announcement, "candidates": [c.model_dump() for c in candidates]},
            ensure_ascii=False,
        )
        try:
            content = await self._chat(
                [{"role": "system", "content": TIEBREAK_SYSTEM}, {"role": "user", "content": body}],
                inline_schema(TieBreakOutput.model_json_schema()),
            )
            return TieBreakOutput.model_validate_json(content)
        except (ModelError, ValidationError) as exc:
            log.info("Tie-break unavailable: %s", type(exc).__name__)
            return None


client = OllamaClient()
