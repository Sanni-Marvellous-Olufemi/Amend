"""Data contracts shared with the extension (mirrored in extension/src/types/events.ts)."""

from typing import Literal

from pydantic import BaseModel, Field

Intent = Literal["CREATE", "UPDATE", "DELETE", "NONE"]
ChangeField = Literal["title", "date", "start_time", "end_time", "location"]


# ---------------------------------------------------------------------------
# What the vision model is allowed to emit. Deliberately offset-free: the model
# never produces timezones or guesses years; normalize.py does that.
# ---------------------------------------------------------------------------


class ModelEvent(BaseModel):
    title: str | None = None
    date: str | None = Field(None, description="YYYY-MM-DD as written. Use null if no calendar date is shown.")
    year_visible: bool = Field(False, description="True only if the year is printed in the image.")
    start_time: str | None = Field(None, description="24h HH:MM, null if not shown")
    end_time: str | None = Field(None, description="24h HH:MM, null if not shown")
    all_day: bool = False
    location: str | None = None
    relative_date_phrase: str | None = Field(
        None, description="Relative wording such as 'tomorrow' or 'this Friday', copied verbatim"
    )


class ModelProposal(BaseModel):
    intent: Intent
    event: ModelEvent
    previous: ModelEvent | None = Field(
        None, description="Old values mentioned for a change, e.g. 'instead of 3 PM'"
    )
    changed_fields: list[ChangeField] = Field(default_factory=list)
    evidence: str = Field("", description="Verbatim quote from the image supporting this proposal")
    cancellation_confidence: Literal["confirmed", "tentative"] | None = None
    ambiguities: list[str] = Field(default_factory=list)


class ModelOutput(BaseModel):
    proposals: list[ModelProposal] = Field(default_factory=list)


class TieBreakOutput(BaseModel):
    chosen_id: str | None = None
    confident: bool = False
    reason: str = ""


# ---------------------------------------------------------------------------
# Normalized contracts exchanged with the extension.
# ---------------------------------------------------------------------------


class PartialFields(BaseModel):
    date: str | None = None
    start_time: str | None = None
    end_time: str | None = None


class Proposal(BaseModel):
    proposal_id: str
    intent: Intent
    title: str | None = None
    start: str | None = Field(None, description="RFC3339 with offset, or YYYY-MM-DD when all_day")
    end: str | None = None
    all_day: bool = False
    location: str | None = None
    changed_fields: list[str] = Field(default_factory=list)
    inferred_fields: list[str] = Field(default_factory=list)
    partial: PartialFields = Field(default_factory=PartialFields)
    previous_hint: PartialFields | None = None
    evidence: str = ""
    needs_review: bool = False
    review_reasons: list[str] = Field(default_factory=list)
    timezone: str


class AnalyzeRequest(BaseModel):
    op_id: str = Field(..., min_length=1, max_length=128)
    image_b64: str = Field(..., min_length=16)
    captured_at: str = Field(..., description="ISO 8601 timestamp of the capture")
    timezone: str = Field(..., description="IANA timezone, e.g. America/Chicago")
    source_hint: str | None = Field(None, max_length=300, description="Tab title; used only by mock mode")


class AnalyzeResponse(BaseModel):
    op_id: str
    proposals: list[Proposal]
    model: str
    latency_ms: int
    mock: bool = False


class Candidate(BaseModel):
    id: str
    title: str = ""
    start: str
    end: str | None = None
    location: str | None = None
    recurring: bool = False


class MatchRequest(BaseModel):
    op_id: str
    proposal: Proposal
    candidates: list[Candidate] = Field(default_factory=list, max_length=250)


class RankedCandidate(BaseModel):
    id: str
    score: float
    reason: str


class MatchResponse(BaseModel):
    op_id: str
    ranked: list[RankedCandidate]
    decision: Literal["single", "ambiguous", "none"]
    chosen_id: str | None = None
    explanation: str = ""


class HealthResponse(BaseModel):
    ok: bool
    ollama: bool
    model: str
    model_available: bool
    mock: bool
    detail: str | None = None
