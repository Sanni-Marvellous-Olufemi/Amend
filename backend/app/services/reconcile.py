"""Match an UPDATE/DELETE proposal to existing calendar events.

Deterministic scoring decides; the model can only make a result *less* certain
(by naming a different event) or reorder close candidates. It can never pick an ID
that was not in the candidate list.
"""

from __future__ import annotations

import math
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

from rapidfuzz import fuzz

from ..schemas import Candidate, MatchResponse, Proposal, RankedCandidate, TieBreakOutput

MIN_SCORE = 0.45
CLEAR_GAP = 0.10
TOP_N = 5


STOPWORDS = {"the", "a", "an", "of", "at", "for", "and", "&", "event", "meeting", "our", "my", "your", "s"}
MIN_TITLE = 0.5


def _tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in STOPWORDS]


def title_similarity(a: str, b: str) -> float:
    """Word containment (tolerant of typos), blended with whole-string similarity."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    small, large = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    hits = sum(1 for t in small if any(t == u or fuzz.ratio(t, u) >= 85 for u in large))
    containment = hits / len(small)
    return 0.75 * containment + 0.25 * fuzz.ratio(" ".join(ta), " ".join(tb)) / 100


def _parse_start(value: str, tz: ZoneInfo) -> tuple[date, str | None]:
    if len(value) == 10:
        return date.fromisoformat(value), None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(tz)
    return dt.date(), dt.strftime("%H:%M")


def reference_for(proposal: Proposal) -> tuple[date | None, str | None]:
    """Best guess at the *existing* event's date and start time."""
    prev = proposal.previous_hint
    ref_date: date | None = None
    ref_time: str | None = None
    if prev and prev.date:
        ref_date = date.fromisoformat(prev.date)
    elif proposal.partial.date and "date" not in proposal.changed_fields:
        ref_date = date.fromisoformat(proposal.partial.date)
    if prev and prev.start_time:
        ref_time = prev.start_time
    elif proposal.partial.start_time and "start_time" not in proposal.changed_fields:
        ref_time = proposal.partial.start_time
    return ref_date, ref_time


def score_candidate(proposal: Proposal, cand: Candidate, tz: ZoneInfo) -> RankedCandidate:
    reasons: list[str] = []
    title_score = title_similarity(proposal.title or "", cand.title)
    reasons.append(f"title {round(title_score * 100)}% similar")

    ref_date, ref_time = reference_for(proposal)
    cand_date, cand_time = _parse_start(cand.start, tz)
    if ref_date is None:
        date_score = 0.5
    else:
        days = abs((cand_date - ref_date).days)
        date_score = math.exp(-days / 7)
        if days == 0:
            reasons.append("same day")
            if ref_time and cand_time:
                date_score = 1.0 if ref_time == cand_time else 0.85
                if ref_time == cand_time:
                    reasons.append("same start time")
        else:
            reasons.append(f"{days} day{'s' if days != 1 else ''} apart")

    if proposal.location and cand.location:
        loc_score = 1.0 if fuzz.partial_ratio(proposal.location.lower(), cand.location.lower()) >= 80 else 0.0
        if loc_score:
            reasons.append("same location")
    else:
        loc_score = 0.5

    total = 0.6 * title_score + 0.25 * date_score + 0.15 * loc_score
    if title_score < MIN_TITLE:
        total = min(total, MIN_SCORE * 0.9)
    return RankedCandidate(id=cand.id, score=round(total, 3), reason=", ".join(reasons))


def rank(proposal: Proposal, candidates: list[Candidate]) -> list[RankedCandidate]:
    tz = ZoneInfo(proposal.timezone)
    scored = [score_candidate(proposal, c, tz) for c in candidates]
    scored.sort(key=lambda r: r.score, reverse=True)
    return [r for r in scored if r.score >= MIN_SCORE * 0.6][:TOP_N]


def needs_tie_break(ranked: list[RankedCandidate]) -> bool:
    """Only consult the model when the deterministic ranking is genuinely close."""
    if len(ranked) < 2 or ranked[0].score < MIN_SCORE:
        return False
    return ranked[1].score >= MIN_SCORE and ranked[0].score - ranked[1].score < CLEAR_GAP


def decide(
    op_id: str,
    ranked: list[RankedCandidate],
    valid_ids: set[str],
    tie_break: TieBreakOutput | None,
) -> MatchResponse:
    if not ranked or ranked[0].score < MIN_SCORE:
        return MatchResponse(
            op_id=op_id,
            ranked=ranked,
            decision="none",
            explanation="No existing event looks like this announcement.",
        )

    llm_choice = tie_break.chosen_id if tie_break and tie_break.chosen_id in valid_ids else None
    if llm_choice:
        ranked = sorted(ranked, key=lambda r: r.id != llm_choice)
        ranked = [
            r.model_copy(update={"reason": f"{r.reason}; model: {tie_break.reason}"}) if r.id == llm_choice else r
            for r in ranked
        ]

    top = max(ranked, key=lambda r: r.score)
    runner_up = sorted((r.score for r in ranked), reverse=True)[1] if len(ranked) > 1 else 0.0
    clear = top.score - runner_up >= CLEAR_GAP
    # A clear winner stands unless the model names a different event or an unknown ID.
    # "Not sure" alone doesn't overrule it: qwen3-vl:4b answers that even for exact matches.
    hallucinated = tie_break is not None and tie_break.chosen_id is not None and llm_choice is None
    picks_other = llm_choice is not None and llm_choice != top.id
    model_disagrees = hallucinated or picks_other

    if clear and not model_disagrees:
        return MatchResponse(
            op_id=op_id,
            ranked=ranked,
            decision="single",
            chosen_id=top.id,
            explanation=top.reason,
        )
    return MatchResponse(
        op_id=op_id,
        ranked=ranked,
        decision="ambiguous",
        explanation="More than one event could match. Choose the right one.",
    )
