import { createHash } from 'node:crypto';

export function digestAutomationInputSchema(schema: Readonly<Record<string, unknown>>): string {
  const canonical = JSON.stringify(canonicalizeJson(schema));
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function canonicalizeJson(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Automation schema contains a non-finite number.');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!isRecord(value)) throw new Error('Automation schema contains a non-JSON value.');

  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    canonical[key] = canonicalizeJson(value[key]);
  }
  return canonical;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
