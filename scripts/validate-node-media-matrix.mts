#!/usr/bin/env node

import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeMediaRuntime } from '@neko/media/node';

const mediaRoot = resolve(
  process.argv[2] ?? '.tmp/vscode-test-workspaces/media-runtime/media',
);
const runtime = new NodeMediaRuntime();
const rows: Array<Record<string, unknown>> = [];

try {
  for (const name of (await readdir(mediaRoot)).sort()) {
    if (name.startsWith('.')) continue;
    const sourcePath = resolve(mediaRoot, name);
    const row: Record<string, unknown> = { name };
    try {
      const probe = await runtime.probe(sourcePath);
      row['probe'] = {
        durationSeconds: probe.durationSeconds,
        videoCodec: probe.video?.codecName,
        pixelFormat: probe.video?.pixelFormat,
        bitDepth: probe.video?.bitDepth,
        transfer: probe.video?.color.transfer,
        dimensions: probe.video ? `${probe.video.width}x${probe.video.height}` : undefined,
        audioCodecs: probe.audioStreams.map((stream) => stream.codecName),
        audioChannels: probe.audioStreams.map((stream) => stream.channels),
      };

      if (probe.video) {
        const times = sampleTimes(probe.durationSeconds);
        const frames: Array<{ readonly time: number; readonly status: 'ok' | 'failed'; readonly error?: string }> = [];
        for (const time of times) {
          try {
            await runtime.captureFrame(sourcePath, time, { width: 320, quality: 70 });
            frames.push({ time, status: 'ok' });
          } catch (error) {
            frames.push({ time, status: 'failed', error: errorMessage(error) });
          }
        }
        row['frames'] = frames;
        try {
          const prepared = await runtime.prepareVideo(sourcePath);
          row['preview'] = {
            status: 'ok',
            profile: prepared.video.preparationProfile,
            mimeType: prepared.video.mimeType,
          };
          await runtime.stop(prepared.sessionId);
        } catch (error) {
          row['preview'] = { status: 'failed', error: errorMessage(error) };
        }
      }

      if (probe.audioStreams.length > 0) {
        const pcm = await runtime.startPcm(sourcePath, {
          startTimeSeconds: 0,
          durationSeconds: Math.min(2, probe.durationSeconds),
          playbackRate: 1,
        });
        try {
          const response = await fetch(pcm.stream.streamUrl);
          const reader = response.body?.getReader();
          const first = await reader?.read();
          await reader?.cancel();
          row['pcm'] = {
            status: response.ok && first && !first.done && first.value.byteLength > 0 ? 'ok' : 'failed',
            statusCode: response.status,
            firstPacketBytes: first?.value?.byteLength ?? 0,
          };
        } finally {
          await runtime.stop(pcm.sessionId);
        }
      }
    } catch (error) {
      row['fatal'] = errorMessage(error);
    }
    rows.push(row);
  }
} finally {
  await runtime.dispose();
}

process.stdout.write(`${JSON.stringify({ mediaRoot, rows }, null, 2)}\n`);

function sampleTimes(duration: number): number[] {
  if (duration <= 0) return [0];
  return [...new Set([0, duration * 0.25, duration * 0.5, duration * 0.75, Math.max(0, duration - 1)])]
    .map((time) => Math.round(time * 1000) / 1000);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
