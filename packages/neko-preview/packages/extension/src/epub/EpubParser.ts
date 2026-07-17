/**
 * EpubParser — extracts Table of Contents from an EPUB file.
 *
 * Binary EPUB entry reads are injected by Node-host callers. This module only
 * owns the XML parsing and TOC fallback logic.
 */

export interface TocEntry {
  label: string;
  href: string;
  depth: number;
}

export type EpubEntryReader = (entryPath: string) => Promise<ArrayBuffer | Uint8Array | null>;

// =============================================================================
// Public API
// =============================================================================

/** Parse EPUB table-of-contents files using an injected Node entry reader. */
export async function readEpubTocFromEntries(readEntry: EpubEntryReader): Promise<TocEntry[]> {
  const containerXml = await readEntryText(readEntry, 'META-INF/container.xml');
  if (!containerXml) return [];
  const opfPath = /full-path="([^"]+)"/i.exec(containerXml)?.[1];
  if (!opfPath) return [];

  const opfXml = await readEntryText(readEntry, opfPath);
  if (!opfXml) return [];
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  // EPUB3 nav
  const navHref =
    /<item\b[^>]*\bproperties="[^"]*\bnav\b[^"]*"[^>]*\bhref="([^"]+)"/i.exec(opfXml)?.[1] ??
    /<item\b[^>]*\bhref="([^"]+)"[^>]*\bproperties="[^"]*\bnav\b[^"]*"/i.exec(opfXml)?.[1];

  if (navHref) {
    const navXml = await readEntryText(readEntry, opfDir + navHref);
    if (navXml) {
      const entries = parseNavXhtml(navXml);
      if (entries.length > 0) return entries;
    }
  }

  // EPUB2 NCX
  const ncxHref =
    /<item\b[^>]*\bmedia-type="application\/x-dtbncx\+xml"[^>]*\bhref="([^"]+)"/i.exec(
      opfXml,
    )?.[1] ??
    /<item\b[^>]*\bhref="([^"]+)"[^>]*\bmedia-type="application\/x-dtbncx\+xml"/i.exec(opfXml)?.[1];

  if (ncxHref) {
    const ncxXml = await readEntryText(readEntry, opfDir + ncxHref);
    if (ncxXml) {
      const entries = parseNcx(ncxXml);
      if (entries.length > 0) return entries;
    }
  }

  // Spine fallback (no extra reads needed because spine is already in OPF).
  return parseSpine(opfXml, opfDir);
}

// =============================================================================
// EPUB3 nav.xhtml parser
// =============================================================================

function parseNavXhtml(xml: string): TocEntry[] {
  const tocNavMatch = /<nav\b[^>]*epub:type="[^"]*\btoc\b[^"]*"[^>]*>([\s\S]*?)<\/nav>/i.exec(xml);
  const content = tocNavMatch?.[1] ?? xml;

  const entries: TocEntry[] = [];
  const re = /<(li|a)\b([^>]*)>([\s\S]*?)(?=<\/\1>)/gi;
  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    const tag = match[1].toLowerCase();
    if (tag === 'li') {
      depth = countOlDepth(content, match.index);
    } else {
      const hrefMatch = /href="([^"]+)"/.exec(match[2]);
      if (!hrefMatch) continue;
      const label = stripTags(match[3]).trim();
      if (label && hrefMatch[1]) entries.push({ label, href: hrefMatch[1], depth });
    }
  }
  return entries;
}

function countOlDepth(content: string, pos: number): number {
  let opens = 0,
    closes = 0;
  for (let i = 0; i < pos; i++) {
    if (content[i] === '<') {
      const tag = content.slice(i, i + 5).toLowerCase();
      if (tag.startsWith('<ol')) opens++;
      else if (tag.startsWith('</ol')) closes++;
    }
  }
  return Math.max(0, opens - closes - 1);
}

// =============================================================================
// EPUB2 toc.ncx parser
// =============================================================================

function parseNcx(xml: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const stack: number[] = [];
  const re =
    /(<navPoint\b[^>]*>|<\/navPoint>|<text[^>]*>([\s\S]*?)<\/text>|<content\b[^>]*src="([^"]+)")/g;
  let lastLabel = '';
  let match: RegExpExecArray | null;

  while ((match = re.exec(xml)) !== null) {
    const full = match[0];
    if (full.startsWith('<navPoint')) {
      stack.push(0);
    } else if (full.startsWith('</navPoint>')) {
      stack.pop();
    } else if (full.startsWith('<text')) {
      lastLabel = stripTags(match[2] ?? '').trim();
    } else if (match[3]) {
      if (lastLabel) {
        entries.push({ label: lastLabel, href: match[3], depth: Math.max(0, stack.length - 1) });
        lastLabel = '';
      }
    }
  }
  return entries;
}

// =============================================================================
// Spine fallback (uses already-loaded OPF, no extra reads)
// =============================================================================

function parseSpine(opfXml: string, opfDir: string): TocEntry[] {
  const manifest = new Map<string, string>();
  const itemRe = /<item\b[^>]*\bid="([^"]+)"[^>]*\bhref="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(opfXml)) !== null) manifest.set(m[1], m[2]);

  const spineMatch = /<spine\b[^>]*>([\s\S]*?)<\/spine>/i.exec(opfXml);
  if (!spineMatch) return [];

  const entries: TocEntry[] = [];
  const idrefRe = /idref="([^"]+)"/gi;
  let idx = 1;
  while ((m = idrefRe.exec(spineMatch[1])) !== null) {
    const href = manifest.get(m[1]);
    if (href) entries.push({ label: `Section ${idx++}`, href: opfDir + href, depth: 0 });
  }
  return entries;
}

// =============================================================================
// Utilities
// =============================================================================

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

async function readEntryText(
  readEntry: EpubEntryReader,
  entryPath: string,
): Promise<string | null> {
  try {
    const data = await readEntry(entryPath);
    if (!data) return null;
    if (data instanceof ArrayBuffer) {
      return Buffer.from(data).toString('utf8');
    }
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  } catch {
    return null;
  }
}
