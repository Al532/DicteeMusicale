"""Generate the browser corpus used by the app from WJazzD v2.1.

Usage:
    python scripts/generate_wjazzd_data.py /path/to/wjazzd.db data/wjazzd-solos.js
"""

from __future__ import annotations

import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path


DATASET_LABEL = "Weimar Jazz Database v2.1 (DB v2.2)"
SOURCE_ROOT = "https://jazzomat.hfm-weimar.de/dbformat/synopsis"

DEFAULT_PERFORMERS = [
    "Louis Armstrong",
    "Coleman Hawkins",
    "Lester Young",
    "Charlie Parker",
    "Dizzy Gillespie",
    "Miles Davis",
    "Clifford Brown",
    "Chet Baker",
    "Sonny Rollins",
    "John Coltrane",
    "Cannonball Adderley",
    "Dexter Gordon",
    "Stan Getz",
]

def build_corpus(database: Path) -> tuple[list[dict], list[dict], dict[str, list]]:
    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    solos = []
    chords_by_solo = {}

    solo_rows = connection.execute(
        """
        SELECT s.melid, s.performer, s.title, s.avgtempo,
               tr.recordingdate, ti.solotime
        FROM solo_info s
        JOIN track_info tr USING (trackid)
        JOIN transcription_info ti USING (melid)
        ORDER BY s.performer, s.melid
        """
    ).fetchall()

    for info in solo_rows:
        melid = info["melid"]
        events = connection.execute(
            """
            SELECT CAST(ROUND(pitch) AS INTEGER) AS pitch,
                   ROUND(onset, 4) AS onset,
                   ROUND(duration, 4) AS duration,
                   bar
            FROM melody
            WHERE melid = ?
            ORDER BY onset, eventid
            """,
            (melid,),
        ).fetchall()
        beats = connection.execute(
            """
            SELECT ROUND(onset, 4) AS onset, beat, chord
            FROM beats
            WHERE melid = ?
            ORDER BY onset, beatid
            """,
            (melid,),
        ).fetchall()
        phrases = connection.execute(
            """
            SELECT start, end, value
            FROM sections
            WHERE melid = ? AND type = 'PHRASE'
            ORDER BY start
            """,
            (melid,),
        ).fetchall()
        solo = {
            "id": f"wjazzd-v2.1-{melid}",
            "performer": info["performer"],
            "title": info["title"],
            "recordingDate": info["recordingdate"],
            "soloTime": info["solotime"],
            "originalTempo": info["avgtempo"],
            "dataset": DATASET_LABEL,
            "sourceUrl": f"{SOURCE_ROOT}/solo{melid}.html",
            "events": [
                [row["pitch"], row["onset"], row["duration"], row["bar"]]
                for row in events
            ],
            "beats": [
                [row["onset"], row["beat"]]
                for row in beats
                if row["beat"] is not None
            ],
            "phrases": [
                [row["start"], row["end"], row["value"]]
                for row in phrases
            ],
        }
        chords_by_solo[solo["id"]] = [
            [row["onset"], row["chord"].strip()]
            for row in beats
            if row["chord"] and row["chord"].strip()
        ]
        solos.append(solo)

    counts = Counter(solo["performer"] for solo in solos)
    performers = [
        {"name": name, "soloCount": count}
        for name, count in sorted(
            counts.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]
    connection.close()
    return solos, performers, chords_by_solo


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Expected input database and output JavaScript path.")
    database = Path(sys.argv[1])
    output = Path(sys.argv[2])
    solos, performers, chords_by_solo = build_corpus(database)
    chords_output = output.with_name("wjazzd-chords.js")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "// Generated from the public WJazzD v2.1 research corpus. See README.md.\n"
        f"export const WJAZZD_SOLOS = {json.dumps(solos, ensure_ascii=False, separators=(',', ':'))};\n"
        f"export const WJAZZD_PERFORMERS = {json.dumps(performers, ensure_ascii=False, separators=(',', ':'))};\n"
        f"export const DEFAULT_PERFORMERS = {json.dumps(DEFAULT_PERFORMERS, ensure_ascii=False, separators=(',', ':'))};\n",
        encoding="utf-8",
    )
    chords_output.write_text(
        "// Generated from the public WJazzD v2.1 research corpus. See README.md.\n"
        f"export const WJAZZD_CHORDS = {json.dumps(chords_by_solo, ensure_ascii=False, separators=(',', ':'))};\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
