from datetime import datetime
from zoneinfo import ZoneInfo

from app.schemas import Candidate, ModelEvent, ModelProposal, PartialFields, Proposal, TieBreakOutput
from app.services.normalize import normalize
from app.services.reconcile import decide, rank

TZ = "America/Chicago"

CANDIDATES = [
    Candidate(id="evt_101", title="ACM Tech Night", start="2026-11-06T16:00:00-06:00", location="ECEB 1002"),
    Candidate(id="evt_102", title="ACM Study Session", start="2026-11-07T14:00:00-06:00"),
    Candidate(id="evt_103", title="ACM Tech Talk", start="2026-11-06T18:00:00-06:00", location="ECEB 2015"),
    Candidate(id="evt_104", title="Dentist", start="2026-11-03T09:00:00-06:00"),
]


def proposal(**kw) -> Proposal:
    base = dict(proposal_id="p1", intent="UPDATE", evidence="x", timezone=TZ)
    base.update(kw)
    return Proposal(**base)


def test_clear_match_with_previous_time():
    p = proposal(
        title="Tech Night",
        changed_fields=["start_time"],
        partial=PartialFields(start_time="17:30"),
        previous_hint=PartialFields(start_time="16:00"),
    )
    ranked = rank(p, CANDIDATES)
    result = decide("op", ranked, {c.id for c in CANDIDATES}, None)
    assert result.decision == "single"
    assert result.chosen_id == "evt_101"


def test_reschedule_with_echoed_capture_date_still_matches():
    # The real model put today's date (Oct 30) on "now at 5:30 instead of 4:00". Normalizing
    # must drop it, or matching scores Tech Night as "7 days apart".
    mp = ModelProposal(
        intent="UPDATE",
        event=ModelEvent(title="Tech Night", date="2026-10-30", year_visible=False, start_time="17:30"),
        previous=ModelEvent(date="2026-10-30", year_visible=False, start_time="16:00"),
        changed_fields=["start_time"],
        evidence="Tech Night is now at 5:30 PM instead of 4:00, same place!",
    )
    p = normalize(mp, datetime(2026, 10, 30, 15, 0, tzinfo=ZoneInfo(TZ)), TZ)
    ranked = rank(p, CANDIDATES)
    assert "apart" not in ranked[0].reason
    result = decide("op", ranked, {c.id for c in CANDIDATES}, None)
    assert result.decision == "single" and result.chosen_id == "evt_101"


def test_similar_titles_are_ambiguous():
    p = proposal(title="ACM event", location="Siebel Center 1404", changed_fields=["location"])
    ranked = rank(p, CANDIDATES)
    result = decide("op", ranked, {c.id for c in CANDIDATES}, None)
    assert result.decision == "ambiguous"
    assert {r.id for r in result.ranked[:2]} <= {"evt_101", "evt_103", "evt_102"}


def test_no_match():
    p = proposal(intent="DELETE", title="Board Game Night")
    result = decide("op", rank(p, CANDIDATES), {c.id for c in CANDIDATES}, None)
    assert result.decision == "none"


def test_hallucinated_tie_break_id_is_ignored_and_forces_review():
    p = proposal(intent="DELETE", title="ACM Tech Night", partial=PartialFields(date="2026-11-06"))
    ranked = rank(p, CANDIDATES)
    bogus = TieBreakOutput(chosen_id="evt_999", confident=True, reason="made up")
    result = decide("op", ranked, {c.id for c in CANDIDATES}, bogus)
    assert result.decision == "ambiguous"
    assert result.chosen_id is None


def test_unsure_tie_break_does_not_overrule_clear_match():
    p = proposal(intent="DELETE", title="ACM Tech Night", partial=PartialFields(date="2026-11-06"))
    unsure = TieBreakOutput(chosen_id=None, confident=False, reason="several are plausible")
    result = decide("op", rank(p, CANDIDATES), {c.id for c in CANDIDATES}, unsure)
    assert result.decision == "single" and result.chosen_id == "evt_101"


def test_tie_break_naming_another_event_forces_review():
    p = proposal(intent="DELETE", title="ACM Tech Night", partial=PartialFields(date="2026-11-06"))
    other = TieBreakOutput(chosen_id="evt_103", confident=False, reason="maybe the talk")
    result = decide("op", rank(p, CANDIDATES), {c.id for c in CANDIDATES}, other)
    assert result.decision == "ambiguous" and result.chosen_id is None


def test_model_agreement_keeps_single():
    p = proposal(intent="DELETE", title="ACM Tech Night", partial=PartialFields(date="2026-11-06"))
    ranked = rank(p, CANDIDATES)
    ok = TieBreakOutput(chosen_id="evt_101", confident=True, reason="same title and day")
    result = decide("op", ranked, {c.id for c in CANDIDATES}, ok)
    assert result.decision == "single" and result.chosen_id == "evt_101"
