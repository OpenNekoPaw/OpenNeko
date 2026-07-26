#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const MEDIA_FIXTURE_RELATIVE_ROOT = '.tmp/vscode-test-workspaces/media-runtime';

const repositoryRoot = resolve(import.meta.dirname, '..');
const fixtureRoot = resolve(repositoryRoot, MEDIA_FIXTURE_RELATIVE_ROOT);
const mediaRoot = join(fixtureRoot, 'media');
const projectRoot = join(fixtureRoot, 'projects');
const ffmpegPath = process.env.NEKO_FFMPEG_PATH || 'ffmpeg';

assertSafeFixtureRoot(fixtureRoot);
rmSync(fixtureRoot, { recursive: true, force: true });
mkdirSync(mediaRoot, { recursive: true });
mkdirSync(projectRoot, { recursive: true });

writeJson(join(fixtureRoot, '.openneko-fixture.json'), {
  schemaVersion: 1,
  kind: 'openneko-vscode-media-runtime',
  synthetic: true,
  repositoryRelativeRoot: MEDIA_FIXTURE_RELATIVE_ROOT,
});

runFfmpeg([
  '-f',
  'lavfi',
  '-i',
  'testsrc2=size=640x360:rate=30:duration=6',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=48000:duration=6',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-preset',
  'veryfast',
  '-c:a',
  'aac',
  '-b:a',
  '128k',
  '-movflags',
  '+faststart',
  '-shortest',
  join(mediaRoot, 'h264-aac.mp4'),
]);

runFfmpeg([
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=880:sample_rate=48000:duration=6',
  '-c:a',
  'pcm_s16le',
  join(mediaRoot, 'audio.wav'),
]);

writeJson(join(projectRoot, 'h264-pcm.otio'), createCutFixture());
writeJson(join(projectRoot, 'canvas-media.nkc'), createCanvasFixture());
writeFileSync(
  join(fixtureRoot, 'README.md'),
  [
    '# OpenNeko VS Code media fixture',
    '',
    'This directory is generated, isolated, synthetic, and disposable.',
    'It must not contain user workspace files or credentials.',
    '',
  ].join('\n'),
  'utf8',
);

process.stdout.write(`${fixtureRoot}\n`);

function createCutFixture() {
  return {
    OTIO_SCHEMA: 'Timeline.1',
    name: 'Synthetic H.264 + PCM',
    global_start_time: null,
    metadata: {
      openneko: {
        cut: {
          profile: 'vscode-fixture',
          editRateNumerator: 30,
          editRateDenominator: 1,
          width: 640,
          height: 360,
        },
      },
    },
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'Tracks',
      metadata: {},
      effects: [],
      markers: [],
      children: [
        createTrack('Video', 'Video 1', 'fixture-video-track', [
          createClip('H.264 fixture', '../media/h264-aac.mp4', 'fixture-video-clip'),
        ]),
        createTrack('Audio', 'Audio 1', 'fixture-audio-track', [
          createClip('PCM fixture', '../media/audio.wav', 'fixture-audio-clip'),
        ]),
        createTrack('Subtitle', 'Subtitle 1', 'fixture-subtitle-track', []),
      ],
    },
  };
}

function createCanvasFixture() {
  return {
    version: '2.1',
    name: 'Synthetic Canvas Media',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [
      {
        id: 'fixture-video-node',
        type: 'media',
        preset: 'media.basic',
        position: { x: 80, y: 80 },
        size: { width: 480, height: 320 },
        zIndex: 1,
        data: {
          assetPath: '${WORKSPACE}/media/h264-aac.mp4',
          mediaType: 'video',
          name: 'H.264 + AAC fixture',
        },
      },
      {
        id: 'fixture-audio-node',
        type: 'media',
        preset: 'media.basic',
        position: { x: 620, y: 80 },
        size: { width: 420, height: 220 },
        zIndex: 2,
        data: {
          assetPath: '${WORKSPACE}/media/audio.wav',
          mediaType: 'audio',
          name: 'PCM fixture',
        },
      },
    ],
    connections: [],
  };
}

function createTrack(kind, name, trackId, children) {
  return {
    OTIO_SCHEMA: 'Track.1',
    name,
    kind,
    children,
    metadata: { openneko: { cut: { trackId } } },
    enabled: true,
    effects: [],
    markers: [],
  };
}

function createClip(name, targetUrl, clipId) {
  return {
    OTIO_SCHEMA: 'Clip.2',
    name,
    media_reference: {
      OTIO_SCHEMA: 'ExternalReference.1',
      target_url: targetUrl,
      metadata: {},
    },
    source_range: {
      OTIO_SCHEMA: 'TimeRange.1',
      start_time: { OTIO_SCHEMA: 'RationalTime.1', value: 0, rate: 30 },
      duration: { OTIO_SCHEMA: 'RationalTime.1', value: 180, rate: 30 },
    },
    metadata: { openneko: { cut: { clipId } } },
    enabled: true,
    effects: [],
    markers: [],
  };
}

function runFfmpeg(args) {
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    encoding: 'utf8',
  });
  if (result.error) {
    throw new Error(`Unable to run FFmpeg at ${ffmpegPath}.`, { cause: result.error });
  }
  if (result.status !== 0) {
    throw new Error(
      `FFmpeg fixture generation failed (${result.status}): ${result.stderr.trim() || '<no stderr>'}`,
    );
  }
}

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function assertSafeFixtureRoot(candidate) {
  const expectedParent = resolve(repositoryRoot, '.tmp', 'vscode-test-workspaces');
  if (dirname(candidate) !== expectedParent || candidate === expectedParent) {
    throw new Error(`Refusing to replace unsafe fixture directory: ${candidate}`);
  }
}
