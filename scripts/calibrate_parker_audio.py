"""Estimate the time offset between WJazzD events and matching full-track audio.

The score is based on spectral energy at the transcribed pitches. It is intended
as a calibration helper; final offsets should still be checked by ear.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import stft


SAMPLE_RATE = 16_000
FFT_SIZE = 2048
HOP_SIZE = 128
MIDI_MIN = 45
MIDI_MAX = 96


def load_corpus(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    payload = text.split("export const PARKER_SOLOS = ", 1)[1].rsplit(";", 1)[0]
    return json.loads(payload)


def decode_audio(path: Path) -> np.ndarray:
    result = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-f",
            "f32le",
            "-ac",
            "1",
            "-ar",
            str(SAMPLE_RATE),
            "-",
        ],
        check=True,
        capture_output=True,
    )
    return np.frombuffer(result.stdout, dtype="<f4")


def pitch_features(audio: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    _, times, spectrum = stft(
        audio,
        fs=SAMPLE_RATE,
        window="hann",
        nperseg=FFT_SIZE,
        noverlap=FFT_SIZE - HOP_SIZE,
        boundary=None,
        padded=False,
    )
    magnitude = np.abs(spectrum)
    features = []
    for midi in range(MIDI_MIN, MIDI_MAX + 1):
        fundamental = 440 * 2 ** ((midi - 69) / 12)
        energy = np.zeros(magnitude.shape[1], dtype=np.float32)
        for harmonic, weight in ((1, 1.0), (2, 0.55), (3, 0.35), (4, 0.2)):
            frequency = fundamental * harmonic
            if frequency >= SAMPLE_RATE / 2:
                continue
            center = int(round(frequency * FFT_SIZE / SAMPLE_RATE))
            lo = max(0, center - 1)
            hi = min(magnitude.shape[0], center + 2)
            energy += weight * magnitude[lo:hi].mean(axis=0)
        features.append(np.log1p(energy * 30))
    matrix = np.asarray(features)
    mean = matrix.mean(axis=0, keepdims=True)
    deviation = matrix.std(axis=0, keepdims=True) + 1e-6
    return times, (matrix - mean) / deviation


def event_samples(events: list[list[float]]) -> list[tuple[float, int, float]]:
    samples = []
    for midi, onset, duration, _bar in events:
        if duration < 0.045 or not MIDI_MIN <= midi <= MIDI_MAX:
            continue
        weight = min(1.0, 0.25 + duration * 2)
        samples.append((onset + min(duration * 0.45, 0.09), midi, weight))
        if duration >= 0.18:
            samples.append((onset + duration * 0.7, midi, weight * 0.6))
    return samples


def score_offset(
    offset: float,
    samples: list[tuple[float, int, float]],
    frame_times: np.ndarray,
    features: np.ndarray,
) -> float:
    score = 0.0
    total_weight = 0.0
    for event_time, midi, weight in samples:
        absolute_time = event_time + offset
        frame = int(round(absolute_time * SAMPLE_RATE / HOP_SIZE))
        if frame < 0 or frame >= features.shape[1]:
            continue
        pitch_index = midi - MIDI_MIN
        pitch_score = features[pitch_index, frame]
        neighbor_indices = [
            index
            for index in (pitch_index - 2, pitch_index - 1, pitch_index + 1, pitch_index + 2)
            if 0 <= index < features.shape[0]
        ]
        neighbor_score = features[neighbor_indices, frame].mean()
        score += weight * (pitch_score - 0.22 * neighbor_score)
        total_weight += weight
    return score / max(total_weight, 1e-9)


def calibrate(solo: dict, audio_path: Path) -> list[tuple[float, float]]:
    audio = decode_audio(audio_path)
    frame_times, features = pitch_features(audio)
    samples = event_samples(solo["events"])
    latest_event = max(event[1] + event[2] for event in solo["events"])
    max_offset = max(0.0, len(audio) / SAMPLE_RATE - latest_event)
    coarse_offsets = np.arange(0, max_offset + 0.001, 0.04)
    coarse_scores = [
        score_offset(offset, samples, frame_times, features)
        for offset in coarse_offsets
    ]
    best_coarse = coarse_offsets[int(np.argmax(coarse_scores))]
    fine_offsets = np.arange(
        max(0, best_coarse - 0.15),
        min(max_offset, best_coarse + 0.15) + 0.001,
        HOP_SIZE / SAMPLE_RATE,
    )
    results = [
        (offset, score_offset(offset, samples, frame_times, features))
        for offset in fine_offsets
    ]
    return sorted(results, key=lambda item: item[1], reverse=True)[:8]


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    corpus = load_corpus(root / "data/parker-solos.js")
    audio_paths = {
        "Billie's Bounce": root / "audio/parker/billies-bounce.mp3",
        "Donna Lee": root / "audio/parker/donna-lee.mp3",
        "Ornithology": root / "audio/parker/ornithology.mp3",
        "Scrapple From The Apple": root / "audio/parker/scrapple-from-the-apple.mp3",
        "Thriving On A Riff": root / "audio/parker/thriving-on-a-riff.mp3",
        "Yardbird Suite": root / "audio/parker/yardbird-suite.mp3",
    }
    selected = set(sys.argv[1:])
    for solo in corpus:
        if selected and solo["title"] not in selected:
            continue
        print(solo["title"])
        for offset, score in calibrate(solo, audio_paths[solo["title"]]):
            print(f"  {offset:8.3f}s  score={score:.5f}")


if __name__ == "__main__":
    main()
