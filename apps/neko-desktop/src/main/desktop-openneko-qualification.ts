import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { promisify } from 'node:util';
import { app, BrowserWindow, session } from 'electron';
import {
  registerDesktopOpenNekoProtocol,
  registerDesktopOpenNekoScheme,
} from './desktop-openneko-protocol';
import {
  DesktopResourceRegistry,
  registerDesktopResourceRequestAuthorization,
  type DesktopResourceOwner,
} from './desktop-resource-registry';
import { DESKTOP_APP_ORIGIN, createDesktopWebPreferences } from './security';

const execFileAsync = promisify(execFile);
const QUALIFICATION_ROOT_ENVIRONMENT = 'OPENNEKO_MEDIA_QUALIFICATION_ROOT';
const QUALIFICATION_REPORT_ENVIRONMENT = 'OPENNEKO_MEDIA_QUALIFICATION_REPORT';
const QUALIFICATION_ROOT_PREFIX = 'openneko-media-qualification-';

interface QualificationResources {
  readonly videoUrl: string;
  readonly videoSha256: string;
  readonly audioUrl: string;
  readonly imageUrl: string;
  readonly pdfUrl: string;
  readonly glbUrl: string;
  readonly gltfUrl: string;
}

interface RendererQualificationResult {
  readonly video: {
    readonly duration: number;
    readonly advancedTo: number;
    readonly seekedTo: number;
    readonly firstCanvasHash: number;
    readonly secondCanvasHash: number;
    readonly firstTextureHash: number;
    readonly secondTextureHash: number;
  };
  readonly audio: {
    readonly duration: number;
    readonly advancedTo: number;
    readonly seekedTo: number;
  };
  readonly range: {
    readonly status: number;
    readonly contentRange: string | null;
    readonly acceptRanges: string | null;
    readonly bytes: number;
  };
  readonly videoSha256: string;
  readonly imagePixel: readonly number[];
  readonly pdfHeader: string;
  readonly glbHeader: string;
  readonly gltfDependency: string;
}

registerDesktopOpenNekoScheme();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

void runQualification().catch(async (error: unknown) => {
  await writeQualificationReport({
    status: 'failed',
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
  });
  process.stderr.write(
    `OpenNeko media qualification failed: ${
      error instanceof Error ? (error.stack ?? error.message) : String(error)
    }\n`,
  );
  app.exit(1);
});

async function runQualification(): Promise<void> {
  const qualificationRoot = requireQualificationRoot();
  const rendererRoot = path.join(qualificationRoot, 'renderer');
  const fixtureRoot = path.join(qualificationRoot, 'fixtures');
  await Promise.all([
    mkdir(rendererRoot, { recursive: true }),
    mkdir(fixtureRoot, { recursive: true }),
  ]);
  await writeFile(
    path.join(rendererRoot, 'index.html'),
    '<!doctype html><html><body><main id="qualification"></main></body></html>',
  );
  const fixtures = await createFixtures(fixtureRoot);

  await app.whenReady();
  const registry = new DesktopResourceRegistry({ allowedOrigins: [DESKTOP_APP_ORIGIN] });
  const disposeAuthorization = registerDesktopResourceRequestAuthorization(
    session.defaultSession,
    registry,
  );
  const disposeProtocol = registerDesktopOpenNekoProtocol(rendererRoot, registry);
  const primary = createQualificationWindow();
  const secondary = createQualificationWindow();
  bindWindowLifecycle(primary, 'qualification-window-1', registry);
  bindWindowLifecycle(secondary, 'qualification-window-2', registry);

  try {
    await Promise.all([
      primary.loadURL(`${DESKTOP_APP_ORIGIN}/index.html`),
      secondary.loadURL(`${DESKTOP_APP_ORIGIN}/index.html`),
    ]);
    const leases = await registerFixtures(registry, fixtures);
    const rendererResult: unknown = await primary.webContents.executeJavaScript(
      `(${runRendererQualification.toString()})(${JSON.stringify({
        videoUrl: leases.video.url,
        videoSha256: fixtures.videoSha256,
        audioUrl: leases.audio.url,
        imageUrl: leases.image.url,
        pdfUrl: leases.pdf.url,
        glbUrl: leases.glb.url,
        gltfUrl: leases.gltf.url,
      } satisfies QualificationResources)})`,
      true,
    );

    assertRendererResult(rendererResult);
    const copiedUrlReachable: unknown = await secondary.webContents.executeJavaScript(
      `fetch(${JSON.stringify(leases.video.url)})
        .then((response) => response.ok)
        .catch(() => false)`,
      true,
    );
    if (copiedUrlReachable !== false) {
      throw new Error('A second WebContents reused an owner-bound resource URL.');
    }

    const clientPcm = await qualifyPcmCancellation(primary, registry, 'client');
    const ownerPcm = await qualifyPcmCancellation(primary, registry, 'owner');

    const staleUrl = leases.video.url;
    const didFinishReload = onceEvent(primary.webContents, 'did-finish-load');
    primary.webContents.reload();
    await didFinishReload;
    const staleAfterReload: unknown = await primary.webContents.executeJavaScript(
      `fetch(${JSON.stringify(staleUrl)})
        .then((response) => response.status)
        .catch(() => 0)`,
      true,
    );
    if (typeof staleAfterReload !== 'number') {
      throw new Error('Reload qualification returned an invalid resource status.');
    }
    if (staleAfterReload !== 0) {
      throw new Error(
        `Reloaded Renderer unexpectedly reached stale resource status ${staleAfterReload}.`,
      );
    }

    const closeLease = await registry.registerFile(
      owner('qualification-window-2', 'close-session'),
      {
        absolutePath: fixtures.imagePath,
        mediaType: 'image/png',
      },
    );
    const secondaryClosed = onceEvent(secondary, 'closed');
    secondary.close();
    await secondaryClosed;
    const closeStatus = (await registry.handle(new Request(closeLease.url))).status;
    if (closeStatus !== 404) {
      throw new Error(`Closed Window resource remained reachable with status ${closeStatus}.`);
    }

    const report = {
      status: 'passed',
      runtime: {
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        node: process.versions.node,
        platform: process.platform,
        architecture: process.arch,
        packaged: app.isPackaged,
        ffmpeg: fixtures.ffmpegVersion,
      },
      renderer: rendererResult,
      senderIsolation: { copiedUrlDenied: true },
      pcm: {
        clientCancellation: clientPcm,
        ownerCancellation: ownerPcm,
      },
      lifecycle: {
        reloadRevokedStatus: staleAfterReload,
        closeRevokedStatus: closeStatus,
      },
    };
    await writeQualificationReport(report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    app.exit(0);
  } finally {
    if (!primary.isDestroyed()) primary.destroy();
    if (!secondary.isDestroyed()) secondary.destroy();
    registry.dispose();
    disposeAuthorization();
    disposeProtocol();
  }
}

function createQualificationWindow(): BrowserWindow {
  return new BrowserWindow({
    width: 480,
    height: 360,
    show: false,
    webPreferences: {
      ...createDesktopWebPreferences(__filename),
      preload: undefined,
      backgroundThrottling: false,
    },
  });
}

function bindWindowLifecycle(
  window: BrowserWindow,
  windowId: string,
  registry: DesktopResourceRegistry,
): void {
  registry.bindWindow(windowId, window.webContents.id);
  window.webContents.on('did-start-loading', () => {
    registry.releaseWindow(windowId);
  });
  window.once('closed', () => {
    registry.unbindWindow(windowId);
  });
}

async function registerFixtures(
  registry: DesktopResourceRegistry,
  fixtures: Awaited<ReturnType<typeof createFixtures>>,
) {
  const resourceOwner = owner('qualification-window-1', 'qualification-session');
  const [video, audio, image, pdf, glb] = await Promise.all([
    registry.registerFile(resourceOwner, {
      absolutePath: fixtures.videoPath,
      mediaType: 'video/mp4',
    }),
    registry.registerFile(resourceOwner, {
      absolutePath: fixtures.audioPath,
      mediaType: 'audio/wav',
    }),
    registry.registerFile(resourceOwner, {
      absolutePath: fixtures.imagePath,
      mediaType: 'image/png',
    }),
    registry.registerFile(resourceOwner, {
      absolutePath: fixtures.pdfPath,
      mediaType: 'application/pdf',
    }),
    registry.registerFile(resourceOwner, {
      absolutePath: fixtures.glbPath,
      mediaType: 'model/gltf-binary',
    }),
  ]);
  const gltf = await registry.registerResourceSet(
    resourceOwner,
    [
      {
        virtualPath: 'scene.gltf',
        path: fixtures.gltfPath,
        contentType: 'model/gltf+json',
      },
      {
        virtualPath: 'scene.bin',
        path: fixtures.gltfBinaryPath,
        contentType: 'application/octet-stream',
      },
    ],
    'scene.gltf',
  );
  return { video, audio, image, pdf, glb, gltf };
}

async function qualifyPcmCancellation(
  window: BrowserWindow,
  registry: DesktopResourceRegistry,
  mode: 'client' | 'owner',
): Promise<{ readonly firstChunkBytes: number; readonly terminationCount: number }> {
  let terminationCount = 0;
  let resolveTermination!: () => void;
  const termination = new Promise<void>((resolve) => {
    resolveTermination = resolve;
  });
  const publisher = registry.createMediaPublisher({
    windowId: 'qualification-window-1',
    viewId: 'qualification-view',
    sessionId: `pcm-${mode}`,
    rendererSessionId: 'qualification-epoch',
  });
  const pcm = await publisher.registerPcm((signal) => {
    const stdout = new PassThrough();
    let terminated = false;
    const terminate = (): void => {
      if (terminated) return;
      terminated = true;
      terminationCount += 1;
      stdout.end();
      resolveTermination();
    };
    signal.addEventListener('abort', terminate, { once: true });
    queueMicrotask(() => stdout.write(Buffer.from('openneko-pcm-frame')));
    return { stdout, completion: termination, terminate };
  });
  pcm.prime();

  const firstChunkBytes: unknown = await window.webContents.executeJavaScript(
    `(async () => {
      const response = await fetch(${JSON.stringify(pcm.url)});
      if (!response.ok || !response.body) throw new Error('PCM response unavailable');
      const reader = response.body.getReader();
      const first = await reader.read();
      globalThis.__opennekoPcmReader = reader;
      return first.value?.byteLength ?? 0;
    })()`,
    true,
  );
  if (typeof firstChunkBytes !== 'number') {
    throw new Error(`${mode} PCM returned an invalid byte count.`);
  }
  if (firstChunkBytes === 0) throw new Error(`${mode} PCM returned no bytes.`);

  if (mode === 'client') {
    await window.webContents.executeJavaScript('globalThis.__opennekoPcmReader.cancel()', true);
  } else {
    pcm.release();
    await window.webContents.executeJavaScript(
      `globalThis.__opennekoPcmReader.read()
        .then((value) => value.done)
        .catch(() => true)`,
      true,
    );
  }
  await withTimeout(termination, 5_000, `${mode} PCM termination`);
  if (terminationCount !== 1) {
    throw new Error(`${mode} PCM terminated ${terminationCount} times.`);
  }
  pcm.release();
  return { firstChunkBytes, terminationCount };
}

function owner(windowId: string, sessionId: string): DesktopResourceOwner {
  return {
    windowId,
    viewId: 'qualification-view',
    sessionId,
    rendererSessionId: 'qualification-epoch',
  };
}

async function createFixtures(root: string) {
  const videoPath = path.join(root, 'video.mp4');
  const audioPath = path.join(root, 'audio.wav');
  const imagePath = path.join(root, 'image.png');
  const pdfPath = path.join(root, 'document.pdf');
  const glbPath = path.join(root, 'scene.glb');
  const gltfPath = path.join(root, 'scene.gltf');
  const gltfBinaryPath = path.join(root, 'scene.bin');
  const ffmpegPath = process.env['OPENNEKO_QUALIFICATION_FFMPEG'] ?? 'ffmpeg';
  const ffmpegReleaseOutput = await execFileAsync(ffmpegPath, ['-version']);
  await execFileAsync(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=96x64:rate=30',
    '-t',
    '2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    '-y',
    videoPath,
  ]);
  await Promise.all([
    writeFile(audioPath, createWavFixture()),
    writeFile(
      imagePath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l0jO9QAAAABJRU5ErkJggg==',
        'base64',
      ),
    ),
    writeFile(pdfPath, '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'),
    writeFile(glbPath, createGlbFixture()),
    writeFile(
      gltfPath,
      JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ uri: 'scene.bin', byteLength: 4 }],
      }),
    ),
    writeFile(gltfBinaryPath, Buffer.from([1, 2, 3, 4])),
  ]);
  const [
    videoFingerprint,
    audioFingerprint,
    imageFingerprint,
    pdfFingerprint,
    glbFingerprint,
    gltfFingerprint,
    gltfBinaryFingerprint,
  ] = await Promise.all([
    fileFingerprint(videoPath),
    fileFingerprint(audioPath),
    fileFingerprint(imagePath),
    fileFingerprint(pdfPath),
    fileFingerprint(glbPath),
    fileFingerprint(gltfPath),
    fileFingerprint(gltfBinaryPath),
  ] as const);
  return {
    videoPath,
    videoSha256: createHash('sha256')
      .update(await readFile(videoPath))
      .digest('hex'),
    videoFingerprint,
    audioPath,
    audioFingerprint,
    imagePath,
    imageFingerprint,
    pdfPath,
    pdfFingerprint,
    glbPath,
    glbFingerprint,
    gltfPath,
    gltfFingerprint,
    gltfBinaryPath,
    gltfBinaryFingerprint,
    ffmpegVersion: ffmpegReleaseOutput.stdout.split(/\r?\n/u)[0] ?? 'unknown',
  };
}

async function fileFingerprint(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

function createWavFixture(): Buffer {
  const sampleRate = 48_000;
  const seconds = 2;
  const samples = sampleRate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const sample = Math.sin((index / sampleRate) * Math.PI * 2 * 440);
    data.writeInt16LE(Math.round(sample * 12_000), index * 2);
  }
  const result = Buffer.alloc(44 + data.length);
  result.write('RIFF', 0);
  result.writeUInt32LE(result.length - 8, 4);
  result.write('WAVEfmt ', 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(1, 22);
  result.writeUInt32LE(sampleRate, 24);
  result.writeUInt32LE(sampleRate * 2, 28);
  result.writeUInt16LE(2, 32);
  result.writeUInt16LE(16, 34);
  result.write('data', 36);
  result.writeUInt32LE(data.length, 40);
  data.copy(result, 44);
  return result;
}

function createGlbFixture(): Buffer {
  const result = Buffer.alloc(12);
  result.write('glTF', 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(12, 8);
  return result;
}

function assertRendererResult(result: unknown): asserts result is RendererQualificationResult {
  if (
    !isRecord(result) ||
    !isRecord(result.video) ||
    !isRecord(result.audio) ||
    !isRecord(result.range) ||
    !isNumber(result.video.duration) ||
    !isNumber(result.video.advancedTo) ||
    !isNumber(result.video.seekedTo) ||
    !isNumber(result.video.firstCanvasHash) ||
    !isNumber(result.video.secondCanvasHash) ||
    !isNumber(result.video.firstTextureHash) ||
    !isNumber(result.video.secondTextureHash) ||
    !isNumber(result.audio.duration) ||
    !isNumber(result.audio.advancedTo) ||
    !isNumber(result.audio.seekedTo) ||
    !isNumber(result.range.status) ||
    (result.range.contentRange !== null && typeof result.range.contentRange !== 'string') ||
    (result.range.acceptRanges !== null && typeof result.range.acceptRanges !== 'string') ||
    !isNumber(result.range.bytes) ||
    typeof result.videoSha256 !== 'string' ||
    !Array.isArray(result.imagePixel) ||
    !result.imagePixel.every(isNumber) ||
    typeof result.pdfHeader !== 'string' ||
    typeof result.glbHeader !== 'string' ||
    typeof result.gltfDependency !== 'string'
  ) {
    throw new Error('Renderer qualification returned an invalid result contract.');
  }
  if (result.video.duration < 1.5 || result.audio.duration < 1.5) {
    throw new Error('Native media metadata duration was not observed.');
  }
  if (result.video.advancedTo <= 0 || result.audio.advancedTo <= 0) {
    throw new Error('Native media playback clocks did not advance.');
  }
  if (Math.abs(result.video.seekedTo - 1.2) > 0.2 || Math.abs(result.audio.seekedTo - 1) > 0.2) {
    throw new Error('Native media seek did not reach the requested time.');
  }
  if (
    result.video.firstCanvasHash === result.video.secondCanvasHash ||
    result.video.firstTextureHash === result.video.secondTextureHash
  ) {
    throw new Error('Canvas or repeated WebGL texture pixels did not change.');
  }
  if (
    result.range.status !== 206 ||
    result.range.contentRange === null ||
    result.range.acceptRanges !== 'bytes' ||
    result.range.bytes !== 64
  ) {
    throw new Error('Renderer Range response was invalid.');
  }
  if (result.videoSha256.length !== 64) {
    throw new Error('Renderer SHA-256 result was invalid.');
  }
  if (result.pdfHeader !== '%PDF-' || result.glbHeader !== 'glTF') {
    throw new Error('PDF or GLB bytes were not preserved.');
  }
  if (result.gltfDependency !== '01020304') {
    throw new Error('glTF dependency bytes were not served from the frozen set.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

async function writeQualificationReport(value: unknown): Promise<void> {
  const reportPath = process.env[QUALIFICATION_REPORT_ENVIRONMENT];
  if (!reportPath) return;
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(value, null, 2)}\n`);
}

function requireQualificationRoot(): string {
  const input = process.env[QUALIFICATION_ROOT_ENVIRONMENT];
  if (!input || !path.isAbsolute(input)) {
    throw new Error('OpenNeko media qualification requires an absolute fixture root.');
  }
  const resolved = path.resolve(input);
  if (!path.basename(resolved).startsWith(QUALIFICATION_ROOT_PREFIX)) {
    throw new Error('OpenNeko media qualification fixture root is unsafe.');
  }
  return resolved;
}

function onceEvent(target: NodeJS.EventEmitter, eventName: string): Promise<void> {
  return new Promise((resolve) => {
    target.once(eventName, () => resolve());
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runRendererQualification(
  input: QualificationResources,
): Promise<RendererQualificationResult> {
  const waitForEvent = (
    target: EventTarget,
    eventName: string,
    timeoutMs = 10_000,
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${eventName} timed out`)), timeoutMs);
      target.addEventListener(
        eventName,
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  const seek = async (media: HTMLMediaElement, time: number): Promise<void> => {
    const completed = waitForEvent(media, 'seeked');
    media.currentTime = time;
    await completed;
  };
  const waitForAdvance = async (media: HTMLMediaElement): Promise<number> => {
    const startedAt = performance.now();
    while (media.currentTime <= 0.1) {
      if (performance.now() - startedAt > 10_000) {
        throw new Error('media clock did not advance');
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return media.currentTime;
  };
  const pixelHash = (pixels: Uint8Array | Uint8ClampedArray): number => {
    let hash = 2166136261;
    for (const value of pixels) {
      hash ^= value;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  const createVideo = async (): Promise<HTMLVideoElement> => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = input.videoUrl;
    document.body.append(video);
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForEvent(video, 'loadedmetadata');
    }
    return video;
  };
  const createAudio = async (): Promise<HTMLAudioElement> => {
    const audio = document.createElement('audio');
    audio.crossOrigin = 'anonymous';
    audio.muted = true;
    audio.preload = 'auto';
    audio.src = input.audioUrl;
    document.body.append(audio);
    if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForEvent(audio, 'loadedmetadata');
    }
    return audio;
  };
  const canvasVideoHash = (video: HTMLVideoElement): number => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2D canvas unavailable');
    context.drawImage(video, 0, 0);
    return pixelHash(context.getImageData(0, 0, canvas.width, canvas.height).data);
  };
  const createTextureRenderer = (video: HTMLVideoElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    const compile = (kind: number, source: string): WebGLShader => {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('WebGL shader unavailable');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? 'WebGL shader compile failed');
      }
      return shader;
    };
    const program = gl.createProgram();
    if (!program) throw new Error('WebGL program unavailable');
    gl.attachShader(
      program,
      compile(
        gl.VERTEX_SHADER,
        '#version 300 es\nin vec2 p;out vec2 uv;void main(){uv=(p+1.0)*0.5;gl_Position=vec4(p,0,1);}',
      ),
    );
    gl.attachShader(
      program,
      compile(
        gl.FRAGMENT_SHADER,
        '#version 300 es\nprecision mediump float;in vec2 uv;uniform sampler2D tex;out vec4 color;void main(){color=texture(tex,uv);}',
      ),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'WebGL program link failed');
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return (): number => {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL texture upload failed');
      return pixelHash(pixels);
    };
  };
  const toHex = (bytes: Uint8Array): string =>
    [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');

  const video = await createVideo();
  const videoDuration = video.duration;
  await video.play();
  const videoAdvancedTo = await waitForAdvance(video);
  video.pause();
  await seek(video, 0.25);
  const firstCanvasHash = canvasVideoHash(video);
  const renderTexture = createTextureRenderer(video);
  const firstTextureHash = renderTexture();
  await seek(video, 1.2);
  const secondCanvasHash = canvasVideoHash(video);
  const secondTextureHash = renderTexture();

  const audio = await createAudio();
  const audioDuration = audio.duration;
  await audio.play();
  const audioAdvancedTo = await waitForAdvance(audio);
  audio.pause();
  await seek(audio, 1);

  const rangeResponse = await fetch(input.videoUrl, {
    headers: { Range: 'bytes=0-63' },
  });
  const rangeBytes = new Uint8Array(await rangeResponse.arrayBuffer());
  const fullVideo = await fetch(input.videoUrl).then((response) => response.arrayBuffer());
  const videoSha256 = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', fullVideo)));
  if (videoSha256 !== input.videoSha256) throw new Error('video SHA-256 mismatch');

  const image = document.createElement('img');
  image.crossOrigin = 'anonymous';
  image.src = input.imageUrl;
  await waitForEvent(image, 'load');
  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = 1;
  imageCanvas.height = 1;
  const imageContext = imageCanvas.getContext('2d');
  if (!imageContext) throw new Error('image canvas unavailable');
  imageContext.drawImage(image, 0, 0);
  const imagePixel = [...imageContext.getImageData(0, 0, 1, 1).data];

  const pdfBytes: ArrayBuffer = await fetch(input.pdfUrl).then((response) =>
    response.arrayBuffer(),
  );
  const pdfHeader = new TextDecoder().decode(pdfBytes).slice(0, 5);
  const glbBytes: ArrayBuffer = await fetch(input.glbUrl).then((response) =>
    response.arrayBuffer(),
  );
  const glbHeader = new TextDecoder().decode(glbBytes.slice(0, 4));
  const gltf: unknown = await fetch(input.gltfUrl).then((response) => response.json());
  if (
    typeof gltf !== 'object' ||
    gltf === null ||
    !('buffers' in gltf) ||
    !Array.isArray(gltf.buffers) ||
    typeof gltf.buffers[0] !== 'object' ||
    gltf.buffers[0] === null ||
    !('uri' in gltf.buffers[0]) ||
    typeof gltf.buffers[0].uri !== 'string'
  ) {
    throw new Error('glTF fixture returned an invalid dependency manifest');
  }
  const dependencyUrl = new URL(gltf.buffers[0].uri, input.gltfUrl).toString();
  const dependencyBytes: ArrayBuffer = await fetch(dependencyUrl).then((response) =>
    response.arrayBuffer(),
  );
  const gltfDependency = toHex(new Uint8Array(dependencyBytes));

  video.remove();
  audio.remove();
  return {
    video: {
      duration: videoDuration,
      advancedTo: videoAdvancedTo,
      seekedTo: video.currentTime,
      firstCanvasHash,
      secondCanvasHash,
      firstTextureHash,
      secondTextureHash,
    },
    audio: {
      duration: audioDuration,
      advancedTo: audioAdvancedTo,
      seekedTo: audio.currentTime,
    },
    range: {
      status: rangeResponse.status,
      contentRange: rangeResponse.headers.get('Content-Range'),
      acceptRanges: rangeResponse.headers.get('Accept-Ranges'),
      bytes: rangeBytes.byteLength,
    },
    videoSha256,
    imagePixel,
    pdfHeader,
    glbHeader,
    gltfDependency,
  };
}
