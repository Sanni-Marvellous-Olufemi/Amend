"""Turn raw model output into calendar-safe proposals.

The model only reports what is visible. Everything that requires judgement about
time (years, relative words, timezones, DST, default durations) happens here,
deterministically, so it can be unit-tested.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from ..schemas import ModelEvent, ModelProposal, PartialFields, Proposal

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_TIME_RE = re.compile(r"^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*$", re.IGNORECASE)
_DATE_RE = re.compile(r"^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$")
_MONTH = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
# Any way a date can be written in announcement text. Months need a day next to them so
# "may be cancelled" doesn't count.
_DATE_TEXT_RE = re.compile(
    rf"\b{_MONTH}\s+\d{{1,2}}\b|\b\d{{1,2}}(?:st|nd|rd|th)?\s+(?:of\s+)?{_MONTH}"
    r"|\b(?:mon|tues|wednes|thurs|fri|satur|sun)days?\b"
    r"|\b(?:today|tonight|tomorrow|this\s+(?:morning|afternoon|evening))\b"
    r"|\b\d{1,2}/\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b",
    re.IGNORECASE,
)
MAX_FUTURE_DAYS = 730
MAX_PAST_DAYS = 30


def parse_time(value: str | None) -> time | None:
    if not value:
        return None
    m = _TIME_RE.match(value)
    if not m:
        return None
    hour, minute = int(m.group(1)), int(m.group(2) or 0)
    meridiem = (m.group(3) or "").lower().replace(".", "")
    if meridiem == "pm" and hour < 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return time(hour, minute)


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    m = _DATE_RE.match(value)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def infer_year(month: int, day: int, reference: date) -> date | None:
    """Next occurrence of month/day on or after (reference - 1 day)."""
    for year in (reference.year, reference.year + 1):
        try:
            candidate = date(year, month, day)
        except ValueError:
            continue
        if candidate >= reference - timedelta(days=1):
            return candidate
    return None


def resolve_relative(phrase: str | None, reference: date) -> tuple[date | None, str | None]:
    """Resolve simple relative phrases. Returns (date, review_reason)."""
    if not phrase:
        return None, None
    p = phrase.strip().lower()
    if p in {"today", "tonight", "this evening", "this afternoon", "this morning"}:
        return reference, None
    if p == "tomorrow" or p.startswith("tomorrow "):
        return reference + timedelta(days=1), None
    m = re.match(r"^(this|next|on)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", p)
    if m:
        qualifier, weekday = m.group(1), WEEKDAYS.index(m.group(2))
        delta = (weekday - reference.weekday()) % 7
        if qualifier == "next":
            delta = delta or 7
            return reference + timedelta(days=delta), f"'{phrase}' can mean this week or next week; please confirm the date"
        return reference + timedelta(days=delta), None
    return None, f"Could not resolve '{phrase}' to a date"


def combine(d: date, t: time, tz: ZoneInfo) -> datetime:
    return datetime.combine(d, t).replace(tzinfo=tz)


def mentions_date(text: str) -> bool:
    return bool(_DATE_TEXT_RE.search(text))


def _resolve_event_date(ev: ModelEvent, reference: date, reasons: list[str], evidence: str) -> date | None:
    resolved = _model_date(ev, reference, reasons)
    # When the text only gives a time ("now at 5:30"), small vision models fill in the capture
    # day, either in `date` or by copying the capture time from the prompt into
    # `relative_date_phrase`. A date on the capture day must be backed by the quoted text.
    if resolved == reference and not mentions_date(evidence):
        return None
    return resolved


def _model_date(ev: ModelEvent, reference: date, reasons: list[str]) -> date | None:
    parsed = parse_date(ev.date)
    if parsed is not None:
        if ev.year_visible:
            return parsed
        return infer_year(parsed.month, parsed.day, reference)
    if ev.relative_date_phrase:
        resolved, reason = resolve_relative(ev.relative_date_phrase, reference)
        if reason:
            reasons.append(reason)
        return resolved
    if ev.date:
        reasons.append(f"Unrecognized date '{ev.date}'")
    return None


def _clean(text: str | None) -> str | None:
    if text is None:
        return None
    text = " ".join(text.split())
    return text or None


def normalize(
    mp: ModelProposal,
    captured_at: datetime,
    tz_name: str,
    default_duration_min: int = 60,
) -> Proposal | None:
    """Returns None for proposals that should be dropped entirely."""
    if mp.intent == "NONE":
        return None
    evidence = _clean(mp.evidence) or ""
    title = _clean(mp.event.title)
    if not evidence and not title:
        return None

    tz = ZoneInfo(tz_name)
    reference = captured_at.astimezone(tz).date()
    reasons: list[str] = [a for a in (_clean(x) for x in mp.ambiguities) if a]
    inferred: list[str] = []

    ev = mp.event
    ev_date = _resolve_event_date(ev, reference, reasons, evidence)
    start_t = parse_time(ev.start_time)
    end_t = parse_time(ev.end_time)
    if ev.start_time and start_t is None:
        reasons.append(f"Unrecognized start time '{ev.start_time}'")
    if ev.end_time and end_t is None:
        reasons.append(f"Unrecognized end time '{ev.end_time}'")

    all_day = bool(ev.all_day and start_t is None)
    start: str | None = None
    end: str | None = None

    if ev_date and all_day:
        start = ev_date.isoformat()
        end = (ev_date + timedelta(days=1)).isoformat()
    elif ev_date and start_t:
        start_dt = combine(ev_date, start_t, tz)
        if end_t:
            end_dt = combine(ev_date, end_t, tz)
            if end_dt <= start_dt:
                end_dt += timedelta(days=1)
        elif mp.intent == "CREATE":
            end_dt = start_dt + timedelta(minutes=default_duration_min)
            inferred.append("end")
        else:
            end_dt = None
        start = start_dt.isoformat()
        end = end_dt.isoformat() if end_dt else None

    if ev_date:
        days_out = (ev_date - reference).days
        if days_out > MAX_FUTURE_DAYS:
            reasons.append("Date is more than two years away")
        elif days_out < -MAX_PAST_DAYS:
            reasons.append("Date is in the past")

    if not evidence:
        reasons.append("No supporting text was quoted from the screenshot")
    if not title:
        reasons.append("Event title is missing")

    if mp.intent == "CREATE":
        if ev_date is None:
            reasons.append("No date found for the new event")
        elif start_t is None and not all_day:
            reasons.append("No start time found for the new event")
    if mp.intent == "DELETE" and mp.cancellation_confidence != "confirmed":
        reasons.append("The cancellation may be tentative")
    if mp.intent == "UPDATE" and not mp.changed_fields:
        reasons.append("Could not tell which details changed")

    previous_hint = None
    if mp.previous is not None:
        prev_reasons: list[str] = []
        prev_date = _resolve_event_date(mp.previous, reference, prev_reasons, evidence)
        prev_start = parse_time(mp.previous.start_time)
        previous_hint = PartialFields(
            date=prev_date.isoformat() if prev_date else None,
            start_time=prev_start.strftime("%H:%M") if prev_start else None,
        )

    changed = list(dict.fromkeys(mp.changed_fields))
    if mp.intent == "UPDATE":
        # A field the model claims changed but gave no value for is unusable.
        values = {
            "title": title,
            "date": ev_date,
            "start_time": start_t,
            "end_time": end_t,
            "location": _clean(ev.location),
        }
        missing = [f for f in changed if values.get(f) is None]
        if missing:
            reasons.append("No new value found for: " + ", ".join(missing))
            changed = [f for f in changed if f not in missing]

    return Proposal(
        proposal_id=uuid.uuid4().hex[:12],
        intent=mp.intent,
        title=title,
        start=start,
        end=end,
        all_day=all_day,
        location=_clean(ev.location),
        changed_fields=changed,
        inferred_fields=inferred,
        partial=PartialFields(
            date=ev_date.isoformat() if ev_date else None,
            start_time=start_t.strftime("%H:%M") if start_t else None,
            end_time=end_t.strftime("%H:%M") if end_t else None,
        ),
        previous_hint=previous_hint,
        evidence=evidence,
        needs_review=bool(reasons),
        review_reasons=list(dict.fromkeys(reasons)),
        timezone=tz_name,
    )
