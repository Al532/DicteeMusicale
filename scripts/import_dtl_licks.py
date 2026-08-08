#!/usr/bin/env python3
"""Build the compact Dig That Lick corpus used by Lick Explorer.

The Pattern History Explorer publishes its complete occurrence table as an
RDS download.  This importer keeps DTL's patterns and occurrence counts as-is,
then uses the first occurrence still compatible with the local WJazzD export
to recover absolute pitches and human timing.  It does not mine or cluster any
new pattern.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import sys
import urllib.request
from pathlib import Path
from typing import Any


DTL_CATALOG_URL = "https://jazzomat.hfm-weimar.de/pattern_history/"
WJAZZD_MARKER = "export const WJAZZD_SOLOS = "


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import the DTL Pattern History corpus into the app.",
    )
    parser.add_argument(
        "rds",
        type=Path,
        help="pattern_stats.RDS downloaded from Pattern History Explorer",
    )
    parser.add_argument(
        "--catalog",
        default=DTL_CATALOG_URL,
        help="Pattern History Explorer URL or a saved HTML page",
    )
    parser.add_argument(
        "--wjazzd",
        type=Path,
        default=Path("data/wjazzd-solos.js"),
        help="local full WJazzD JavaScript export",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/dtl-licks.js"),
        help="generated compact JavaScript corpus",
    )
    return parser.parse_args()


def read_catalog_html(source: str) -> str:
    if re.match(r"^https?://", source):
        request = urllib.request.Request(
            source,
            headers={"User-Agent": "JazzSoloChallenge DTL importer"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8")
    return Path(source).read_text(encoding="utf-8")


def parse_catalog(source: str) -> list[dict[str, Any]]:
    page = read_catalog_html(source)
    select = re.search(
        r'<select id="pattern">(?P<body>.*?)</select>',
        page,
        flags=re.DOTALL,
    )
    if not select:
        raise ValueError("DTL pattern selector not found in catalog HTML")

    entries: list[dict[str, Any]] = []
    option_pattern = re.compile(
        r'<option value="(?P<intervals>\[[^"]+\])"[^>]*>'
        r'.*?\((?P<count>\d+)\)</option>',
        flags=re.DOTALL,
    )
    for position, match in enumerate(
        option_pattern.finditer(select.group("body")),
        start=1,
    ):
        intervals = json.loads(html.unescape(match.group("intervals")))
        entries.append(
            {
                "id": f"dtl-ph-{position:04d}",
                "intervals": intervals,
                "occurrenceCount": int(match.group("count")),
            },
        )
    if not entries:
        raise ValueError("DTL catalog contains no pattern")
    return entries


def read_occurrence_table(path: Path):
    try:
        import rdata
    except ModuleNotFoundError as error:
        raise RuntimeError(
            "The development-only 'rdata' package is required. "
            "Install scripts/requirements-dtl.txt first.",
        ) from error
    table = rdata.read_rds(path)
    required = {
        "value",
        "melid",
        "start",
        "ioiclass",
        "beat13",
        "performer",
        "log_excess_prob",
        "cross_phrase",
    }
    missing = required.difference(map(str, table.columns))
    if missing:
        raise ValueError(
            f"DTL occurrence table is missing: {', '.join(sorted(missing))}",
        )
    return table


def read_wjazzd_solos(path: Path) -> list[dict[str, Any]]:
    source = path.read_text(encoding="utf-8")
    marker_index = source.find(WJAZZD_MARKER)
    if marker_index < 0:
        raise ValueError(f"{WJAZZD_MARKER!r} not found in {path}")
    json_start = marker_index + len(WJAZZD_MARKER)
    solos, _ = json.JSONDecoder().raw_decode(source[json_start:])
    return solos


def canonical_pattern(intervals: list[int]) -> str:
    return json.dumps(intervals, separators=(",", ":"))


def optional_text(value: Any) -> str | None:
    if value is None:
        return None
    try:
        if bool(value != value):
            return None
    except (TypeError, ValueError):
        pass
    text = str(value)
    return None if text in {"", "<NA>", "NA", "nan"} else text


def occurrence_groups(table) -> dict[str, list[Any]]:
    groups: dict[str, list[Any]] = {}
    for _, row in table.iterrows():
        intervals = json.loads(str(row["value"]))
        groups.setdefault(canonical_pattern(intervals), []).append(row)
    return groups


def intervals_for_events(events: list[list[float]]) -> list[int]:
    return [
        int(events[index + 1][0] - events[index][0])
        for index in range(len(events) - 1)
    ]


def compatible_reference(
    occurrences: list[Any],
    intervals: list[int],
    solos_by_melid: dict[int, dict[str, Any]],
) -> tuple[Any, dict[str, Any], int, list[list[float]]]:
    note_count = len(intervals) + 1
    for row in occurrences:
        melid = int(row["melid"])
        start = int(row["start"])
        solo = solos_by_melid.get(melid)
        if not solo:
            continue
        events = solo["events"][start : start + note_count]
        if (
            len(events) == note_count
            and intervals_for_events(events) == intervals
        ):
            return row, solo, start, events
    raise ValueError(
        "No DTL occurrence is compatible with the local WJazzD export for "
        f"{intervals}",
    )


def rounded(value: Any) -> float | int:
    number = round(float(value), 4)
    return int(number) if math.isfinite(number) and number.is_integer() else number


def occurrence_statistics(
    occurrences: list[Any],
) -> dict[str, float | int]:
    performers = {
        performer
        for row in occurrences
        if (performer := optional_text(row["performer"]))
    }
    solo_ids = {int(row["melid"]) for row in occurrences}
    phrase_contained_count = sum(
        optional_text(row["cross_phrase"]) == "Yes"
        for row in occurrences
    )
    log_excess_probabilities = [
        float(row["log_excess_prob"])
        for row in occurrences
    ]
    reference_log_excess_probability = log_excess_probabilities[0]
    if any(
        not math.isclose(
            value,
            reference_log_excess_probability,
            rel_tol=0,
            abs_tol=1e-9,
        )
        for value in log_excess_probabilities[1:]
    ):
        raise ValueError("Inconsistent DTL log excess probability")
    return {
        "soloCount": len(solo_ids),
        "performerCount": len(performers),
        "phraseContainedRatio": rounded(
            phrase_contained_count / len(occurrences),
        ),
        "logExcessProb": rounded(reference_log_excess_probability),
    }


def build_licks(
    catalog: list[dict[str, Any]],
    table,
    solos: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    groups = occurrence_groups(table)
    solos_by_melid = {
        int(solo["id"].rsplit("-", maxsplit=1)[-1]): solo
        for solo in solos
    }
    licks = []
    for pattern in catalog:
        key = canonical_pattern(pattern["intervals"])
        occurrences = groups.get(key, [])
        if len(occurrences) != pattern["occurrenceCount"]:
            raise ValueError(
                f"DTL count mismatch for {pattern['id']}: "
                f"catalog={pattern['occurrenceCount']}, RDS={len(occurrences)}",
            )
        row, solo, event_index, events = compatible_reference(
            occurrences,
            pattern["intervals"],
            solos_by_melid,
        )
        first_onset = float(events[0][1])
        lick = {
            **pattern,
            **occurrence_statistics(occurrences),
            "notes": [int(event[0]) for event in events],
            "timings": [
                [
                    rounded(float(event[1]) - first_onset),
                    rounded(event[2]),
                ]
                for event in events
            ],
            "tempo": rounded(solo["originalTempo"]),
            "reference": {
                "soloId": solo["id"],
                "eventIndex": event_index,
            },
        }
        rhythm_class = optional_text(row["ioiclass"])
        metrical_class = optional_text(row["beat13"])
        if rhythm_class:
            lick["rhythmClass"] = rhythm_class
        if metrical_class:
            lick["metricalClass"] = metrical_class
        licks.append(lick)
    return licks


def javascript_corpus(licks: list[dict[str, Any]]) -> str:
    total_occurrences = sum(lick["occurrenceCount"] for lick in licks)
    lines = [
        "// Generated by scripts/import_dtl_licks.py from Dig That Lick's",
        "// Pattern History Explorer and the local public WJazzD export.",
        "export const DTL_LICK_CORPUS = Object.freeze({",
        '  source: "Dig That Lick — Pattern History Explorer",',
        f"  sourceUrl: {json.dumps(DTL_CATALOG_URL)},",
        '  wjazzdVersion: "Weimar Jazz Database v2.1 (DB v2.2)",',
        f"  patternCount: {len(licks)},",
        f"  occurrenceCount: {total_occurrences},",
        "  licks: Object.freeze([",
    ]
    lines.extend(
        "    "
        + json.dumps(lick, ensure_ascii=False, separators=(",", ":"))
        + ","
        for lick in licks
    )
    lines.extend(
        [
            "  ]),",
            "});",
            "",
            "const MAX_STEP_INTERVAL = 2;",
            "export const DTL_LICKS = Object.freeze(",
            "  DTL_LICK_CORPUS.licks.filter((lick) =>",
            "    lick.intervals.some(",
            "      (interval) => Math.abs(interval) > MAX_STEP_INTERVAL,",
            "    ),",
            "  ),",
            ");",
            "",
        ],
    )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    catalog = parse_catalog(args.catalog)
    table = read_occurrence_table(args.rds)
    solos = read_wjazzd_solos(args.wjazzd)
    licks = build_licks(catalog, table, solos)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(javascript_corpus(licks), encoding="utf-8")
    print(
        f"Wrote {len(licks)} DTL patterns "
        f"({sum(lick['occurrenceCount'] for lick in licks)} occurrences) "
        f"to {args.output}",
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError) as error:
        print(f"DTL import failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
