#!/usr/bin/env node

import { resolve } from 'node:path';
import { NodeMediaRuntime } from '@neko/media/node';

const sourceArgument = process.argv[2];
if (!sourceArgument) {
  throw new Error('Usage: pnpm validate:media-waveform <source> [peaks-per-second]');
}
const peaksPerSecond = Number(process.argv[3] ?? 100);
if (!Number.isFinite(peaksPerSecond) || peaksPerSecond <= 0) {
  throw new Error('Waveform peaks per second must be positive.');
}

const sourcePath = resolve(sourceArgument);
const runtime = new NodeMediaRuntime();
const startedAt = performance.now();
const baseline = process.memoryUsage();
let peak = baseline;
const sampler = setInterval(() => {
  const current = process.memoryUsage();
  peak = {
    rss: Math.max(peak.rss, current.rss),
    heapTotal: Math.max(peak.heapTotal, current.heapTotal),
    heapUsed: Math.max(peak.heapUsed, current.heapUsed),
    external: Math.max(peak.external, current.external),
    arrayBuffers: Math.max(peak.arrayBuffers, current.arrayBuffers),
  };
}, 10);

try {
  const waveform = await runtime.generateWaveform(sourcePath, { peaksPerSecond });
  const completed = process.memoryUsage();
  peak = {
    rss: Math.max(peak.rss, completed.rss),
    heapTotal: Math.max(peak.heapTotal, completed.heapTotal),
    heapUsed: Math.max(peak.heapUsed, completed.heapUsed),
    external: Math.max(peak.external, completed.external),
    arrayBuffers: Math.max(peak.arrayBuffers, completed.arrayBuffers),
  };
  process.stdout.write(
    `${JSON.stringify(
      {
        sourcePath,
        peaksPerSecond,
        peakCount: waveform.peaks.length,
        durationSeconds: waveform.durationSeconds,
        partial: waveform.partial,
        elapsedMilliseconds: Math.round(performance.now() - startedAt),
        nodeMemoryBytes: {
          baseline,
          peak,
          completed,
          peakRssIncrease: peak.rss - baseline.rss,
          peakArrayBufferIncrease: peak.arrayBuffers - baseline.arrayBuffers,
        },
      },
      null,
      2,
    )}\n`,
  );
} finally {
  clearInterval(sampler);
  await runtime.dispose();
}
