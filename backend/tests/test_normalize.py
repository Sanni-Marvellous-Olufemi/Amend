from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.schemas import ModelEvent, ModelProposal
from app.services.normalize import infer_year, normalize, parse_time, resolve_relative

TZ = "America/Chicago"
CAPTURED = datetime(2026, 10, 30, 15, 0, tzinfo=ZoneInfo(TZ))  # a Friday


def create(**event) -> ModelProposal:
    return ModelProposal(intent="CREATE", event=ModelEvent(**event), evidence="flyer text")


def test_parse_time_variants():
    assert parse_time("17:30").strftime("%H:%M") == "17:30"
    assert parse_time("5:30 PM").strftime("%H:%M") == "17:30"
    assert parse_time("12 am").strftime("%H:%M") == "00:00"
    assert parse_time("25:00") is None
    assert parse_time("soon") is None


def test_dst_offsets_are_computed_not_guessed():
    before = normalize(create(title="A", date="2026-10-31", year_visible=True, start_time="15:00"), CAPTURED, TZ)
    after = normalize(create(title="B", date="2026-11-02", year_visible=True, start_time="15:00"), CAPTURED, TZ)
    assert before.start == "2026-10-31T15:00:00-05:00"
    assert after.start == "2026-11-02T15:00:00-06:00"


def test_year_inferred_when_not_visible():
    assert infer_year(1, 15, date(2026, 10, 30)) == date(2027, 1, 15)
    assert infer_year(11, 12, date(2026, 10, 30)) == date(2026, 11, 12)
    p = normalize(create(title="Gala", date="2024-01-15", year_visible=False, start_time="19:00"), CAPTURED, TZ)
    assert p.start.startswith("2027-01-15T19:00")


def test_relative_dates():
    ref = date(2026, 10, 30)  # Friday
    assert resolve_relative("tomorrow", ref) == (date(2026, 10, 31), None)
    assert resolve_relative("this Friday", ref) == (ref, None)
    assert resolve_relative("Monday", ref) == (date(2026, 11, 2), None)
    d, reason = resolve_relative("next Friday", ref)
    assert d == date(2026, 11, 6) and reason
    assert resolve_relative("in a fortnight-ish", ref)[1]


def test_create_defaults_end_and_marks_inferred():
    p = normalize(create(title="Workshop", date="2026-11-12", year_visible=True, start_time="15:00"), CAPTURED, TZ)
    assert p.end == "2026-11-12T16:00:00-06:00"
    assert p.inferred_fields == ["end"]
    assert not p.needs_review


def test_overnight_end_rolls_to_next_day():
    p = normalize(
        create(title="Party", date="2026-11-14", year_visible=True, start_time="22:00", end_time="01:00"),
        CAPTURED,
        TZ,
    )
    assert p.end == "2026-11-15T01:00:00-06:00"


def test_create_missing_time_needs_review():
    p = normalize(create(title="Fair", date="2026-11-12", year_visible=True), CAPTURED, TZ)
    assert p.needs_review and p.start is None
    assert any("start time" in r for r in p.review_reasons)


def test_all_day_event():
    p = normalize(create(title="Fair", date="2026-11-12", year_visible=True, all_day=True), CAPTURED, TZ)
    assert (p.start, p.end, p.all_day) == ("2026-11-12", "2026-11-13", True)


def test_update_time_only_keeps_partial_without_inventing_date():
    mp = ModelProposal(
        intent="UPDATE",
        event=ModelEvent(title="ACM Tech Night", start_time="17:30"),
        previous=ModelEvent(start_time="4 PM"),
        changed_fields=["start_time"],
        evidence="now at 5:30 PM instead of 4",
    )
    p = normalize(mp, CAPTURED, TZ)
    assert p.start is None and p.end is None
    assert p.partial.start_time == "17:30" and p.partial.date is None
    assert p.previous_hint.start_time == "16:00"
    assert not p.needs_review


def test_update_drops_changed_field_without_value():
    mp = ModelProposal(
        intent="UPDATE",
        event=ModelEvent(title="Tech Night"),
        changed_fields=["location"],
        evidence="moved",
    )
    p = normalize(mp, CAPTURED, TZ)
    assert p.changed_fields == [] and p.needs_review


def test_tentative_cancellation_needs_review():
    mp = ModelProposal(
        intent="DELETE",
        event=ModelEvent(title="Picnic"),
        evidence="Picnic may be cancelled if it rains",
        cancellation_confidence="tentative",
    )
    p = normalize(mp, CAPTURED, TZ)
    assert p.needs_review


def test_none_and_empty_are_dropped():
    assert normalize(ModelProposal(intent="NONE", event=ModelEvent()), CAPTURED, TZ) is None
    assert normalize(ModelProposal(intent="CREATE", event=ModelEvent(), evidence=""), CAPTURED, TZ) is None
