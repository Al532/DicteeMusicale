"""Generate the small browser corpus used by the app from WJazzD v1.2.

Usage:
    python scripts/generate_parker_data.py /path/to/wjazzd.db data/parker-solos.js
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path


SOURCE_PAGES = {
    42: "https://jazzomat.hfm-weimar.de/dbformat/synopsis/solo52.html",
    43: "https://jazzomat.hfm-weimar.de/dbformat/synopsis/solo55.html",
    44: "https://jazzomat.hfm-weimar.de/dbformat/synopsis/solo61.html",
    45: "https://jazzomat.hfm-weimar.de/dbformat/synopsis/solo63.html",
    46: "https://jazzomat.hfm-weimar.de/dbformat/synopsis/solo67.html",
    47: "https://jazzomat.hfm-weimar.de/dbformat/synopsis/solo68.html",
}


def build_corpus(database: Path) -> list[dict]:
    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    solos = []

    for melid, source_url in SOURCE_PAGES.items():
        info = connection.execute(
            """
            SELECT s.performer, s.title, s.avgtempo, r.recordingdate, t.solotime
            FROM solo_info s
            JOIN record_info r USING (melid)
            JOIN transcription_info t USING (melid)
            WHERE s.melid = ?
            """,
            (melid,),
        ).fetchone()
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
        phrases = connection.execute(
            """
            SELECT start, end, value
            FROM sections
            WHERE melid = ? AND type = 'PHRASE'
            ORDER BY start
            """,
            (melid,),
        ).fetchall()

        solos.append(
            {
                "id": f"wjazzd-v1.2-{melid}",
                "performer": info["performer"],
                "title": info["title"],
                "recordingDate": info["recordingdate"],
                "soloTime": info["solotime"],
                "originalTempo": info["avgtempo"],
                "dataset": "Weimar Jazz Database v1.2 (2016)",
                "sourceUrl": source_url,
                "events": [
                    [row["pitch"], row["onset"], row["duration"], row["bar"]]
                    for row in events
                ],
                "phrases": [
                    [row["start"], row["end"], row["value"]]
                    for row in phrases
                ],
            }
        )

    return solos


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Expected input database and output JavaScript path.")
    database = Path(sys.argv[1])
    output = Path(sys.argv[2])
    corpus = build_corpus(database)
    payload = json.dumps(corpus, ensure_ascii=False, separators=(",", ":"))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "// Generated from the public WJazzD v1.2 research corpus. See README.md.\n"
        f"export const PARKER_SOLOS = {payload};\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
