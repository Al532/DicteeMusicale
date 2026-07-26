import test from "node:test";
import assert from "node:assert/strict";

import { granularPitchShift } from "../src/audio.js";

function risingZeroCrossingFrequency(samples, sampleRate, start, end) {
  let crossings = 0;
  for (let index = start + 1; index < end; index += 1) {
    if (samples[index - 1] <= 0 && samples[index] > 0) crossings += 1;
  }
  return crossings / ((end - start) / sampleRate);
}

test("le pitch-shifter conserve exactement la durée", () => {
  const samples = Float32Array.from(
    { length: 8000 },
    (_, index) => Math.sin((2 * Math.PI * 220 * index) / 8000),
  );
  for (const ratio of [2 ** (-6 / 12), 1, 2 ** (6 / 12)]) {
    assert.equal(granularPitchShift(samples, ratio, 1024, 256).length, samples.length);
  }
});

test("le pitch-shifter transpose sans accélérer le signal", () => {
  const sampleRate = 8000;
  const frequency = 220;
  const samples = Float32Array.from(
    { length: sampleRate * 2 },
    (_, index) => Math.sin((2 * Math.PI * frequency * index) / sampleRate),
  );
  const shifted = granularPitchShift(samples, 2, 1024, 256);
  const measured = risingZeroCrossingFrequency(
    shifted,
    sampleRate,
    sampleRate / 4,
    shifted.length - sampleRate / 4,
  );

  assert.ok(measured > 425 && measured < 455);
  assert.equal(shifted.length, samples.length);
});
