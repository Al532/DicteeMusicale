#!/usr/bin/env python3
"""Generate the synthetic-rhythm pilot for very typical DTL licks.

The generator finds every exact interval-pattern occurrence in the public
WJazzD database.  It deliberately discards performed onset microtiming and
keeps only metrical positions.  For each lick it independently selects:

- the modal meter;
- the modal half-beat starting position within that meter;
- the modal quantized duration of every interval;
- the modal pitch-class relation between the first note and the notated bass.

This produces a statistical reconstruction rather than copying one solo.

Usage:
    python scripts/generate_dtl_rhythm_pilot.py /path/to/wjazzd.db
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


TICKS_PER_BEAT = 12
START_GRID_TICKS = 6
PILOT_TEMPO = 156
SWING_RATIO = 1.4
ALLOWED_IOI_TICKS = (2, 3, 4, 6, 8, 9, 12, 16, 18, 24, 36, 48)

MIN_OCCURRENCES = 10
MIN_PERFORMERS = 3
MIN_SOLOS = 3
MIN_PHRASE_CONTAINED_RATIO = 0.9
MIN_ADJUSTED_LOG_EXCESS_PROB = 1.35
MIN_LOG_EXCESS_PROB = 2
EXTRA_INTERVAL_PENALTY = 0.5


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate the DTL synthetic-rhythm pilot.",
    )
    parser.add_argument("database", type=Path, help="public WJazzD SQLite file")
    parser.add_argument(
        "--licks",
        type=Path,
        default=Path("data/dtl-licks.js"),
        help="generated DTL lick corpus",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/dtl-rhythm-pilot.js"),
        help="generated browser module",
    )
    return parser.parse_args()


def read_licks(path: Path) -> list[dict[str, Any]]:
    licks: list[dict[str, Any]] = []
    inside_corpus = False
    for line in path.read_text(encoding="utf-8").splitlines():
        if "licks: Object.freeze([" in line:
            inside_corpus = True
            continue
        if inside_corpus and line.strip() == "]),":
            break
        if inside_corpus and line.lstrip().startswith("{"):
            licks.append(json.loads(line.strip().removesuffix(",")))
    if not licks:
        raise ValueError(f"No DTL licks found in {path}")
    return licks


def adjusted_salience(lick: dict[str, Any]) -> float:
    extra_intervals = max(0, len(lick["intervals"]) - 6)
    return (
        float(lick["logExcessProb"])
        - extra_intervals * EXTRA_INTERVAL_PENALTY
    )


def is_very_typical(lick: dict[str, Any]) -> bool:
    return (
        any(abs(interval) > 2 for interval in lick["intervals"])
        and int(lick["occurrenceCount"]) >= MIN_OCCURRENCES
        and int(lick["performerCount"]) >= MIN_PERFORMERS
        and int(lick["soloCount"]) >= MIN_SOLOS
        and float(lick["phraseContainedRatio"])
        >= MIN_PHRASE_CONTAINED_RATIO
        and adjusted_salience(lick) >= MIN_ADJUSTED_LOG_EXCESS_PROB
        and float(lick["logExcessProb"]) >= MIN_LOG_EXCESS_PROB
    )


def nearest_grid(value: float, step: int) -> int:
    return math.floor(value / step + 0.5) * step


def nearest_allowed_ioi(value: float) -> int:
    return min(ALLOWED_IOI_TICKS, key=lambda tick: (abs(tick - value), tick))


def mode_with_count(values: Iterable[int]) -> tuple[int, int]:
    items = list(values)
    if not items:
        raise ValueError("Cannot select a mode from an empty collection")
    counts = Counter(items)
    maximum = max(counts.values())
    median = statistics.median(items)
    choices = [value for value, count in counts.items() if count == maximum]
    choice = min(choices, key=lambda value: (abs(value - median), value))
    return choice, maximum


def measurements_for_occurrences(
    connection: sqlite3.Connection,
    licks: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    patterns_by_length: dict[int, dict[tuple[int, ...], dict[str, Any]]] = (
        defaultdict(dict)
    )
    for lick in licks:
        patterns_by_length[len(lick["intervals"])][
            tuple(lick["intervals"])
        ] = lick

    matches: dict[str, list[dict[str, Any]]] = defaultdict(list)
    solo_ids = connection.execute(
        "SELECT melid FROM solo_info ORDER BY melid",
    ).fetchall()
    for (melid,) in solo_ids:
        events = connection.execute(
            """
            SELECT CAST(ROUND(pitch) AS INTEGER) AS pitch,
                   bar, beat, tatum, division, num
            FROM melody
            WHERE melid = ?
            ORDER BY onset, eventid
            """,
            (melid,),
        ).fetchall()
        beats = connection.execute(
            """
            SELECT bar, beat, bass_pitch
            FROM beats
            WHERE melid = ?
            ORDER BY onset, beatid
            """,
            (melid,),
        ).fetchall()
        beat_index = {
            (row["bar"], row["beat"]): index
            for index, row in enumerate(beats)
        }

        for interval_count, patterns in patterns_by_length.items():
            for event_index in range(len(events) - interval_count):
                intervals = tuple(
                    events[event_index + offset + 1]["pitch"]
                    - events[event_index + offset]["pitch"]
                    for offset in range(interval_count)
                )
                lick = patterns.get(intervals)
                if not lick:
                    continue
                occurrence = events[
                    event_index : event_index + interval_count + 1
                ]
                positions = []
                for event in occurrence:
                    index = beat_index.get((event["bar"], event["beat"]))
                    if index is None:
                        break
                    positions.append(
                        index + (event["tatum"] - 1) / event["division"],
                    )
                if len(positions) != len(occurrence):
                    continue

                first = occurrence[0]
                meter = int(first["num"])
                raw_start_tick = (
                    first["beat"]
                    - 1
                    + (first["tatum"] - 1) / first["division"]
                ) * TICKS_PER_BEAT
                start_tick = nearest_grid(
                    raw_start_tick,
                    START_GRID_TICKS,
                ) % (meter * TICKS_PER_BEAT)
                interval_ticks = [
                    nearest_allowed_ioi(
                        (positions[index + 1] - positions[index])
                        * TICKS_PER_BEAT,
                    )
                    for index in range(interval_count)
                ]
                active_beat = beats[
                    beat_index[(first["bar"], first["beat"])]
                ]
                bass_pitch = active_beat["bass_pitch"]
                bass_interval = (
                    (first["pitch"] - int(bass_pitch)) % 12
                    if bass_pitch is not None
                    else None
                )
                matches[lick["id"]].append(
                    {
                        "meter": meter,
                        "startTick": start_tick,
                        "intervalTicks": interval_ticks,
                        "bassInterval": bass_interval,
                    },
                )
    return matches


def build_pilot_entry(
    lick: dict[str, Any],
    observations: list[dict[str, Any]],
) -> dict[str, Any]:
    expected = int(lick["occurrenceCount"])
    if len(observations) != expected:
        raise ValueError(
            f"DTL count mismatch for {lick['id']}: "
            f"catalog={expected}, exact WJazzD matches={len(observations)}",
        )

    meter, meter_count = mode_with_count(
        observation["meter"] for observation in observations
    )
    metrical = [
        observation
        for observation in observations
        if observation["meter"] == meter
    ]
    start_tick, start_count = mode_with_count(
        observation["startTick"] for observation in metrical
    )

    interval_ticks = []
    interval_supports = []
    for index in range(len(lick["intervals"])):
        tick, count = mode_with_count(
            observation["intervalTicks"][index]
            for observation in metrical
        )
        interval_ticks.append(tick)
        interval_supports.append(count / len(metrical))

    bass_observations = [
        observation["bassInterval"]
        for observation in metrical
        if observation["bassInterval"] is not None
    ]
    bass_interval, bass_count = mode_with_count(bass_observations)

    return {
        "meter": meter,
        "startTick": start_tick,
        "intervalTicks": interval_ticks,
        "firstNoteBassInterval": bass_interval,
        "observations": len(observations),
        "meterSupport": round(meter_count / len(observations), 4),
        "placementSupport": round(start_count / len(observations), 4),
        "rhythmSupport": round(
            sum(interval_supports) / len(interval_supports),
            4,
        ),
        "bassSupport": round(bass_count / len(bass_observations), 4),
    }


def javascript_module(entries: dict[str, dict[str, Any]]) -> str:
    occurrence_count = sum(
        entry["observations"] for entry in entries.values()
    )
    lines = [
        "// Generated by scripts/generate_dtl_rhythm_pilot.py from exact",
        "// DTL interval matches and metrical WJazzD annotations.",
        "export const DTL_RHYTHM_PILOT = Object.freeze({",
        '  source: "DTL patterns × WJazzD metrical consensus",',
        f"  ticksPerBeat: {TICKS_PER_BEAT},",
        f"  startGridTicks: {START_GRID_TICKS},",
        f"  tempo: {PILOT_TEMPO},",
        f"  swingRatio: {SWING_RATIO},",
        f"  lickCount: {len(entries)},",
        f"  occurrenceCount: {occurrence_count},",
        "  licks: Object.freeze({",
    ]
    lines.extend(
        "    "
        + json.dumps(lick_id, ensure_ascii=False)
        + ": Object.freeze("
        + json.dumps(entry, ensure_ascii=False, separators=(",", ":"))
        + "),"
        for lick_id, entry in entries.items()
    )
    lines.extend(["  }),", "});", ""])
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    licks = [lick for lick in read_licks(args.licks) if is_very_typical(lick)]
    if len(licks) != 58:
        raise ValueError(f"Expected 58 very typical licks, found {len(licks)}")

    connection = sqlite3.connect(args.database)
    connection.row_factory = sqlite3.Row
    try:
        measurements = measurements_for_occurrences(connection, licks)
    finally:
        connection.close()

    entries = {
        lick["id"]: build_pilot_entry(lick, measurements[lick["id"]])
        for lick in licks
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(javascript_module(entries), encoding="utf-8")
    print(
        f"Wrote {len(entries)} synthetic DTL rhythms "
        f"({sum(entry['observations'] for entry in entries.values())} "
        f"occurrences) to {args.output}",
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, sqlite3.Error, ValueError) as error:
        print(f"DTL rhythm pilot failed: {error}")
        raise SystemExit(1) from error
