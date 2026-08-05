#!/usr/bin/env python3
"""Generate the synthetic eighth-note pilot for very typical DTL licks.

The generator finds every exact interval-pattern occurrence in the public
WJazzD database.  It deliberately ignores performed rhythm and microtiming.
For each lick it keeps only a compact harmonic consensus:

- whether one harmony or several is the more common context;
- a harmonic function that dominates the identifiable contexts;
- the modal melodic degree of the first note over that function;
- for a multi-harmony context, the first change and whether it falls most
  often on beat 1 or beat 3;
- the note index that first belongs to the second harmony;
- the root motion.

Patterns whose function or starting degree is ambiguous remain in the catalog.
They reuse the broader rhythmic consensus, and only receive a bass when its
root relation (and, when needed, root motion) has a strict majority among the
identifiable chord contexts.  The classified catalog stays first, ordered by
harmonic function then starting degree, so its stable display IDs remain
unchanged.

The browser then plays every lick as swung eighth notes.  A one-harmony lick
ends on beat 1; a two-harmony lick is shifted so its change note lands on the
selected beat 1 or beat 3.

Usage:
    python scripts/generate_dtl_rhythm_pilot.py /path/to/wjazzd.db
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


TICKS_PER_BEAT = 12
EIGHTH_NOTE_TICKS = TICKS_PER_BEAT // 2
PILOT_TEMPO = 156
SWING_RATIO = 1.4

MIN_OCCURRENCES = 10
MIN_PERFORMERS = 3
MIN_SOLOS = 3
MIN_PHRASE_CONTAINED_RATIO = 0.9
MIN_ADJUSTED_LOG_EXCESS_PROB = 1.35
MIN_LOG_EXCESS_PROB = 2
EXTRA_INTERVAL_PENALTY = 0.5

NATURAL_PITCH_CLASSES = {
    "C": 0,
    "D": 2,
    "E": 4,
    "F": 5,
    "G": 7,
    "A": 9,
    "B": 11,
}

DEGREE_LABELS = (
    "1",
    "b2",
    "2",
    "b3",
    "3",
    "4",
    "b5",
    "5",
    "b6",
    "6",
    "b7",
    "7",
)

FUNCTION_ORDER = {
    "I": 0,
    "Im": 1,
    "II": 2,
    "IIø": 3,
    "III": 4,
    "IV": 5,
    "IVm": 6,
    "V": 7,
    "VI": 8,
    "II–V": 9,
    "IIø–V": 10,
    "V–I": 11,
    "V–Im": 12,
    "V–V": 13,
}

MIN_FUNCTION_OBSERVATIONS = 3
MIN_FUNCTION_CONTEXT_RATIO = 0.2
MIN_FUNCTION_CLASSIFIED_RATIO = 0.55
MIN_START_DEGREE_RATIO = 0.55
MIN_PLAUSIBLE_BASS_SUPPORT = 0.5
MIN_PLAUSIBLE_ROOT_MOTION_SUPPORT = 0.5


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate the DTL synthetic eighth-note pilot.",
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


def chord_bass_pitch_class(chord: str | None) -> int | None:
    symbol = str(chord or "").strip()
    if not symbol or symbol == "NC":
        return None
    bass_symbol = symbol.split("/")[-1]
    match = re.match(r"^([A-G])([b#]?)", bass_symbol)
    if not match:
        return None
    accidental = {"b": -1, "#": 1}.get(match.group(2), 0)
    return (NATURAL_PITCH_CLASSES[match.group(1)] + accidental) % 12


def parsed_chord(
    chord: str | None,
) -> tuple[int, str] | None:
    symbol = str(chord or "").strip()
    if not symbol or symbol == "NC":
        return None
    match = re.match(
        r"^([A-G])([b#]?)(.*?)(?:/[A-G][b#]?)?$",
        symbol,
    )
    if not match:
        return None
    accidental = {"b": -1, "#": 1}.get(match.group(2), 0)
    root = (NATURAL_PITCH_CLASSES[match.group(1)] + accidental) % 12
    suffix = match.group(3)
    if "m7b5" in suffix:
        quality = "half-diminished"
    elif suffix.startswith("-"):
        quality = "minor"
    elif suffix.startswith("o"):
        quality = "diminished"
    elif suffix.startswith("+") and "7" not in suffix:
        quality = "augmented"
    elif (
        "sus" in suffix
        or suffix.startswith("7")
        or suffix.startswith("+7")
    ):
        quality = "dominant"
    elif not suffix or suffix.startswith("j") or suffix.startswith("6"):
        quality = "major"
    else:
        quality = "other"
    return root, quality


def parsed_key(key: str | None) -> tuple[int, str] | None:
    match = re.match(
        r"^([A-G])([b#]?)-(maj|min)$",
        str(key or "").strip(),
    )
    if not match:
        return None
    accidental = {"b": -1, "#": 1}.get(match.group(2), 0)
    root = (NATURAL_PITCH_CLASSES[match.group(1)] + accidental) % 12
    return root, match.group(3)


def single_harmonic_function(
    chord: tuple[int, str],
    key: tuple[int, str] | None,
) -> str | None:
    if key is None:
        return None
    root, quality = chord
    root_degree = (root - key[0]) % 12
    if root_degree == 0 and quality in {"major", "dominant"}:
        return "I"
    if root_degree == 0 and quality == "minor":
        return "Im"
    if root_degree == 2 and quality == "minor":
        return "II"
    if root_degree == 2 and quality == "half-diminished":
        return "IIø"
    if root_degree == 4 and quality == "minor":
        return "III"
    if root_degree == 5 and quality in {"major", "dominant"}:
        return "IV"
    if root_degree == 5 and quality == "minor":
        return "IVm"
    if root_degree == 7 and quality == "dominant":
        return "V"
    if root_degree == 9 and quality == "minor":
        return "VI"
    return None


def progression_harmonic_function(
    first: tuple[int, str],
    second: tuple[int, str],
) -> str | None:
    root_motion = (second[0] - first[0]) % 12
    if root_motion != 5:
        return None
    if first[1] == "minor" and second[1] == "dominant":
        return "II–V"
    if first[1] == "half-diminished" and second[1] == "dominant":
        return "IIø–V"
    if first[1] == "dominant" and second[1] == "major":
        return "V–I"
    if first[1] == "dominant" and second[1] == "minor":
        return "V–Im"
    if first[1] == "dominant" and second[1] == "dominant":
        return "V–V"
    return None


def harmonic_function(
    chords: list[str],
    key: tuple[int, str] | None,
    harmony_count: int,
) -> str | None:
    parsed = [parsed_chord(chord) for chord in chords[:harmony_count]]
    if len(parsed) < harmony_count or any(chord is None for chord in parsed):
        return None
    if harmony_count == 1:
        return single_harmonic_function(parsed[0], key)
    return progression_harmonic_function(parsed[0], parsed[1])


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
    solos = connection.execute(
        "SELECT melid, key FROM solo_info ORDER BY melid",
    ).fetchall()
    for solo in solos:
        melid = solo["melid"]
        solo_key = parsed_key(solo["key"])
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
            SELECT bar, beat, chord
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
        active_chords: list[str] = []
        chord_changes: list[dict[str, Any]] = []
        active_chord = ""
        for index, beat in enumerate(beats):
            if beat["chord"]:
                active_chord = beat["chord"]
                chord_changes.append(
                    {
                        "position": float(index),
                        "beat": int(beat["beat"]),
                        "chord": active_chord,
                    },
                )
            active_chords.append(active_chord)

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
                first_beat_index = beat_index[(first["bar"], first["beat"])]
                harmony_runs = [
                    {
                        "chord": active_chords[first_beat_index],
                        "position": positions[0],
                        "beat": int(first["beat"]),
                    },
                ]
                for change in chord_changes:
                    if change["position"] <= positions[0]:
                        continue
                    if change["position"] > positions[-1]:
                        break
                    if change["chord"] != harmony_runs[-1]["chord"]:
                        harmony_runs.append(change)

                first_chord = parsed_chord(harmony_runs[0]["chord"])
                first_root = first_chord[0] if first_chord else None
                first_bass = chord_bass_pitch_class(
                    harmony_runs[0]["chord"],
                )
                collapsed_harmony_count = 1 if len(harmony_runs) == 1 else 2
                measurement: dict[str, Any] = {
                    "meter": int(first["num"]),
                    "harmonyCount": collapsed_harmony_count,
                    "harmonicFunction": harmonic_function(
                        [run["chord"] for run in harmony_runs],
                        solo_key,
                        collapsed_harmony_count,
                    ),
                    "startDegreePitchClass": (
                        (int(first["pitch"]) - first_root) % 12
                        if first_root is not None
                        else None
                    ),
                    "firstNoteBassInterval": (
                        (int(first["pitch"]) - first_bass) % 12
                        if first_bass is not None
                        else None
                    ),
                }

                if len(harmony_runs) >= 2:
                    change = harmony_runs[1]
                    change_note_index = next(
                        index
                        for index, position in enumerate(positions)
                        if position >= change["position"]
                    )
                    second_chord = parsed_chord(change["chord"])
                    second_root = second_chord[0] if second_chord else None
                    second_bass = chord_bass_pitch_class(change["chord"])
                    measurement.update(
                        {
                            "changeBeat": int(change["beat"]),
                            "changeNoteIndex": change_note_index,
                            "rootMotion": (
                                (second_root - first_root) % 12
                                if first_root is not None
                                and second_root is not None
                                else None
                            ),
                            "bassRootMotion": (
                                (second_bass - first_bass) % 12
                                if first_bass is not None
                                and second_bass is not None
                                else None
                            ),
                        },
                    )

                matches[lick["id"]].append(measurement)
    return matches


def rounded_ratio(count: int, total: int) -> float:
    return round(count / total, 4)


def build_rhythm_entry(
    lick: dict[str, Any],
    observations: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build a profile without requiring a harmonic-function consensus."""
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
    harmony_count, harmony_count_support = mode_with_count(
        observation["harmonyCount"] for observation in metrical
    )
    harmonic = [
        observation
        for observation in metrical
        if observation["harmonyCount"] == harmony_count
    ]

    bass_observations = [
        observation["firstNoteBassInterval"]
        for observation in harmonic
        if observation.get("firstNoteBassInterval") is not None
    ]
    if bass_observations:
        bass_candidate, bass_count = mode_with_count(bass_observations)
        bass_support = rounded_ratio(bass_count, len(bass_observations))
    else:
        bass_candidate = None
        bass_support = 0
    entry: dict[str, Any] = {
        "meter": meter,
        "harmonyCount": harmony_count,
        "bassCandidateInterval": bass_candidate,
        "observations": len(observations),
        "meterSupport": rounded_ratio(meter_count, len(observations)),
        "harmonySupport": rounded_ratio(
            harmony_count_support,
            len(metrical),
        ),
        "bassSupport": bass_support,
    }

    if harmony_count == 1:
        target_note_index = len(lick["intervals"])
        entry["startTick"] = (
            -target_note_index * EIGHTH_NOTE_TICKS
        ) % (meter * TICKS_PER_BEAT)
        return entry

    strong_change_observations = [
        observation
        for observation in harmonic
        if observation.get("changeBeat") in (1, 3)
        and isinstance(observation.get("changeNoteIndex"), int)
    ]
    if not strong_change_observations:
        entry["harmonyCount"] = 1
        entry["bassCandidateInterval"] = None
        entry["bassSupport"] = 0
        target_note_index = len(lick["intervals"])
        entry["startTick"] = (
            -target_note_index * EIGHTH_NOTE_TICKS
        ) % (meter * TICKS_PER_BEAT)
        return entry
    change_beat, change_beat_count = mode_with_count(
        observation["changeBeat"]
        for observation in strong_change_observations
    )
    aligned_changes = [
        observation
        for observation in strong_change_observations
        if observation["changeBeat"] == change_beat
    ]
    change_note_index, change_note_count = mode_with_count(
        observation["changeNoteIndex"]
        for observation in aligned_changes
    )
    root_motion_observations = [
        observation["bassRootMotion"]
        for observation in harmonic
        if observation.get("bassRootMotion") is not None
    ]
    if root_motion_observations:
        root_motion, root_motion_count = mode_with_count(
            root_motion_observations,
        )
        root_motion_support = rounded_ratio(
            root_motion_count,
            len(root_motion_observations),
        )
    else:
        root_motion = None
        root_motion_support = 0
    target_tick = (change_beat - 1) * TICKS_PER_BEAT
    entry.update(
        {
            "startTick": (
                target_tick - change_note_index * EIGHTH_NOTE_TICKS
            ) % (meter * TICKS_PER_BEAT),
            "changeNoteIndex": change_note_index,
            "changeBeat": change_beat,
            "rootMotion": root_motion,
            "changeBeatSupport": rounded_ratio(
                change_beat_count,
                len(harmonic),
            ),
            "changeNoteSupport": rounded_ratio(
                change_note_count,
                len(aligned_changes),
            ),
            "rootMotionSupport": root_motion_support,
        },
    )
    return entry


def dominant_function(
    observations: list[dict[str, Any]],
) -> tuple[str, int, int] | None:
    counts = Counter(
        observation["harmonicFunction"]
        for observation in observations
        if observation.get("harmonicFunction") in FUNCTION_ORDER
    )
    if not counts:
        return None
    function = min(
        counts,
        key=lambda value: (-counts[value], FUNCTION_ORDER[value]),
    )
    return function, counts[function], sum(counts.values())


def build_classified_entry(
    lick: dict[str, Any],
    observations: list[dict[str, Any]],
) -> dict[str, Any] | None:
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
    harmony_count, harmony_count_support = mode_with_count(
        1 if observation["harmonyCount"] <= 1 else 2
        for observation in metrical
    )
    harmonic = [
        observation
        for observation in metrical
        if observation["harmonyCount"] == harmony_count
    ]

    function_consensus = dominant_function(harmonic)
    if function_consensus is None:
        return None
    function, function_count, classified_count = function_consensus
    if (
        function_count < MIN_FUNCTION_OBSERVATIONS
        or function_count / len(harmonic) < MIN_FUNCTION_CONTEXT_RATIO
        or function_count / classified_count
        < MIN_FUNCTION_CLASSIFIED_RATIO
    ):
        return None

    function_observations = [
        observation
        for observation in harmonic
        if observation.get("harmonicFunction") == function
    ]
    start_degree_observations = [
        observation["startDegreePitchClass"]
        for observation in function_observations
        if observation.get("startDegreePitchClass") is not None
    ]
    if not start_degree_observations:
        return None
    start_degree, start_degree_count = mode_with_count(
        start_degree_observations,
    )
    if (
        start_degree_count / len(start_degree_observations)
        < MIN_START_DEGREE_RATIO
    ):
        return None

    entry: dict[str, Any] = {
        "meter": meter,
        "harmonyCount": harmony_count,
        "harmonicFunction": function,
        "startDegree": DEGREE_LABELS[start_degree],
        "startDegreePitchClass": start_degree,
        "observations": len(observations),
        "meterSupport": rounded_ratio(meter_count, len(observations)),
        "harmonySupport": rounded_ratio(
            harmony_count_support,
            len(metrical),
        ),
        "functionObservations": function_count,
        "functionContextSupport": rounded_ratio(
            function_count,
            len(harmonic),
        ),
        "functionClassifiedSupport": rounded_ratio(
            function_count,
            classified_count,
        ),
        "startDegreeSupport": rounded_ratio(
            start_degree_count,
            len(start_degree_observations),
        ),
    }

    if harmony_count == 1:
        target_note_index = len(lick["intervals"])
        entry["startTick"] = (
            -target_note_index * EIGHTH_NOTE_TICKS
        ) % (meter * TICKS_PER_BEAT)
        return entry

    strong_change_observations = [
        observation
        for observation in function_observations
        if observation.get("changeBeat") in (1, 3)
    ]
    if not strong_change_observations:
        return None
    change_beat, change_beat_count = mode_with_count(
        observation["changeBeat"]
        for observation in strong_change_observations
    )
    aligned_changes = [
        observation
        for observation in strong_change_observations
        if observation["changeBeat"] == change_beat
    ]
    change_note_index, change_note_count = mode_with_count(
        observation["changeNoteIndex"]
        for observation in aligned_changes
    )
    root_motion_observations = [
        observation["rootMotion"]
        for observation in function_observations
        if observation.get("rootMotion") is not None
    ]
    if not root_motion_observations:
        return None
    root_motion, root_motion_count = mode_with_count(
        root_motion_observations,
    )
    target_tick = (change_beat - 1) * TICKS_PER_BEAT
    entry.update(
        {
            "startTick": (
                target_tick - change_note_index * EIGHTH_NOTE_TICKS
            ) % (meter * TICKS_PER_BEAT),
            "changeNoteIndex": change_note_index,
            "changeBeat": change_beat,
            "rootMotion": root_motion,
            "changeBeatSupport": rounded_ratio(
                change_beat_count,
                len(function_observations),
            ),
            "changeNoteSupport": rounded_ratio(
                change_note_count,
                len(aligned_changes),
            ),
            "rootMotionSupport": rounded_ratio(
                root_motion_count,
                len(root_motion_observations),
            ),
        },
    )
    return entry


def javascript_module(
    entries: dict[str, dict[str, Any]],
    analyzed_lick_count: int,
    analyzed_occurrence_count: int,
) -> str:
    selected_occurrence_count = sum(
        entry["observations"] for entry in entries.values()
    )
    single_harmony_count = sum(
        entry["harmonyCount"] == 1 for entry in entries.values()
    )
    classified_lick_count = sum(
        entry["harmonicClassification"] == "classified"
        for entry in entries.values()
    )
    bass_lick_count = sum(
        "bassInterval" in entry for entry in entries.values()
    )
    lines = [
        "// Generated by scripts/generate_dtl_rhythm_pilot.py from exact",
        "// DTL interval matches and WJazzD chord annotations.",
        "export const DTL_RHYTHM_PILOT = Object.freeze({",
        '  source: "Very typical DTL patterns × WJazzD rhythm and harmonic consensus",',
        f"  ticksPerBeat: {TICKS_PER_BEAT},",
        f"  eighthNoteTicks: {EIGHTH_NOTE_TICKS},",
        f"  tempo: {PILOT_TEMPO},",
        f"  swingRatio: {SWING_RATIO},",
        f"  analyzedLickCount: {analyzed_lick_count},",
        f"  analyzedOccurrenceCount: {analyzed_occurrence_count},",
        f"  lickCount: {len(entries)},",
        f"  occurrenceCount: {selected_occurrence_count},",
        f"  classifiedLickCount: {classified_lick_count},",
        f"  ambiguousLickCount: {len(entries) - classified_lick_count},",
        f"  bassLickCount: {bass_lick_count},",
        f"  basslessLickCount: {len(entries) - bass_lick_count},",
        f"  singleHarmonyCount: {single_harmony_count},",
        f"  twoHarmonyCount: {len(entries) - single_harmony_count},",
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

    classified_entries = []
    ambiguous_entries = []
    for lick in licks:
        observations = measurements[lick["id"]]
        rhythm_entry = build_rhythm_entry(lick, observations)
        classified_entry = build_classified_entry(lick, observations)
        if classified_entry is not None:
            classified_entry["harmonicClassification"] = "classified"
            classified_entry["bassInterval"] = classified_entry[
                "startDegreePitchClass"
            ]
            classified_entry["bassSupport"] = classified_entry[
                "startDegreeSupport"
            ]
            classified_entries.append((lick, classified_entry))
            continue

        rhythm_entry["harmonicClassification"] = "ambiguous"
        bass_candidate = rhythm_entry.pop("bassCandidateInterval")
        has_stable_root_motion = (
            rhythm_entry["harmonyCount"] == 1
            or rhythm_entry.get("rootMotionSupport", 0)
            > MIN_PLAUSIBLE_ROOT_MOTION_SUPPORT
        )
        if (
            rhythm_entry["bassSupport"] > MIN_PLAUSIBLE_BASS_SUPPORT
            and has_stable_root_motion
        ):
            rhythm_entry["bassInterval"] = bass_candidate
        ambiguous_entries.append((lick, rhythm_entry))

    classified_entries.sort(
        key=lambda item: (
            FUNCTION_ORDER[item[1]["harmonicFunction"]],
            item[1]["startDegreePitchClass"],
            item[0]["id"],
        ),
    )
    ambiguous_entries.sort(key=lambda item: item[0]["id"])
    generated_entries = classified_entries + ambiguous_entries
    entries: dict[str, dict[str, Any]] = {}
    for index, (lick, entry) in enumerate(generated_entries, start=1):
        entry["patternId"] = f"P{index:02d}"
        entries[lick["id"]] = entry

    analyzed_occurrence_count = sum(
        len(measurements[lick["id"]]) for lick in licks
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        javascript_module(
            entries,
            analyzed_lick_count=len(licks),
            analyzed_occurrence_count=analyzed_occurrence_count,
        ),
        encoding="utf-8",
    )
    print(
        f"Wrote {len(entries)} DTL rhythm profiles "
        f"({len(classified_entries)} classified, "
        f"{len(ambiguous_entries)} ambiguous) after analyzing "
        f"{analyzed_occurrence_count} occurrences; "
        f"output: {args.output}",
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, sqlite3.Error, ValueError) as error:
        print(f"DTL rhythm pilot failed: {error}")
        raise SystemExit(1) from error
