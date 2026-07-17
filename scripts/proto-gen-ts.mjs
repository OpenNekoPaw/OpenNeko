#!/usr/bin/env node
// =============================================================================
// Proto → TS Code Generator
//
// Parses .proto files from packages/neko-proto/ and generates Engine* types
// for @neko/shared. Uses protobufjs parser for AST extraction, custom codegen
// for TS output.
//
// Improvements over v1:
//   1. Content hash (not timestamp) — idempotent output, no spurious diffs
//   2. Enum prefix auto-inference — only style overrides needed
//   3. Proto comments → JSDoc — better IDE experience
//   4. oneof fields → optional TS properties (not skipped)
//   5. Proto file auto-discovery from packages/neko-proto/*.proto
//   6. oneof keys excluded from key constants (backward compat)
//
// Usage: node scripts/proto-gen-ts.mjs
// Output: packages/neko-types/src/generated/*.engine.ts
// =============================================================================

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { format, resolveConfig } from 'prettier';
import protobuf from 'protobufjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PROTO_DIR = resolve(ROOT, 'packages/neko-proto');
const OUT_DIR = resolve(ROOT, 'packages/neko-types/src/generated');

// =============================================================================
// Per-proto overrides — only non-default config needs to be specified
// =============================================================================

/** @type {Record<string, { enumStyleOverrides?: Record<string, string>, keyConstants?: Array<[string, string]>, optionalRepeatedMessages?: string[], nullableFields?: Record<string, string[]> }>} */
const PROTO_CONFIG = {
  'timeline.proto': {
    enumStyleOverrides: {
      BlendMode: 'camelCase',
      EasingType: 'kebab-case',
      TransitionType: 'kebab-case',
      EffectType: 'camelCase',
    },
    keyConstants: [
      ['Element', 'ENGINE_BASE_ELEMENT_KEYS'],
      ['MediaElementData', 'ENGINE_MEDIA_KEYS'],
      ['AudioElementData', 'ENGINE_AUDIO_KEYS'],
      ['TextElementData', 'ENGINE_TEXT_KEYS'],
      ['ShapeElementData', 'ENGINE_SHAPE_KEYS'],
      ['SubtitleElementData', 'ENGINE_SUBTITLE_KEYS'],
      ['Scene3DElementData', 'ENGINE_SCENE3D_KEYS'],
      ['PuppetElementData', 'ENGINE_PUPPET_KEYS'],
      ['Track', 'ENGINE_TRACK_KEYS'],
    ],
  },
  'diff.proto': {
    enumStyleOverrides: {},
    keyConstants: [],
  },
  'scene.proto': {
    enumStyleOverrides: {
      SceneCommandType: 'kebab-case',
      EnvironmentMode: 'kebab-case',
      CameraRefKind: 'camelCase',
      CharacterRegionBindingKind: 'camelCase',
      SelectionKind: 'camelCase',
      SelectionMode: 'lowerCase',
      ViewportRenderMode: 'camelCase',
      ViewportDebugView: 'camelCase',
      ViewportMaterialOverrideKind: 'lowerCase',
      ViewportWorkMode: 'kebab-case',
      H264Container: 'kebab-case',
      H264FrameHeader: 'kebab-case',
      H264InitDataFormat: 'kebab-case',
      AudioCodec: 'kebab-case',
      AudioFrameHeader: 'kebab-case',
      CharacterDataBlockKind: 'kebab-case',
      CharacterOverrideOperation: 'kebab-case',
      CharacterCommandType: 'kebab-case',
      TopologyOperation: 'kebab-case',
      TopologyMigrationStatus: 'kebab-case',
      MigrationKind: 'kebab-case',
      VertexBrushPatchEncoding: 'kebab-case',
    },
    optionalRepeatedMessages: [
      'AssetReferencePatch',
      'HierarchyPatch',
      'SceneDelta',
      'SceneNodeSnapshot',
      'SceneNodePatch',
      'TopologyChangeEvent',
      'ViewportOverlayPatch',
    ],
    nullableFields: {
      SceneDelta: ['environment'],
    },
    keyConstants: [],
  },
};

// =============================================================================
// Proto file auto-discovery
// =============================================================================

/**
 * Discover .proto files and extract package declarations.
 * @returns {Array<{ proto: string, package: string, output: string, enumStyleOverrides: Record<string, string>, keyConstants: Array<[string, string]>, optionalRepeatedMessages: Set<string>, nullableFields: Map<string, Set<string>> }>}
 */
function discoverProtoFiles() {
  const files = readdirSync(PROTO_DIR).filter(f => f.endsWith('.proto')).sort();
  return files.map(proto => {
    const content = readFileSync(resolve(PROTO_DIR, proto), 'utf-8');
    const pkgMatch = content.match(/^package\s+([\w.]+)\s*;/m);
    if (!pkgMatch) {
      console.error(`ERROR: No package declaration in ${proto}`);
      process.exit(1);
    }
    const stem = proto.replace('.proto', '');
    const overrides = PROTO_CONFIG[proto] || {};
    return {
      proto,
      package: pkgMatch[1],
      output: `${stem}.engine.ts`,
      enumStyleOverrides: overrides.enumStyleOverrides || {},
      keyConstants: overrides.keyConstants || [],
      optionalRepeatedMessages: new Set(overrides.optionalRepeatedMessages || []),
      nullableFields: new Map(
        Object.entries(overrides.nullableFields || {}).map(([message, fields]) => [
          message,
          new Set(fields),
        ]),
      ),
    };
  });
}

// =============================================================================
// Proto type → TS type mapping
// =============================================================================

/** @param {string} protoType */
function mapType(protoType) {
  switch (protoType) {
    case 'float': case 'double': case 'int32': case 'int64':
    case 'uint32': case 'uint64': case 'sint32': case 'sint64':
    case 'fixed32': case 'fixed64': case 'sfixed32': case 'sfixed64':
      return 'number';
    case 'string':
      return 'string';
    case 'bool':
      return 'boolean';
    case 'bytes':
      return 'Uint8Array';
    default:
      return `Engine${protoType}`;
  }
}

/** @param {string} protoType */
function isScalarType(protoType) {
  return ['float', 'double', 'int32', 'int64', 'uint32', 'uint64',
    'sint32', 'sint64', 'fixed32', 'fixed64', 'sfixed32', 'sfixed64',
    'string', 'bool', 'bytes'].includes(protoType);
}

// =============================================================================
// snake_case → camelCase (handles digits: point_2d → point2d)
// =============================================================================

/** @param {string} s */
function snakeToCamel(s) {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// =============================================================================
// Enum prefix auto-inference: PascalCase → SCREAMING_SNAKE_
// =============================================================================

/**
 * Infer the SCREAMING_SNAKE prefix from a PascalCase enum name.
 * e.g. BlendMode → BLEND_MODE_, EasingType → EASING_TYPE_
 * @param {string} enumName
 * @returns {string}
 */
function inferEnumPrefix(enumName) {
  return enumName.replace(/([A-Z])/g, '_$1').toUpperCase().slice(1) + '_';
}

// =============================================================================
// SCREAMING_SNAKE → target style conversion
// =============================================================================

/**
 * @param {string} value - e.g. 'COLOR_BURN', 'EASE_IN_QUAD', 'VIDEO'
 * @param {'camelCase' | 'kebab-case' | 'lowerCase'} style
 * @returns {string}
 */
function convertEnumValue(value, style) {
  const parts = value.toLowerCase().split('_');
  switch (style) {
    case 'camelCase':
      return parts[0] + parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1)).join('');
    case 'kebab-case':
      return parts.join('-');
    case 'lowerCase':
      return parts.join('');
    default:
      return parts.join('');
  }
}

// =============================================================================
// Proto comment parser (protobufjs doesn't preserve comments)
// =============================================================================

/**
 * Parse proto source to extract comments for messages and fields.
 * Returns a Map with keys like "MessageName" or "MessageName.field_name".
 * @param {string} source
 * @returns {Map<string, string>}
 */
function parseProtoComments(source) {
  /** @type {Map<string, string>} */
  const comments = new Map();
  const lines = source.split('\n');

  let currentMessage = '';
  let pendingComment = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Collect preceding comment lines
    if (trimmed.startsWith('//') && !trimmed.startsWith('// ====')) {
      pendingComment.push(trimmed.replace(/^\/\/\s?/, ''));
      continue;
    }

    // Message declaration
    const msgMatch = trimmed.match(/^message\s+(\w+)\s*\{/);
    if (msgMatch) {
      if (pendingComment.length > 0) {
        comments.set(msgMatch[1], pendingComment.join('\n'));
      }
      currentMessage = msgMatch[1];
      pendingComment = [];
      continue;
    }

    // Closing brace — exit message scope
    if (trimmed === '}') {
      currentMessage = '';
      pendingComment = [];
      continue;
    }

    // Field declaration inside a message
    if (currentMessage && trimmed.match(/^\w/) && trimmed.includes('=')) {
      // Extract field name (handles: "type field_name = N;" and "repeated type field_name = N;")
      const fieldMatch = trimmed.match(/(?:repeated\s+|optional\s+)?(?:\w+\.?\w*)\s+(\w+)\s*=/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        // Check for inline trailing comment
        const inlineMatch = trimmed.match(/;\s*\/\/\s*(.+)/);

        if (pendingComment.length > 0) {
          const comment = pendingComment.join('\n');
          // Append inline comment if present
          if (inlineMatch) {
            comments.set(`${currentMessage}.${fieldName}`, comment + ' (' + inlineMatch[1].trim() + ')');
          } else {
            comments.set(`${currentMessage}.${fieldName}`, comment);
          }
        } else if (inlineMatch) {
          comments.set(`${currentMessage}.${fieldName}`, inlineMatch[1].trim());
        }
      }
      pendingComment = [];
      continue;
    }

    // Enum field or other non-comment line
    pendingComment = [];
  }

  return comments;
}

/**
 * Format a comment string as JSDoc.
 * @param {string} comment
 * @param {string} indent
 * @returns {string}
 */
function formatJSDoc(comment, indent = '') {
  const lines = comment.split('\n');
  if (lines.length === 1) {
    return `${indent}/** ${lines[0]} */\n`;
  }
  return `${indent}/**\n${lines.map(l => `${indent} * ${l}`).join('\n')}\n${indent} */\n`;
}

// =============================================================================
// AST Processing
// =============================================================================

const MAX_INLINE_GENERATED_LINE_LENGTH = 100;

/**
 * @param {string} tsName
 * @param {string[]} values
 * @returns {string}
 */
function formatUnionType(tsName, values) {
  const inlineValues = values.join(' | ');
  const inline = `export type ${tsName} = ${inlineValues};`;
  return inline.length <= MAX_INLINE_GENERATED_LINE_LENGTH
    ? `${inline}\n`
    : `export type ${tsName} =\n  | ${values.join('\n  | ')};\n`;
}

/**
 * @param {string} constName
 * @param {string[]} values
 * @returns {string}
 */
function formatReadonlyArray(constName, values) {
  const inline = `[${values.join(', ')}]`;
  const fullInline = `export const ${constName} = ${inline} as const;`;
  return fullInline.length <= MAX_INLINE_GENERATED_LINE_LENGTH
    ? `${fullInline}\n`
    : `export const ${constName} = [\n${values.map(value => `  ${value},`).join('\n')}\n] as const;\n`;
}

/**
 * Generate TS enum type union from a protobuf Enum.
 * @param {protobuf.Enum} enumObj
 * @param {Record<string, string>} styleOverrides
 * @param {Set<string>} knownEnums
 * @param {Map<string, string>} commentMap
 * @returns {{ typeDef: string, name: string }}
 */
function generateEnum(enumObj, styleOverrides, knownEnums, commentMap) {
  const prefix = inferEnumPrefix(enumObj.name);
  const style = styleOverrides[enumObj.name] || 'lowerCase';
  const tsName = `Engine${enumObj.name}`;
  knownEnums.add(enumObj.name);

  const values = Object.keys(enumObj.values)
    .filter(v => v !== `${prefix}UNSPECIFIED`)
    .map(v => {
      const stripped = v.startsWith(prefix) ? v.slice(prefix.length) : v;
      return `'${convertEnumValue(stripped, style)}'`;
    });

  const typeDef = formatUnionType(tsName, values);
  return { typeDef, name: tsName };
}

/**
 * Determine if a field should be optional in the generated TS interface.
 * @param {protobuf.Field} field
 * @param {Set<string>} knownEnums
 * @param {boolean} optionalRepeated
 * @returns {boolean}
 */
function isFieldOptional(field, knownEnums, optionalRepeated = false) {
  if (field.repeated && optionalRepeated) return true;
  if (field.options?.proto3_optional) return true;
  if (field.repeated) return false;
  if (!isScalarType(field.type) && !knownEnums.has(field.type)) return true;
  return false;
}

/**
 * Generate TS interface from a protobuf Type (message).
 * oneof fields are included as optional properties.
 * @param {protobuf.Type} msgType
 * @param {Set<string>} knownEnums
 * @param {Map<string, string>} commentMap
 * @param {Set<string>} optionalRepeatedMessages
 * @param {Map<string, Set<string>>} nullableFields
 * @returns {{ interfaceDef: string, name: string, keys: string[], oneofKeys: Set<string> }}
 */
function generateMessage(msgType, knownEnums, commentMap, optionalRepeatedMessages, nullableFields) {
  const tsName = `Engine${msgType.name}`;
  const lines = [];
  const keys = [];
  const optionalRepeated = optionalRepeatedMessages.has(msgType.name);
  /** @type {Set<string>} */
  const oneofKeys = new Set();

  // Collect oneof field names (non-synthetic)
  const oneofFieldNames = new Set();
  if (msgType.oneofs) {
    for (const oneofName of Object.keys(msgType.oneofs)) {
      if (oneofName.startsWith('_')) continue;
      const oneof = msgType.oneofs[oneofName];
      for (const f of oneof.fieldsArray) {
        oneofFieldNames.add(f.name);
      }
    }
  }

  // Regular fields (excluding oneof)
  for (const field of msgType.fieldsArray) {
    if (oneofFieldNames.has(field.name)) continue;

    const camelName = snakeToCamel(field.name);
    const optional = isFieldOptional(field, knownEnums, optionalRepeated);

    let tsType;
    let suffix = '';

    if (field.map) {
      // Map fields: map<keyType, valueType> → Record<K, V>
      const keyType = mapType(field.keyType);
      const valueType = mapType(field.type);
      tsType = `Record<${keyType}, ${valueType}>`;
    } else {
      tsType = mapType(field.type);
      suffix = field.repeated ? '[]' : '';
    }
    if (nullableFields.get(msgType.name)?.has(field.name)) {
      tsType = `${tsType} | null`;
    }

    const opt = optional ? '?' : '';

    // Add JSDoc comment if available
    const comment = commentMap.get(`${msgType.name}.${field.name}`);
    if (comment) {
      lines.push(formatJSDoc(comment, '  ').trimEnd());
    }

    lines.push(`  ${camelName}${opt}: ${tsType}${suffix};`);
    keys.push(camelName);
  }

  // oneof fields as optional properties
  if (msgType.oneofs) {
    for (const oneofName of Object.keys(msgType.oneofs)) {
      if (oneofName.startsWith('_')) continue;
      const oneof = msgType.oneofs[oneofName];
      for (const field of oneof.fieldsArray) {
        const camelName = snakeToCamel(field.name);
        let tsType = mapType(field.type);
        if (nullableFields.get(msgType.name)?.has(field.name)) {
          tsType = `${tsType} | null`;
        }

        const comment = commentMap.get(`${msgType.name}.${field.name}`);
        if (comment) {
          lines.push(formatJSDoc(comment, '  ').trimEnd());
        }

        lines.push(`  ${camelName}?: ${tsType};`);
        keys.push(camelName);
        oneofKeys.add(camelName);
      }
    }
  }

  // Add message-level JSDoc
  const msgComment = commentMap.get(msgType.name);
  let prefix = '';
  if (msgComment) {
    prefix = formatJSDoc(msgComment);
  }

  const interfaceDef = `${prefix}export interface ${tsName} {\n${lines.join('\n')}\n}\n`;
  return { interfaceDef, name: tsName, keys, oneofKeys };
}

/**
 * Generate a readonly key array constant (excludes oneof keys for backward compat).
 * @param {string} constName
 * @param {string[]} keys
 * @returns {string}
 */
function generateKeyConst(constName, keys) {
  const values = keys.map(k => `'${k}'`);
  return formatReadonlyArray(constName, values);
}

/**
 * Join generated sections while preserving exactly one trailing newline.
 * @param {string[]} sections
 * @returns {string}
 */
function formatGeneratedOutput(sections) {
  return sections.join('\n').replace(/\n+$/u, '') + '\n';
}

// =============================================================================
// Process a single proto file
// =============================================================================

/**
 * @param {{ proto: string, package: string, output: string, enumStyleOverrides: Record<string, string>, keyConstants: Array<[string, string]>, optionalRepeatedMessages: Set<string>, nullableFields: Map<string, Set<string>> }} config
 */
async function processProto(config) {
  const protoPath = resolve(PROTO_DIR, config.proto);
  const outPath = resolve(OUT_DIR, config.output);

  console.log(`\n--- ${config.proto} ---`);
  console.log(`  Input:  ${protoPath}`);
  console.log(`  Output: ${outPath}`);

  const protoContent = readFileSync(protoPath, 'utf-8');
  const hash = createHash('sha256').update(protoContent).digest('hex').slice(0, 16);

  // Parse AST
  const root = new protobuf.Root();
  protobuf.parse(protoContent, root, { keepCase: true });

  const pkg = root.lookup(config.package);
  if (!pkg) {
    console.error(`ERROR: Could not find package ${config.package}`);
    process.exit(1);
  }

  // Parse comments from raw source (protobufjs doesn't preserve them)
  const commentMap = parseProtoComments(protoContent);

  /** @type {Set<string>} */
  const knownEnums = new Set();
  const output = [];

  output.push('// =============================================================================');
  output.push('// AUTO-GENERATED — DO NOT EDIT');
  output.push('//');
  output.push(`// Source: packages/neko-proto/${config.proto}`);
  output.push(`// Source hash: ${hash}`);
  output.push('// Command: node scripts/proto-gen-ts.mjs');
  output.push('// =============================================================================');
  output.push('');

  // --- Enums ---
  output.push('// =============================================================================');
  output.push('// Enums');
  output.push('// =============================================================================');
  output.push('');

  for (const child of pkg.nestedArray) {
    if (child instanceof protobuf.Enum) {
      const result = generateEnum(child, config.enumStyleOverrides, knownEnums, commentMap);
      output.push(result.typeDef);
      console.log(`  ✓ Enum: ${result.name}`);
    }
  }

  // --- Messages ---
  output.push('// =============================================================================');
  output.push('// Messages');
  output.push('// =============================================================================');
  output.push('');

  /** @type {Map<string, { keys: string[], oneofKeys: Set<string> }>} */
  const messageInfo = new Map();

  for (const child of pkg.nestedArray) {
    if (child instanceof protobuf.Type) {
      const result = generateMessage(
        child,
        knownEnums,
        commentMap,
        config.optionalRepeatedMessages,
        config.nullableFields,
      );
      output.push(result.interfaceDef);
      messageInfo.set(child.name, { keys: result.keys, oneofKeys: result.oneofKeys });
      console.log(`  ✓ Message: ${result.name} (${result.keys.length} fields, ${result.oneofKeys.size} oneof)`);
    }
  }

  // --- Key constants (oneof keys excluded for backward compat) ---
  if (config.keyConstants && config.keyConstants.length > 0) {
    output.push('// =============================================================================');
    output.push('// Key Constants (for whitelist-based engine field extraction)');
    output.push('// =============================================================================');
    output.push('');

    for (const [msgName, constName] of config.keyConstants) {
      const info = messageInfo.get(msgName);
      if (info) {
        const filteredKeys = info.keys.filter(k => !info.oneofKeys.has(k));
        output.push(generateKeyConst(constName, filteredKeys));
      }
    }
  }

  // --- Write ---
  mkdirSync(dirname(outPath), { recursive: true });
  const generatedOutput = formatGeneratedOutput(output);
  const prettierConfig = await resolveConfig(outPath);
  const formattedOutput = await format(generatedOutput, {
    ...prettierConfig,
    filepath: outPath,
  });
  writeFileSync(outPath, formattedOutput, 'utf-8');
  console.log(`  ✓ Generated ${outPath}`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('Proto → TS Generator');
  console.log(`  Proto dir: ${PROTO_DIR}`);
  console.log(`  Output dir: ${OUT_DIR}`);

  const configs = discoverProtoFiles();
  console.log(`  Discovered: ${configs.map(c => c.proto).join(', ')}`);

  for (const config of configs) {
    await processProto(config);
  }

  console.log(`\n✓ All ${configs.length} proto files processed`);
}

main().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});
