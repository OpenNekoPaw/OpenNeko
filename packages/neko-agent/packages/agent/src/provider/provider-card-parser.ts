import type {
  ProviderCard,
  ProviderCardLayer,
  ProviderConceptEntry,
  ProviderGenerationCapability,
  ProviderInputModalities,
  ProviderSyntaxProfile,
  ProviderTrainingProfile,
  StyleAffinityLevel,
  StyleFamily,
} from '@neko/shared';

const STYLE_FAMILIES: readonly StyleFamily[] = [
  'photorealistic',
  'anime',
  'illustration',
  'concept-art',
  'pixel-art',
  'painting',
  '3d-render',
  'mixed',
];

const CAPABILITIES: readonly ProviderGenerationCapability[] = [
  'image.generate',
  'video.generate',
  'audio.generate',
];

export interface ParseProviderCardOptions {
  readonly sourceLayer: ProviderCardLayer;
  readonly sourceRef?: string;
}

export function parseProviderCardMarkdown(
  markdown: string,
  options: ParseProviderCardOptions,
): ProviderCard {
  const attributes = parseAttributes(markdown);
  const providerId = readRequiredAttribute(attributes, 'providerId');
  const modelId = attributes.get('modelId');
  const displayName =
    attributes.get('displayName') ?? parseTitle(markdown) ?? modelId ?? providerId;
  const version = attributes.get('version') ?? '0.0.0';
  const capabilities = parseCapabilities(attributes.get('capabilities'));
  const inputModalities = parseInputModalities(attributes.get('inputModalities'));

  return {
    providerId,
    ...(modelId ? { modelId } : {}),
    displayName,
    version,
    capabilities,
    ...(inputModalities ? { inputModalities } : {}),
    sourceLayer: options.sourceLayer,
    ...(options.sourceRef ? { sourceRef: options.sourceRef } : {}),
    syntaxProfile: parseSyntaxProfile(markdown),
    conceptCoverage: { entries: parseConceptCoverage(markdown) },
    trainingProfile: parseTrainingProfile(markdown),
    rawMarkdown: markdown,
  };
}

function parseAttributes(markdown: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1];
  if (!frontmatter) return attributes;

  for (const line of frontmatter.split('\n')) {
    const match = /^(\w+):\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    attributes.set(match[1]!, match[2]!.replace(/^['"]|['"]$/g, ''));
  }

  return attributes;
}

function readRequiredAttribute(attributes: Map<string, string>, key: string): string {
  const value = attributes.get(key);
  if (!value) {
    throw new Error(`Provider card is missing required attribute: ${key}`);
  }
  return value;
}

function parseTitle(markdown: string): string | undefined {
  return /^#\s+(.+?)\s*$/m.exec(markdown)?.[1];
}

function parseCapabilities(value: string | undefined): readonly ProviderGenerationCapability[] {
  if (!value) return ['image.generate'];
  const parsed = value
    .replace(/[[\]]/g, '')
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter((entry): entry is ProviderGenerationCapability =>
      CAPABILITIES.includes(entry as ProviderGenerationCapability),
    );
  return parsed.length > 0 ? parsed : ['image.generate'];
}

function parseInputModalities(
  value: string | undefined,
): Partial<ProviderInputModalities> | undefined {
  if (!value) return undefined;

  const result: {
    text?: boolean;
    image?: boolean;
    video?: boolean;
    audio?: boolean | 'realtime-only';
  } = {};
  for (const entry of parseListAttribute(value)) {
    const normalized = entry.toLowerCase();
    if (normalized === 'text') {
      result.text = true;
    } else if (normalized === 'image') {
      result.image = true;
    } else if (normalized === 'video') {
      result.video = true;
    } else if (normalized === 'audio') {
      result.audio = true;
    } else if (
      normalized === 'audio:realtime-only' ||
      normalized === 'audio=realtime-only' ||
      normalized === 'audio.realtime-only'
    ) {
      result.audio = 'realtime-only';
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function parseListAttribute(value: string): readonly string[] {
  return value
    .replace(/[[\]]/g, '')
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function parseSyntaxProfile(markdown: string): ProviderSyntaxProfile {
  const section =
    getSection(markdown, 'Part 1: Syntax Profile') ?? getSection(markdown, 'Syntax Profile');
  const notes = parseBullets(section);
  const supportsNegativePrompt = parseBooleanField(section, 'Supports Negative Prompt');
  const promptTokenLimit = parseNumberField(section, 'prompt');
  const bestPhrasingPattern = parseField(section, 'Best Phrasing Pattern');

  return {
    ...(supportsNegativePrompt !== undefined ? { supportsNegativePrompt } : {}),
    ...(promptTokenLimit !== undefined ? { promptTokenLimit } : {}),
    ...(bestPhrasingPattern ? { bestPhrasingPattern } : {}),
    notes,
  };
}

function parseConceptCoverage(markdown: string): readonly ProviderConceptEntry[] {
  const section =
    getSection(markdown, 'Part 2: Concept Coverage Map') ??
    getSection(markdown, 'Concept Coverage Map');
  if (!section) return [];

  return [
    ...parseConceptLines(getSubsection(section, 'Native'), 'native'),
    ...parseConceptLines(getSubsection(section, 'Partial'), 'partial'),
    ...parseConceptLines(getSubsection(section, 'Unknown'), 'unknown'),
    ...parseConceptLines(getSubsection(section, 'Anti-Patterns'), 'anti-pattern'),
  ];
}

function parseTrainingProfile(markdown: string): ProviderTrainingProfile {
  const section =
    getSection(markdown, 'Part 3: Training Profile') ?? getSection(markdown, 'Training Profile');
  const affinities = parseStyleAffinities(getSubsection(section, 'Style Family Affinity'));

  return {
    ...(parseField(section, 'Default') ? { stylePrior: parseField(section, 'Default') } : {}),
    ...(parseField(section, 'Sweet spot')
      ? { descriptionDensity: parseField(section, 'Sweet spot') }
      : {}),
    styleAffinities: affinities,
    ...(parseField(section, 'Spatial Grounding')
      ? { spatialGrounding: parseField(section, 'Spatial Grounding') }
      : {}),
    antiBiasStrategies: parseBullets(getSubsection(section, 'Anti-Bias Strategies')),
    ...(parseField(section, 'Caption Convention')
      ? { captionConvention: parseField(section, 'Caption Convention') }
      : {}),
  };
}

function getSection(markdown: string, title: string): string | undefined {
  const escaped = escapeRegExp(title);
  const match = new RegExp(`(?:^|\\n)##\\s+${escaped}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`).exec(
    markdown,
  );
  return match?.[1]?.trim();
}

function getSubsection(section: string | undefined, title: string): string | undefined {
  if (!section) return undefined;
  const escaped = escapeRegExp(title);
  const match = new RegExp(`(?:^|\\n)###\\s+${escaped}[^\\n]*\\n([\\s\\S]*?)(?=\\n###\\s+|$)`).exec(
    section,
  );
  return match?.[1]?.trim();
}

function parseBullets(section: string | undefined): readonly string[] {
  if (!section) return [];
  return section
    .split('\n')
    .map((line) => /^[-*]\s+(.+?)\s*$/.exec(line)?.[1])
    .filter((line): line is string => Boolean(line));
}

function parseConceptLines(
  section: string | undefined,
  status: ProviderConceptEntry['status'],
): readonly ProviderConceptEntry[] {
  return parseBullets(section).flatMap((line) => {
    const [conceptPart, expansionPart] = line.split(/\s+→\s+/, 2);
    const concepts = conceptPart!
      .split(/[·,]/)
      .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);

    return concepts.map((concept) => ({
      concept,
      status,
      ...(expansionPart ? { expansion: expansionPart.trim().replace(/^['"]|['"]$/g, '') } : {}),
    }));
  });
}

function parseStyleAffinities(
  section: string | undefined,
): Readonly<Partial<Record<StyleFamily, StyleAffinityLevel>>> {
  const result: Partial<Record<StyleFamily, StyleAffinityLevel>> = {};
  for (const line of parseBullets(section)) {
    const stars = /^([★☆]{3})\s+(.+)$/.exec(line);
    if (!stars) continue;
    const level = Math.min(
      3,
      stars[1]!.split('').filter((char) => char === '★').length,
    ) as StyleAffinityLevel;
    const label = stars[2]!.toLowerCase();
    const styleFamily = STYLE_FAMILIES.find(
      (family) => label.includes(family.replace('-', ' ')) || label.includes(family),
    );
    if (styleFamily) {
      result[styleFamily] = level;
    }
  }
  return result;
}

function parseField(section: string | undefined, name: string): string | undefined {
  if (!section) return undefined;
  const match = new RegExp(`^[-*]?\\s*${escapeRegExp(name)}:\\s*(.+?)\\s*$`, 'im').exec(section);
  return match?.[1]?.trim();
}

function parseBooleanField(section: string | undefined, name: string): boolean | undefined {
  const value = parseField(section, name)?.toLowerCase();
  if (!value) return undefined;
  if (['yes', 'true', 'supported', '支持'].some((entry) => value.includes(entry))) return true;
  if (['no', 'false', 'unsupported', '不支持'].some((entry) => value.includes(entry))) return false;
  return undefined;
}

function parseNumberField(section: string | undefined, name: string): number | undefined {
  const value = parseField(section, name);
  const match = value ? /(\d+)/.exec(value) : undefined;
  return match ? Number(match[1]) : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
