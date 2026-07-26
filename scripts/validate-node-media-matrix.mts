#!/usr/bin/env node

import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeMediaRuntime } from '@neko/media/node';

const arguments_ = process.argv.slice(2);
const includeWebm = arguments_.includes('--include-webm');
const mediaRoot = resolve(
  arguments_.find((argument) => !argument.startsWith('--')) ??
    '.tmp/vscode-test-workspaces/media-runtime/media',
);
const runtime = new NodeMediaRuntime();
const rows: Array<Record<string, unknown>> = [];
const skipped: string[] = [];

try {
  for (const name of (await readdir(mediaRoot)).sort()) {
    if (name.startsWith('.')) continue;
    if (!includeWebm && name.toLowerCase().endsWith('.webm')) {
      skipped.push(name);
      continue;
    }
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
        row['frames'] = (
          await runtime.captureFrames(sourcePath, times, { width: 320, quality: 70 })
        ).map((frame) =>
          frame.status === 'ok'
            ? { time: frame.timeSeconds, status: frame.status }
            : {
                time: frame.timeSeconds,
                status: frame.status,
                scope: frame.scope,
                error: frame.message,
              },
        );
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
            status:
              response.ok && first && !first.done && first.value.byteLength > 0 ? 'ok' : 'failed',
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

process.stdout.write(
  `${JSON.stringify(
    {
      mediaRoot,
      rows,
      skipped,
      policy: includeWebm ? 'include-webm' : 'prefer-vscode-playback-formats',
    },
    null,
    2,
  )}\n`,
);

function sampleTimes(duration: number): number[] {
  if (duration <= 0) return [0];
  return [
    ...new Set([0, duration * 0.25, duration * 0.5, duration * 0.75, Math.max(0, duration - 1)]),
  ].map((time) => Math.round(time * 1000) / 1000);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
