/**
 * Generates minimal glTF Binary (.glb) files in TypeScript.
 *
 * GLB format (glTF 2.0):
 *   [0..4]    Magic: "glTF"
 *   [4..8]    u32 LE: version (2)
 *   [8..12]   u32 LE: total file length
 *   [12..]    Chunks:
 *     [0..4]  u32 LE: chunk length (padded to 4-byte boundary)
 *     [4..8]  u32 LE: chunk type (0x4E4F534A = JSON, 0x004E4942 = BIN)
 *     [8..]   chunk data (padded with 0x20 for JSON, 0x00 for BIN)
 */

// ── Binary helpers ──────────────────────────────────────────────────────────

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION = 2;
const CHUNK_TYPE_JSON = 0x4e4f534a;

function writeU32LE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setUint32(0, value, true); // little-endian
  return buf;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrays) total += a.length;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

/** Pad to 4-byte boundary with the given fill byte. */
function pad4(data: Uint8Array, fill: number): Uint8Array {
  const remainder = data.length % 4;
  if (remainder === 0) return data;
  const padding = new Uint8Array(4 - remainder);
  padding.fill(fill);
  return concat(data, padding);
}

const CHUNK_TYPE_BIN = 0x004e4942;

// ── GLB packer ──────────────────────────────────────────────────────────────

function packGlb(gltfJson: object, binData?: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const jsonRaw = encoder.encode(JSON.stringify(gltfJson));
  const jsonPadded = pad4(jsonRaw, 0x20); // JSON chunks padded with spaces

  const headerSize = 12; // magic + version + length
  const chunkHeaderSize = 8; // chunkLength + chunkType

  if (binData && binData.length > 0) {
    const binPadded = pad4(binData, 0x00);
    const totalLength =
      headerSize + chunkHeaderSize + jsonPadded.length + chunkHeaderSize + binPadded.length;
    return concat(
      writeU32LE(GLB_MAGIC),
      writeU32LE(GLB_VERSION),
      writeU32LE(totalLength),
      writeU32LE(jsonPadded.length),
      writeU32LE(CHUNK_TYPE_JSON),
      jsonPadded,
      writeU32LE(binPadded.length),
      writeU32LE(CHUNK_TYPE_BIN),
      binPadded,
    );
  }

  const totalLength = headerSize + chunkHeaderSize + jsonPadded.length;
  return concat(
    writeU32LE(GLB_MAGIC),
    writeU32LE(GLB_VERSION),
    writeU32LE(totalLength),
    writeU32LE(jsonPadded.length),
    writeU32LE(CHUNK_TYPE_JSON),
    jsonPadded,
  );
}

// ── glTF node builder ───────────────────────────────────────────────────────

interface GltfNode {
  name: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  children?: number[];
  mesh?: number;
}

function buildGltfJson(sceneName: string, nodes: GltfNode[], rootIndices: number[]): object {
  return {
    asset: { version: '2.0', generator: 'neko-model' },
    scene: 0,
    scenes: [{ name: sceneName, nodes: rootIndices }],
    nodes,
  };
}

/** Write f32 little-endian to buffer at offset */
function writeF32(buf: DataView, offset: number, value: number): void {
  buf.setFloat32(offset, value, true);
}

/** Write u16 little-endian to buffer at offset */
function writeU16(buf: DataView, offset: number, value: number): void {
  buf.setUint16(offset, value, true);
}

// ── Procedural geometry generators ──────────────────────────────────────────

/** Generate a UV sphere (positions + normals + indices) centered at origin. */
function generateSphere(
  radius: number,
  rings: number,
  segments: number,
): { positions: number[]; normals: number[]; indices: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const x = sinPhi * Math.cos(theta);
      const y = cosPhi;
      const z = sinPhi * Math.sin(theta);
      positions.push(x * radius, y * radius, z * radius);
      normals.push(x, y, z);
    }
  }
  const stride = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * stride + s;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, normals, indices };
}

/** Generate a cylinder along Y axis (bottom at y=0, top at y=height). */
function generateCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
): { positions: number[]; normals: number[]; indices: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  // Side vertices: 2 rings
  for (let ring = 0; ring <= 1; ring++) {
    const y = ring * height;
    const r = ring === 0 ? radiusBottom : radiusTop;
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const x = Math.cos(theta);
      const z = Math.sin(theta);
      positions.push(x * r, y, z * r);
      // Approximate normal (ignoring slope for simplicity)
      normals.push(x, 0, z);
    }
  }
  const stride = segments + 1;
  for (let s = 0; s < segments; s++) {
    const a = s;
    const b = a + stride;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }

  // Top cap
  const topCenter = positions.length / 3;
  positions.push(0, height, 0);
  normals.push(0, 1, 0);
  for (let s = 0; s <= segments; s++) {
    const theta = (s / segments) * Math.PI * 2;
    positions.push(Math.cos(theta) * radiusTop, height, Math.sin(theta) * radiusTop);
    normals.push(0, 1, 0);
  }
  for (let s = 0; s < segments; s++) {
    indices.push(topCenter, topCenter + 1 + s + 1, topCenter + 1 + s);
  }

  // Bottom cap
  const botCenter = positions.length / 3;
  positions.push(0, 0, 0);
  normals.push(0, -1, 0);
  for (let s = 0; s <= segments; s++) {
    const theta = (s / segments) * Math.PI * 2;
    positions.push(Math.cos(theta) * radiusBottom, 0, Math.sin(theta) * radiusBottom);
    normals.push(0, -1, 0);
  }
  for (let s = 0; s < segments; s++) {
    indices.push(botCenter, botCenter + 1 + s, botCenter + 1 + s + 1);
  }

  return { positions, normals, indices };
}

/** Generate an axis-aligned cube centered at origin. */
function generateCube(
  width: number,
  height: number,
  depth: number,
): { positions: number[]; normals: number[]; indices: number[] } {
  const hx = width / 2;
  const hy = height / 2;
  const hz = depth / 2;
  const positions = [
    // +X
    hx,
    -hy,
    -hz,
    hx,
    -hy,
    hz,
    hx,
    hy,
    hz,
    hx,
    hy,
    -hz,
    // -X
    -hx,
    -hy,
    hz,
    -hx,
    -hy,
    -hz,
    -hx,
    hy,
    -hz,
    -hx,
    hy,
    hz,
    // +Y
    -hx,
    hy,
    -hz,
    hx,
    hy,
    -hz,
    hx,
    hy,
    hz,
    -hx,
    hy,
    hz,
    // -Y
    -hx,
    -hy,
    hz,
    hx,
    -hy,
    hz,
    hx,
    -hy,
    -hz,
    -hx,
    -hy,
    -hz,
    // +Z
    hx,
    -hy,
    hz,
    -hx,
    -hy,
    hz,
    -hx,
    hy,
    hz,
    hx,
    hy,
    hz,
    // -Z
    -hx,
    -hy,
    -hz,
    hx,
    -hy,
    -hz,
    hx,
    hy,
    -hz,
    -hx,
    hy,
    -hz,
  ];
  const normals = [
    ...Array(4).fill([1, 0, 0]).flat(),
    ...Array(4).fill([-1, 0, 0]).flat(),
    ...Array(4).fill([0, 1, 0]).flat(),
    ...Array(4).fill([0, -1, 0]).flat(),
    ...Array(4).fill([0, 0, 1]).flat(),
    ...Array(4).fill([0, 0, -1]).flat(),
  ];
  const indices: number[] = [];
  for (let face = 0; face < 6; face += 1) {
    const base = face * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}

/** Pack multiple meshes into a single binary buffer + glTF descriptor arrays. */
function packMeshes(
  geometries: { positions: number[]; normals: number[]; indices: number[] }[],
  color: [number, number, number, number],
) {
  // Compute total binary size
  let totalPosFloats = 0;
  let totalNormFloats = 0;
  let totalIdxCount = 0;
  for (const g of geometries) {
    totalPosFloats += g.positions.length;
    totalNormFloats += g.normals.length;
    totalIdxCount += g.indices.length;
  }
  const posBytes = totalPosFloats * 4;
  const normBytes = totalNormFloats * 4;
  const idxBytes = totalIdxCount * 2;
  const totalBin = posBytes + normBytes + idxBytes;

  const buf = new ArrayBuffer(totalBin);
  const view = new DataView(buf);

  // Write all positions, then all normals, then all indices
  let posOff = 0;
  let normOff = posBytes;
  let idxOff = posBytes + normBytes;

  const meshes: {
    primitives: {
      attributes: { POSITION: number; NORMAL: number };
      indices: number;
      material: number;
    }[];
  }[] = [];
  const accessors: Record<string, unknown>[] = [];
  const bufferViews: Record<string, unknown>[] = [];
  let accessorIdx = 0;

  for (const g of geometries) {
    const vertCount = g.positions.length / 3;
    const idxCount = g.indices.length;

    // Position buffer view + accessor
    const posBvIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: posOff,
      byteLength: g.positions.length * 4,
      target: 34962,
    });
    const posAccIdx = accessorIdx++;
    // Compute AABB
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < g.positions.length; i += 3) {
      const x = g.positions[i]!,
        y = g.positions[i + 1]!,
        z = g.positions[i + 2]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    accessors.push({
      bufferView: posBvIdx,
      componentType: 5126,
      count: vertCount,
      type: 'VEC3',
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    });

    // Write position data
    for (const v of g.positions) {
      writeF32(view, posOff, v);
      posOff += 4;
    }

    // Normal buffer view + accessor
    const normBvIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: normOff,
      byteLength: g.normals.length * 4,
      target: 34962,
    });
    const normAccIdx = accessorIdx++;
    accessors.push({ bufferView: normBvIdx, componentType: 5126, count: vertCount, type: 'VEC3' });
    for (const v of g.normals) {
      writeF32(view, normOff, v);
      normOff += 4;
    }

    // Index buffer view + accessor
    const idxBvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: idxOff, byteLength: idxCount * 2, target: 34963 });
    const idxAccIdx = accessorIdx++;
    accessors.push({ bufferView: idxBvIdx, componentType: 5123, count: idxCount, type: 'SCALAR' });
    for (const v of g.indices) {
      writeU16(view, idxOff, v);
      idxOff += 2;
    }

    meshes.push({
      primitives: [
        {
          attributes: { POSITION: posAccIdx, NORMAL: normAccIdx },
          indices: idxAccIdx,
          material: 0,
        },
      ],
    });
  }

  return {
    binData: new Uint8Array(buf),
    buffers: [{ byteLength: totalBin }],
    bufferViews,
    accessors,
    meshes,
    materials: [
      {
        name: 'Skin',
        pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0.0, roughnessFactor: 0.8 },
      },
    ],
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a minimal .glb with a single root node and no meshes.
 * Produces a valid glTF 2.0 binary (~200 bytes).
 */
export function generateMinimalGlb(name: string): Uint8Array {
  const nodes: GltfNode[] = [{ name: 'Root' }];
  return packGlb(buildGltfJson(name, nodes, [0]));
}

/**
 * Generate Blender-style default scene content: a single renderable cube.
 * Used for empty neko-model projects so Route A always starts with scene data.
 */
export function generateDefaultCubeGlb(name: string): Uint8Array {
  const packed = packMeshes([generateCube(2, 2, 2)], [0.78, 0.78, 0.78, 1.0]);
  const nodes: GltfNode[] = [{ name: 'Cube', mesh: 0 }];
  const json = {
    ...buildGltfJson(name, nodes, [0]),
    buffers: packed.buffers,
    bufferViews: packed.bufferViews,
    accessors: packed.accessors,
    meshes: [{ name: 'Cube', primitives: packed.meshes[0]?.primitives ?? [] }],
    materials: [{ ...packed.materials[0], name: 'Default Gray' }],
  };

  return packGlb(json, packed.binData);
}

/**
 * Generate a simple humanoid skeleton .glb with bone hierarchy.
 * No meshes, no skinning — provides a structural starting point.
 *
 * Hierarchy:
 *   0: Hips (0, 1.0, 0)
 *   ├─ 1: Spine (0, 0.2, 0)
 *   │  ├─ 2: Chest (0, 0.2, 0)
 *   │  │  ├─ 3: Head (0, 0.3, 0)
 *   │  │  ├─ 4: LeftUpperArm (-0.2, 0.15, 0)
 *   │  │  │  └─ 5: LeftLowerArm (0, -0.3, 0)
 *   │  │  └─ 6: RightUpperArm (0.2, 0.15, 0)
 *   │  │     └─ 7: RightLowerArm (0, -0.3, 0)
 *   ├─ 8: LeftUpperLeg (-0.1, -0.05, 0)
 *   │  └─ 9: LeftLowerLeg (0, -0.4, 0)
 *   └─ 10: RightUpperLeg (0.1, -0.05, 0)
 *      └─ 11: RightLowerLeg (0, -0.4, 0)
 */
export function generateHumanoidGlb(name: string): Uint8Array {
  const SEG = 8; // Low-poly segment count

  // Generate body part meshes (local space, origin at joint)
  const geometries = [
    generateSphere(0.12, SEG, SEG), // 0: Head
    generateCylinder(0.1, 0.12, 0.4, SEG), // 1: Torso (Spine+Chest combined)
    generateCylinder(0.04, 0.05, 0.28, SEG), // 2: UpperArm
    generateCylinder(0.035, 0.04, 0.25, SEG), // 3: LowerArm
    generateCylinder(0.055, 0.06, 0.35, SEG), // 4: UpperLeg
    generateCylinder(0.04, 0.055, 0.35, SEG), // 5: LowerLeg
  ];

  const skinColor: [number, number, number, number] = [0.85, 0.75, 0.65, 1.0];
  const packed = packMeshes(geometries, skinColor);

  // Node indices:
  //  0: Hips         mesh: 1 (torso)
  //  1: Spine         —
  //  2: Chest         —
  //  3: Head          mesh: 0 (sphere)
  //  4: LeftUpperArm  mesh: 2
  //  5: LeftLowerArm  mesh: 3
  //  6: RightUpperArm mesh: 2
  //  7: RightLowerArm mesh: 3
  //  8: LeftUpperLeg  mesh: 4
  //  9: LeftLowerLeg  mesh: 5
  // 10: RightUpperLeg mesh: 4
  // 11: RightLowerLeg mesh: 5

  const nodes: GltfNode[] = [
    { name: 'Hips', translation: [0, 1.0, 0], children: [1, 8, 10], mesh: 1 },
    { name: 'Spine', translation: [0, 0.2, 0], children: [2] },
    { name: 'Chest', translation: [0, 0.2, 0], children: [3, 4, 6] },
    { name: 'Head', translation: [0, 0.3, 0], mesh: 0 },
    { name: 'LeftUpperArm', translation: [-0.18, 0.12, 0], children: [5], mesh: 2 },
    { name: 'LeftLowerArm', translation: [0, -0.28, 0], mesh: 3 },
    { name: 'RightUpperArm', translation: [0.18, 0.12, 0], children: [7], mesh: 2 },
    { name: 'RightLowerArm', translation: [0, -0.28, 0], mesh: 3 },
    { name: 'LeftUpperLeg', translation: [-0.08, -0.05, 0], children: [9], mesh: 4 },
    { name: 'LeftLowerLeg', translation: [0, -0.35, 0], mesh: 5 },
    { name: 'RightUpperLeg', translation: [0.08, -0.05, 0], children: [11], mesh: 4 },
    { name: 'RightLowerLeg', translation: [0, -0.35, 0], mesh: 5 },
  ];

  const json = {
    ...buildGltfJson(name, nodes, [0]),
    buffers: packed.buffers,
    bufferViews: packed.bufferViews,
    accessors: packed.accessors,
    meshes: packed.meshes,
    materials: packed.materials,
  };

  return packGlb(json, packed.binData);
}
