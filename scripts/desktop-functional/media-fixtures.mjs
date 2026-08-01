import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function createDesktopMediaFixtureSet(workspacePath) {
  const mediaRoot = join(workspacePath, 'media');
  const documentRoot = join(workspacePath, 'documents');
  const modelRoot = join(workspacePath, 'models');
  await Promise.all([
    mkdir(mediaRoot, { recursive: true }),
    mkdir(documentRoot, { recursive: true }),
    mkdir(modelRoot, { recursive: true }),
  ]);

  const videoPath = join(mediaRoot, 'motion-with-audio.mp4');
  const audioPath = join(mediaRoot, 'tone.wav');
  const imagePath = join(mediaRoot, 'frame.png');
  await Promise.all([
    runFfmpeg([
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x180:rate=30',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000',
      '-t',
      '4',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      videoPath,
    ]),
    runFfmpeg([
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=660:sample_rate=48000',
      '-t',
      '4',
      '-c:a',
      'pcm_s16le',
      audioPath,
    ]),
    runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=1', '-frames:v', '1', imagePath]),
  ]);

  const pdfPath = join(documentRoot, 'qualification.pdf');
  const glbPath = join(modelRoot, 'qualification.glb');
  const gltfPath = join(modelRoot, 'qualification.gltf');
  const gltfBinaryPath = join(modelRoot, 'triangle.bin');
  await Promise.all([
    writeFile(pdfPath, createMinimalPdf()),
    writeFile(glbPath, createMinimalGlb()),
    writeFile(gltfPath, `${JSON.stringify(createGltfManifest(), null, 2)}\n`),
    writeFile(gltfBinaryPath, createTrianglePositions()),
  ]);

  return Object.freeze({
    video: 'media/motion-with-audio.mp4',
    audio: 'media/tone.wav',
    image: 'media/frame.png',
    pdf: 'documents/qualification.pdf',
    glb: 'models/qualification.glb',
    gltf: 'models/qualification.gltf',
    gltfDependency: 'models/triangle.bin',
  });
}

async function runFfmpeg(args) {
  try {
    await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Desktop functional fixture generation failed: ${detail}`);
  }
}

function createMinimalPdf() {
  const content = 'BT /F1 18 Tf 72 120 Td (OpenNeko Preview Qualification) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 180] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${String(Buffer.byteLength(content))} >>\nstream\n${content}\nendstream`,
  ];
  let source = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(source));
    source += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(source);
  source += `xref\n0 ${String(objects.length + 1)}\n`;
  source += '0000000000 65535 f \n';
  source += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  source += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF\n`;
  return Buffer.from(source);
}

function createTrianglePositions() {
  const positions = new Float32Array([-0.6, -0.5, 0, 0.6, -0.5, 0, 0, 0.6, 0]);
  return Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength);
}

function createGltfManifest() {
  return {
    asset: { version: '2.0', generator: 'OpenNeko desktop functional qualification' },
    buffers: [{ uri: 'triangle.bin', byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [-0.6, -0.5, 0],
        max: [0.6, 0.6, 0],
      },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
    nodes: [{ mesh: 0, name: 'Qualification triangle' }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
}

function createMinimalGlb() {
  const positions = createTrianglePositions();
  const manifest = Buffer.from(
    JSON.stringify({
      ...createGltfManifest(),
      buffers: [{ byteLength: positions.length }],
    }),
  );
  const paddedLength = Math.ceil(manifest.length / 4) * 4;
  const json = Buffer.alloc(paddedLength, 0x20);
  manifest.copy(json);
  const binaryLength = Math.ceil(positions.length / 4) * 4;
  const binary = Buffer.alloc(binaryLength);
  positions.copy(binary);
  const output = Buffer.alloc(12 + 8 + json.length + 8 + binary.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(json.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  const binaryOffset = 20 + json.length;
  output.writeUInt32LE(binary.length, binaryOffset);
  output.writeUInt32LE(0x004e4942, binaryOffset + 4);
  binary.copy(output, binaryOffset + 8);
  return output;
}
