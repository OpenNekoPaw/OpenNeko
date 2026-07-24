export interface ExternalResearchUrlPolicyInput {
  readonly url: string;
  readonly allowedDomains?: readonly string[];
  readonly blockedDomains?: readonly string[];
}

export interface ExternalResearchUrlPolicyResult {
  readonly ok: boolean;
  readonly url?: URL;
  readonly domain?: string;
  readonly reason?: string;
}

const UNSAFE_SCHEMES = new Set([
  'file:',
  'data:',
  'blob:',
  'javascript:',
  'vscode-webview:',
  'vscode:',
]);

export function validateExternalResearchUrl(
  input: ExternalResearchUrlPolicyInput,
): ExternalResearchUrlPolicyResult {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { ok: false, reason: 'URL must be absolute and valid.' };
  }

  if (
    UNSAFE_SCHEMES.has(parsed.protocol) ||
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
  ) {
    return { ok: false, reason: `Unsupported or unsafe URL scheme: ${parsed.protocol}` };
  }

  const domain = parsed.hostname.toLowerCase();
  if (!domain) {
    return { ok: false, reason: 'URL must include a hostname.' };
  }

  if (isUnsafeHost(domain)) {
    return { ok: false, domain, reason: `Unsafe URL host is not allowed: ${domain}` };
  }

  if (matchesDomainPolicy(domain, input.blockedDomains)) {
    return { ok: false, domain, reason: `URL domain is blocked: ${domain}` };
  }

  if (
    input.allowedDomains &&
    input.allowedDomains.length > 0 &&
    !matchesDomainPolicy(domain, input.allowedDomains)
  ) {
    return { ok: false, domain, reason: `URL domain is not allowed: ${domain}` };
  }

  return { ok: true, url: parsed, domain };
}

function matchesDomainPolicy(domain: string, policy: readonly string[] | undefined): boolean {
  if (!policy || policy.length === 0) return false;
  return policy.some((entry) => matchesDomainEntry(domain, entry.toLowerCase()));
}

function matchesDomainEntry(domain: string, entry: string): boolean {
  if (entry.startsWith('*.')) {
    const base = entry.slice(2);
    return domain === base || domain.endsWith(`.${base}`);
  }
  return domain === entry;
}

function isUnsafeHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  const ipv4 = parseIpv4(host);
  if (ipv4) return isUnsafeIpv4(ipv4);
  if (host === '::1' || host.startsWith('[')) return true;
  return false;
}

function parseIpv4(host: string): readonly [number, number, number, number] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return octets as [number, number, number, number];
}

function isUnsafeIpv4([a, b]: readonly [number, number, number, number]): boolean {
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}
