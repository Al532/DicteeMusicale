export function granularPitchShift(samples, ratio, grainSize = 4096, hopSize = 1024) {
  if (!(samples instanceof Float32Array)) {
    throw new TypeError("Les échantillons doivent être un Float32Array.");
  }
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new RangeError("Le ratio de transposition doit être positif.");
  }
  if (Math.abs(ratio - 1) < 1e-9) return new Float32Array(samples);

  const output = new Float32Array(samples.length);
  const weights = new Float32Array(samples.length);
  const halfGrain = Math.floor(grainSize / 2);

  for (let center = 0; center < samples.length + halfGrain; center += hopSize) {
    for (let index = 0; index < grainSize; index += 1) {
      const outputIndex = center - halfGrain + index;
      if (outputIndex < 0 || outputIndex >= samples.length) continue;
      const sourcePosition = center + (index - halfGrain) * ratio;
      const sourceIndex = Math.floor(sourcePosition);
      if (sourceIndex < 0 || sourceIndex + 1 >= samples.length) continue;

      const fraction = sourcePosition - sourceIndex;
      const sample =
        samples[sourceIndex] * (1 - fraction) +
        samples[sourceIndex + 1] * fraction;
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (grainSize - 1));
      output[outputIndex] += sample * window;
      weights[outputIndex] += window;
    }
  }

  for (let index = 0; index < output.length; index += 1) {
    if (weights[index] > 1e-6) output[index] /= weights[index];
  }
  return output;
}

export function sliceAudioBuffer(context, input, startSeconds, endSeconds) {
  const startFrame = Math.max(0, Math.floor(startSeconds * input.sampleRate));
  const endFrame = Math.min(
    input.length,
    Math.ceil(endSeconds * input.sampleRate),
  );
  const length = Math.max(1, endFrame - startFrame);
  const output = context.createBuffer(
    input.numberOfChannels,
    length,
    input.sampleRate,
  );

  for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
    output.copyToChannel(
      input.getChannelData(channel).subarray(startFrame, endFrame),
      channel,
    );
  }
  return output;
}

export function pitchShiftAudioBuffer(context, input, semitones) {
  if (!semitones) return input;
  const ratio = 2 ** (semitones / 12);
  const output = context.createBuffer(
    input.numberOfChannels,
    input.length,
    input.sampleRate,
  );
  const grainSize = Math.max(1024, 2 ** Math.round(Math.log2(input.sampleRate * 0.09)));
  const hopSize = Math.floor(grainSize / 4);

  for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
    output.copyToChannel(
      granularPitchShift(
        input.getChannelData(channel),
        ratio,
        grainSize,
        hopSize,
      ),
      channel,
    );
  }
  return output;
}
