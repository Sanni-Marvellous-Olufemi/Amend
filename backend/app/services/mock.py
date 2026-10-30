"""Canned model output for AMEND_MOCK=1, so the full flow runs without Ollama.

Scenarios are picked from the captured tab's title (the demo pages are named
accordingly). Output still goes through normalize(), so mock mode exercises the
real date logic.
"""

import asyncio

from ..schemas import ModelEvent, ModelOutput, ModelProposal

SCENARIOS: dict[str, ModelOutput] = {
    "create": ModelOutput(
        proposals=[
            ModelProposal(
                intent="CREATE",
                event=ModelEvent(
                    title="Robotics Workshop",
                    date="2026-11-12",
                    year_visible=True,
                    start_time="15:00",
                    end_time="16:30",
                    location="Engineering Lab, Room 204",
                ),
                evidence="Robotics Workshop · Thursday, November 12, 2026 · 3:00–4:30 PM · Engineering Lab, Room 204",
            )
        ]
    ),
    "reschedule": ModelOutput(
        proposals=[
            ModelProposal(
                intent="UPDATE",
                event=ModelEvent(title="ACM Tech Night", start_time="17:30"),
                previous=ModelEvent(start_time="16:00"),
                changed_fields=["start_time"],
                evidence="Tech Night is now at 5:30 PM instead of 4:00, same place!",
            )
        ]
    ),
    "cancel": ModelOutput(
        proposals=[
            ModelProposal(
                intent="DELETE",
                event=ModelEvent(title="Robotics Workshop", date="2026-11-12", year_visible=False),
                evidence="Unfortunately, the Robotics Workshop on Thursday, November 12 has been cancelled.",
                cancellation_confidence="confirmed",
            )
        ]
    ),
    "ambiguous": ModelOutput(
        proposals=[
            ModelProposal(
                intent="UPDATE",
                event=ModelEvent(title="ACM event", location="Siebel Center 1404"),
                changed_fields=["location"],
                evidence="Heads up: Friday's ACM event is moving to Siebel Center 1404.",
            )
        ]
    ),
    "none": ModelOutput(proposals=[]),
}

KEYWORDS = [
    ("ambiguous", "ambiguous"),
    ("resched", "reschedule"),
    ("moved", "reschedule"),
    ("cancel", "cancel"),
    ("create", "create"),
    ("workshop", "create"),
    ("nothing", "none"),
]


def pick_scenario(source_hint: str | None) -> str:
    hint = (source_hint or "").lower()
    for keyword, scenario in KEYWORDS:
        if keyword in hint:
            return scenario
    return "create"


async def mock_analyze(source_hint: str | None, delay_s: float = 1.2) -> ModelOutput:
    await asyncio.sleep(delay_s)
    return SCENARIOS[pick_scenario(source_hint)].model_copy(deep=True)
