/**
 * JVI Parser — Parse .nkv JSON into JviParsedProject with source positions.
 *
 * Uses jsonc-parser to get a full AST with byte offsets, then walks the tree
 * to extract structured data aligned with the JVI schema (neko-engine jvi/types.rs).
 *
 * All exported functions are pure (no vscode dependency) and testable.
 */

import { parseTree, findNodeAtOffset, getNodeValue, type Node } from 'jsonc-parser';
import type { JviRange, JviParsedProject, JviParsedTrack, JviParsedElement } from '../types';

// ─── Offset ↔ Position conversion ───────────────────────────────────────────

interface LineIndex {
  offsets: number[]; // lineOffsets[line] = byte offset of line start
}

function buildLineIndex(text: string): LineIndex {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  return { offsets };
}

function offsetToPosition(index: LineIndex, offset: number): { line: number; char: number } {
  let lo = 0;
  let hi = index.offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((index.offsets[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo, char: offset - (index.offsets[lo] ?? 0) };
}

function nodeToRange(index: LineIndex, node: Node): JviRange {
  const start = offsetToPosition(index, node.offset);
  const end = offsetToPosition(index, node.offset + node.length);
  return {
    startLine: start.line,
    startChar: start.char,
    endLine: end.line,
    endChar: end.char,
  };
}

// ─── AST helpers ─────────────────────────────────────────────────────────────

function findProperty(objectNode: Node, key: string): Node | undefined {
  if (objectNode.type !== 'object' || !objectNode.children) return undefined;
  for (const prop of objectNode.children) {
    if (prop.type !== 'property' || !prop.children?.[0]) continue;
    if (prop.children[0].value === key) {
      return prop.children[1]; // value node
    }
  }
  return undefined;
}

function getStringValue(objectNode: Node, key: string): string {
  const node = findProperty(objectNode, key);
  if (!node || node.type !== 'string') return '';
  return node.value as string;
}

function getNumberValue(objectNode: Node, key: string, fallback: number = 0): number {
  const node = findProperty(objectNode, key);
  if (!node || node.type !== 'number') return fallback;
  return node.value as number;
}

// ─── Element type detection ─────────────────────────────────────────────────

/** Detect element type from JVI tagged union structure */
function detectElementType(
  elementNode: Node,
): { type: JviParsedElement['type']; dataNode: Node } | null {
  // JVI uses tagged union: { "Media": {...} } or { "Audio": {...} } etc.
  if (elementNode.type !== 'object' || !elementNode.children) return null;
  for (const prop of elementNode.children) {
    if (prop.type !== 'property' || !prop.children?.[0] || !prop.children[1]) {
      continue;
    }
    const tag = prop.children[0].value as string;
    const dataNode = prop.children[1];
    switch (tag) {
      case 'Media':
        return { type: 'media', dataNode };
      case 'Audio':
        return { type: 'audio', dataNode };
      case 'Text':
        return { type: 'text', dataNode };
      case 'Shape':
        return { type: 'shape', dataNode };
      case 'Subtitle':
        return { type: 'subtitle', dataNode };
      default:
        return null;
    }
  }
  return null;
}

// ─── Parse element ──────────────────────────────────────────────────────────

function parseElement(index: LineIndex, elementNode: Node): JviParsedElement | null {
  const detected = detectElementType(elementNode);
  if (!detected) return null;
  const { type, dataNode } = detected;

  const idNode = findProperty(dataNode, 'id');
  const srcNode = findProperty(dataNode, 'src');
  const linkedAudioIdNode = findProperty(dataNode, 'linked_audio_id');
  const linkedVideoIdNode = findProperty(dataNode, 'linked_video_id');

  return {
    id: getStringValue(dataNode, 'id'),
    name: getStringValue(dataNode, 'name'),
    type,
    src: srcNode?.type === 'string' ? (srcNode.value as string) : undefined,
    srcRange: srcNode ? nodeToRange(index, srcNode) : undefined,
    duration: getNumberValue(dataNode, 'duration'),
    startTime: getNumberValue(dataNode, 'start_time'),
    linkedAudioId:
      linkedAudioIdNode?.type === 'string' ? (linkedAudioIdNode.value as string) : undefined,
    linkedAudioIdRange: linkedAudioIdNode ? nodeToRange(index, linkedAudioIdNode) : undefined,
    linkedVideoId:
      linkedVideoIdNode?.type === 'string' ? (linkedVideoIdNode.value as string) : undefined,
    linkedVideoIdRange: linkedVideoIdNode ? nodeToRange(index, linkedVideoIdNode) : undefined,
    range: nodeToRange(index, elementNode),
    idRange: idNode ? nodeToRange(index, idNode) : nodeToRange(index, elementNode),
  };
}

// ─── Parse track ────────────────────────────────────────────────────────────

function parseTrack(index: LineIndex, trackNode: Node): JviParsedTrack | null {
  if (trackNode.type !== 'object') return null;

  const nameNode = findProperty(trackNode, 'name');
  const elementsNode = findProperty(trackNode, 'elements');

  const elements: JviParsedElement[] = [];
  if (elementsNode?.type === 'array' && elementsNode.children) {
    for (const child of elementsNode.children) {
      const el = parseElement(index, child);
      if (el) elements.push(el);
    }
  }

  return {
    id: getStringValue(trackNode, 'id'),
    name: getStringValue(trackNode, 'name'),
    trackType: getStringValue(trackNode, 'track_type'),
    elements,
    range: nodeToRange(index, trackNode),
    nameRange: nameNode ? nodeToRange(index, nameNode) : nodeToRange(index, trackNode),
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse JVI text into a structured project with source position tracking.
 * Returns a project with parseError set if the JSON is malformed.
 */
export function parseJviDocument(text: string): JviParsedProject {
  const defaultRange: JviRange = {
    startLine: 0,
    startChar: 0,
    endLine: 0,
    endChar: 0,
  };
  const emptyProject: JviParsedProject = {
    name: '',
    version: '',
    resolution: { width: 0, height: 0 },
    fps: 0,
    tracks: [],
    range: defaultRange,
  };

  let root: Node | undefined;
  try {
    root = parseTree(text);
  } catch {
    return { ...emptyProject, parseError: 'Failed to parse JSON' };
  }
  if (!root || root.type !== 'object') {
    return { ...emptyProject, parseError: 'Root is not a JSON object' };
  }

  const index = buildLineIndex(text);

  // Parse resolution
  const resNode = findProperty(root, 'resolution');
  const width = resNode?.type === 'object' ? getNumberValue(resNode, 'width') : 0;
  const height = resNode?.type === 'object' ? getNumberValue(resNode, 'height') : 0;

  // Parse tracks
  const tracksNode = findProperty(root, 'tracks');
  const tracks: JviParsedTrack[] = [];
  if (tracksNode?.type === 'array' && tracksNode.children) {
    for (const child of tracksNode.children) {
      const track = parseTrack(index, child);
      if (track) tracks.push(track);
    }
  }

  const nameNode = findProperty(root, 'name');

  return {
    name: getStringValue(root, 'name'),
    version: getStringValue(root, 'version'),
    resolution: { width, height },
    fps: getNumberValue(root, 'fps'),
    tracks,
    range: nodeToRange(index, root),
    nameRange: nameNode ? nodeToRange(index, nameNode) : undefined,
  };
}

/**
 * Find a "src" string value node at a given byte offset.
 * Used by HoverProvider and DefinitionProvider to detect cursor on src values.
 */
export function findSrcNodeAtOffset(
  text: string,
  offset: number,
): { value: string; range: JviRange } | null {
  const root = parseTree(text);
  if (!root) return null;

  const node = findNodeAtOffset(root, offset);
  if (!node || node.type !== 'string') return null;

  // Walk up to find the property name
  const parent = node.parent;
  if (!parent || parent.type !== 'property' || !parent.children?.[0]) {
    return null;
  }
  const keyNode = parent.children[0];
  if (keyNode.value !== 'src') return null;

  const index = buildLineIndex(text);
  return {
    value: node.value as string,
    range: nodeToRange(index, node),
  };
}

/**
 * Find a "linked_audio_id" or "linked_video_id" string value at offset.
 * Used by DefinitionProvider for element-to-element navigation.
 */
export function findLinkedIdAtOffset(
  text: string,
  offset: number,
): { field: string; value: string; range: JviRange } | null {
  const root = parseTree(text);
  if (!root) return null;

  const node = findNodeAtOffset(root, offset);
  if (!node || node.type !== 'string') return null;

  const parent = node.parent;
  if (!parent || parent.type !== 'property' || !parent.children?.[0]) {
    return null;
  }
  const keyName = parent.children[0].value as string;
  if (keyName !== 'linked_audio_id' && keyName !== 'linked_video_id') {
    return null;
  }

  const index = buildLineIndex(text);
  return {
    field: keyName,
    value: node.value as string,
    range: nodeToRange(index, node),
  };
}

/**
 * Find an element's "id" value range by element ID in the parsed text.
 * Used by DefinitionProvider for linkedId → element navigation within same file.
 */
export function findElementIdRange(text: string, elementId: string): JviRange | null {
  const root = parseTree(text);
  if (!root) return null;

  const index = buildLineIndex(text);
  return findIdInNode(index, root, elementId);
}

function findIdInNode(index: LineIndex, node: Node, targetId: string): JviRange | null {
  if (node.type === 'object' && node.children) {
    for (const prop of node.children) {
      if (
        prop.type === 'property' &&
        prop.children?.[0]?.value === 'id' &&
        prop.children[1]?.type === 'string' &&
        prop.children[1].value === targetId
      ) {
        return nodeToRange(index, prop.children[1]);
      }
    }
    // Recurse into child properties
    for (const prop of node.children) {
      if (prop.children?.[1]) {
        const found = findIdInNode(index, prop.children[1], targetId);
        if (found) return found;
      }
    }
  }
  if (node.type === 'array' && node.children) {
    for (const child of node.children) {
      const found = findIdInNode(index, child, targetId);
      if (found) return found;
    }
  }
  return null;
}
