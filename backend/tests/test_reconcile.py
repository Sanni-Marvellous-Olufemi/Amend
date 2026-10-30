from app.schemas import Candidate, PartialFields, Proposal, TieBreakOutput
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


def test_model_agreement_keeps_single():
    p = proposal(intent="DELETE", title="ACM Tech Night", partial=PartialFields(date="2026-11-06"))
    ranked = rank(p, CANDIDATES)
    ok = TieBreakOutput(chosen_id="evt_101", confident=True, reason="same title and day")
    result = decide("op", ranked, {c.id for c in CANDIDATES}, ok)
    assert result.decision == "single" and result.chosen_id == "evt_101"
