/**
 * NewAPI Image Model - ImageModelV3 implementation for NewAPI/OneAPI
 *
 * Endpoint routing (per OpenAI / NewAPI image API contract):
 *   - `/v1/images/generations` (JSON)       — text-to-image with no input image
 *   - `/v1/images/edits`       (multipart)  — image editing / inpainting with
 *                                             `image` and optional `mask`
 *
 * Non-standard fields like `control_image`, `ip_adapter_refs`, and
 * `edit_instruction` are accepted only by NewAPI deployments that internally
 * proxy to providers with these capabilities (e.g. Flux on fal.ai). Prompt-only
 * style hints should stay in the prompt for the standard generations endpoint;
 * standard-compliant proxies can reject unknown body keys.
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import type {
  ImageModelV3,
  ImageModelV3CallOptions,
  ImageModelV3ProviderMetadata,
  ImageModelV3Usage,
  SharedV3Warning,
} from '@ai-sdk/provider';
import type { ProviderConfig } from '../../types';

export class NewAPIImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'newapi';
  readonly modelId: string;
  readonly maxImagesPerCall = 4;

  private config: ProviderConfig;

  constructor(modelId: string, config: ProviderConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  async doGenerate(options: ImageModelV3CallOptions): Promise<{
    images: Array<string> | Array<Uint8Array>;
    warnings: Array<SharedV3Warning>;
    providerMetadata?: ImageModelV3ProviderMetadata;
    response: { timestamp: Date; modelId: string; headers: Record<string, string> | undefined };
    usage?: ImageModelV3Usage;
  }> {
    const nekoExtras =
      (options.providerOptions?.['neko'] as Record<string, unknown> | undefined) ?? {};

    // Route image-edit requests (mask or reference image) to /v1/images/edits per
    // the OpenAI/NewAPI spec. Pure text-to-image falls through to generations.
    const hasReferenceBase64 =
      typeof nekoExtras['referenceImageBase64'] === 'string' &&
      (nekoExtras['referenceImageBase64'] as string).length > 0;
    const hasReferenceUrl =
      typeof nekoExtras['referenceImageUrl'] === 'string' &&
      (nekoExtras['referenceImageUrl'] as string).length > 0;
    const hasMask =
      typeof nekoExtras['maskBase64'] === 'string' &&
      (nekoExtras['maskBase64'] as string).length > 0;
    if (hasReferenceBase64 || hasReferenceUrl || hasMask) {
      // The OpenAI/NewAPI edit contract requires a non-empty `image` part. A
      // mask without a source image is unusable — fail fast with a clear error
      // rather than sending an incomplete multipart request that will 4xx.
      if (hasMask && !hasReferenceBase64 && !hasReferenceUrl) {
        throw new Error(
          'NewAPI image edit: maskBase64 was provided without a source image. ' +
            'Supply either `referenceImageBase64` or `referenceImageUrl` alongside the mask.',
        );
      }
      return this.doGenerateEdit(options, nekoExtras);
    }

    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/v1/images/generations`;

    const body: Record<string, unknown> = {
      model: this.modelId,
      prompt: options.prompt,
      n: options.n || 1,
      response_format: 'b64_json',
    };

    if (options.size) {
      body.size = options.size;
    }
    if (options.aspectRatio) {
      body.aspect_ratio = options.aspectRatio;
    }

    // Forward ControlNet / IP-Adapter / edit fields from providerOptions.neko.
    // These are non-standard extensions — NewAPI deployments that proxy to
    // capable backends (Flux/fal.ai) will honor them; spec-compliant proxies
    // will ignore unknown body keys.
    // Normalize a bare base64 string (or data URL) into a `data:` URL so
    // downstream services don't have to guess the MIME.
    const toDataUrl = (value: string, mimeDefault = 'image/png'): string =>
      value.startsWith('data:') || value.startsWith('http')
        ? value
        : `data:${mimeDefault};base64,${value}`;

    if (nekoExtras['negativePrompt'] !== undefined)
      body.negative_prompt = nekoExtras['negativePrompt'];
    if (nekoExtras['controlImageBase64'] !== undefined)
      body.control_image = toDataUrl(nekoExtras['controlImageBase64'] as string);
    if (nekoExtras['controlMode'] !== undefined) body.control_mode = nekoExtras['controlMode'];
    if (nekoExtras['controlStrength'] !== undefined)
      body.control_strength = nekoExtras['controlStrength'];
    if (nekoExtras['ipAdapterRefs'] !== undefined) {
      // Convert nested camelCase → snake_case and wrap base64 as data URL so
      // downstream OpenAI-compatible image endpoints receive a consistent shape.
      const refs = nekoExtras['ipAdapterRefs'] as Array<{
        imageBase64?: string;
        mimeType?: string;
        strength?: number;
        mode?: string;
      }>;
      body.ip_adapter_refs = refs
        .filter((r) => !!r?.imageBase64)
        .map((r) => {
          const mime = r.mimeType ?? 'image/png';
          const entry: Record<string, unknown> = {
            image: `data:${mime};base64,${r.imageBase64}`,
          };
          if (r.strength != null) entry.scale = r.strength;
          if (r.mode) entry.mode = r.mode;
          return entry;
        });
    }
    // Note: referenceImageBase64, referenceImageUrl, and maskBase64 are NOT
    // attached here — edit/inpaint requests are routed to /v1/images/edits
    // via doGenerateEdit() above.
    if (nekoExtras['inpaintStrength'] !== undefined)
      body.inpaint_strength = nekoExtras['inpaintStrength'];
    if (nekoExtras['editInstruction'] !== undefined)
      body.edit_instruction = nekoExtras['editInstruction'];
    const quality = normalizeNewAPIImageQuality(nekoExtras['quality'], this.modelId);
    if (quality !== undefined) body.quality = quality;

    const response = await fetchNewAPIImageResponse(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          ...(options.headers as Record<string, string>),
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      },
      options.abortSignal,
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`NewAPI image generation failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      created: number;
      data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
    };

    const images = await materializeNewAPIImageResults(
      data.data,
      createSameOriginDownloadAuthorization(url, this.config.apiKey),
      options.abortSignal,
    );

    return {
      images,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
    };
  }

  /**
   * Image editing / inpainting via POST /v1/images/edits (multipart/form-data).
   *
   * Standard OpenAI/NewAPI contract fields:
   *   - image  (required, binary) : source image to edit
   *   - mask   (optional, binary) : transparency mask where white = edit area
   *   - prompt (required)         : text description of the desired edit
   *   - n, size, model            : standard generation params
   *
   * Non-standard fields forwarded as extra form parts (ignored by spec-compliant
   * proxies; honored by NewAPI deployments routing to capable backends):
   *   - inpaint_strength, style, edit_instruction, negative_prompt
   *   - control_image / control_mode / control_strength
   *   - ip_adapter_refs (JSON-serialized)
   */
  private async doGenerateEdit(
    options: ImageModelV3CallOptions,
    nekoExtras: Record<string, unknown>,
  ): Promise<{
    images: Array<string> | Array<Uint8Array>;
    warnings: Array<SharedV3Warning>;
    providerMetadata?: ImageModelV3ProviderMetadata;
    response: { timestamp: Date; modelId: string; headers: Record<string, string> | undefined };
    usage?: ImageModelV3Usage;
  }> {
    const url = `${this.getBaseUrl()}/v1/images/edits`;

    const form = new FormData();
    form.append('model', this.modelId);
    form.append('prompt', options.prompt ?? '');
    form.append('response_format', 'b64_json');
    if (options.n) form.append('n', String(options.n));
    if (options.size) form.append('size', options.size);
    const quality = normalizeNewAPIImageQuality(nekoExtras['quality'], this.modelId);
    if (quality !== undefined) form.append('quality', String(quality));

    // Attach source image. Accepts base64, data URL, or remote URL (downloaded).
    const referenceImageBase64 = nekoExtras['referenceImageBase64'] as string | undefined;
    const referenceImageUrl = nekoExtras['referenceImageUrl'] as string | undefined;
    if (referenceImageBase64) {
      const { bytes, mimeType } = decodeBase64OrDataUrl(referenceImageBase64);
      form.append('image', new Blob([bytes], { type: mimeType }), `image.${extFromMime(mimeType)}`);
    } else if (referenceImageUrl) {
      const fetched = await fetchBinary(referenceImageUrl, options.abortSignal);
      if (!fetched) {
        throw new Error(
          `NewAPI image edit: failed to download referenceImageUrl (${referenceImageUrl}).`,
        );
      }
      form.append(
        'image',
        new Blob([fetched.bytes], { type: fetched.mimeType }),
        `image.${extFromMime(fetched.mimeType)}`,
      );
    }

    // Attach mask. Neko's internal contract is a grayscale PNG where white =
    // repaint, but the OpenAI/NewAPI `/v1/images/edits` spec uses RGBA where
    // *transparent* pixels mark the edit region. Convert here so spec-compliant
    // backends see the correct area. If conversion fails (e.g. `sharp` cannot
    // be resolved at runtime), throw loudly — uploading the raw grayscale
    // bytes would silently produce wrong inpaint regions, and "fail loudly"
    // is easier to diagnose than "wrong output".
    const maskBase64 = nekoExtras['maskBase64'] as string | undefined;
    if (maskBase64) {
      const { bytes: rawBytes } = decodeBase64OrDataUrl(maskBase64);
      const convertResult = await grayscaleMaskToTransparentPng(rawBytes);
      if (convertResult.ok === false) {
        throw new Error(
          `NewAPI image edit: failed to convert grayscale mask to the OpenAI ` +
            `transparent-alpha format (${convertResult.reason}). ` +
            `Ensure the 'sharp' package is resolvable in the Node runtime; ` +
            `uploading the raw grayscale would produce incorrect inpaint regions.`,
        );
      }
      form.append('mask', new Blob([convertResult.bytes], { type: 'image/png' }), 'mask.png');
    }

    // Forward non-standard enhancement fields as extra form parts so NewAPI
    // deployments with capable backends (fal.ai Flux, replicate) keep working.
    // Spec-compliant proxies will silently drop unknown parts.
    const appendStringPart = (name: string, value: unknown): void => {
      if (value === undefined || value === null) return;
      form.append(name, String(value));
    };
    appendStringPart('negative_prompt', nekoExtras['negativePrompt']);
    appendStringPart('inpaint_strength', nekoExtras['inpaintStrength']);
    appendStringPart('edit_instruction', nekoExtras['editInstruction']);
    appendStringPart('style', nekoExtras['style']);
    appendStringPart('control_mode', nekoExtras['controlMode']);
    appendStringPart('control_strength', nekoExtras['controlStrength']);

    const controlImageBase64 = nekoExtras['controlImageBase64'] as string | undefined;
    if (controlImageBase64) {
      const { bytes, mimeType } = decodeBase64OrDataUrl(controlImageBase64);
      form.append(
        'control_image',
        new Blob([bytes], { type: mimeType }),
        `control.${extFromMime(mimeType)}`,
      );
    }

    const ipAdapterRefs = nekoExtras['ipAdapterRefs'] as
      | Array<{ imageBase64?: string; mimeType?: string; strength?: number; mode?: string }>
      | undefined;
    if (ipAdapterRefs?.length) {
      // Serialize refs as a JSON string part with inlined data URLs so backends
      // can parse a single field regardless of multipart parser quirks.
      const serialized = ipAdapterRefs
        .filter((r) => !!r?.imageBase64)
        .map((r) => {
          const mime = r.mimeType ?? 'image/png';
          const entry: Record<string, unknown> = {
            image: `data:${mime};base64,${r.imageBase64}`,
          };
          if (r.strength != null) entry.scale = r.strength;
          if (r.mode) entry.mode = r.mode;
          return entry;
        });
      form.append('ip_adapter_refs', JSON.stringify(serialized));
    }

    const response = await fetchNewAPIImageResponse(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          ...(options.headers as Record<string, string>),
        },
        // Do not set Content-Type — fetch populates it with the multipart boundary.
        body: form,
        signal: options.abortSignal,
      },
      options.abortSignal,
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`NewAPI image edit failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      created: number;
      data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
    };

    const images = await materializeNewAPIImageResults(
      data.data,
      createSameOriginDownloadAuthorization(url, this.config.apiKey),
      options.abortSignal,
    );
    return {
      images,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
    };
  }

  private getBaseUrl(): string {
    let base = this.config.apiUrl.replace(/\/+$/, '');
    base = base.replace(/\/v1$/, '');
    return base;
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Decode a bare base64 string or `data:` URL into raw bytes + MIME. */
function decodeBase64OrDataUrl(input: string): { bytes: Uint8Array; mimeType: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(input);
  if (match) {
    return { bytes: Buffer.from(match[2] ?? '', 'base64'), mimeType: match[1] ?? 'image/png' };
  }
  return { bytes: Buffer.from(input, 'base64'), mimeType: 'image/png' };
}

function normalizeNewAPIImageQuality(value: unknown, modelId: string): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  if (!modelId.startsWith('gpt-image-')) return value;
  switch (value) {
    case 'hd':
      return 'high';
    case 'standard':
      return 'auto';
    default:
      return value;
  }
}

const AMBIGUOUS_IMAGE_SUBMISSION_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

async function fetchNewAPIImageResponse(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (signal?.aborted || readErrorName(error) === 'AbortError') throw error;
    const transportCode = readNestedErrorCode(error);
    if (!transportCode || !AMBIGUOUS_IMAGE_SUBMISSION_CODES.has(transportCode)) throw error;

    throw Object.assign(
      new Error(
        'NewAPI image generation connection closed after submission; the provider outcome is unknown and the image may already have been generated or charged. This operation must not be retried automatically. Check the gateway RELAY_TIMEOUT or use a provider task API with recoverable result identity.',
      ),
      {
        cause: error,
        code: 'NEWAPI_IMAGE_OUTCOME_UNKNOWN',
        isRetryable: false,
      },
    );
  }
}

async function materializeNewAPIImageResults(
  items: Array<{ url?: string; b64_json?: string }>,
  downloadAuthorization: SameOriginDownloadAuthorization,
  signal?: AbortSignal,
): Promise<Uint8Array[]> {
  if (items.length === 0) {
    throw new Error('NewAPI image generation returned no image results.');
  }

  return Promise.all(
    items.map(async (item, index) => {
      if (item.b64_json) {
        const bytes = decodeBase64OrDataUrl(item.b64_json).bytes;
        if (bytes.byteLength === 0) {
          throw new Error(`NewAPI image result ${index} contains empty base64 data.`);
        }
        return bytes;
      }

      if (item.url) {
        const downloaded = await fetchBinary(item.url, signal, downloadAuthorization);
        if (downloaded) return downloaded.bytes;
        throw new Error(
          `NewAPI image result ${index} could not be downloaded from ${safeUrlOrigin(item.url)}.`,
        );
      }

      throw new Error(`NewAPI image result ${index} has neither b64_json nor url.`);
    }),
  );
}

interface SameOriginDownloadAuthorization {
  readonly origin: string;
  readonly authorization: string;
}

function createSameOriginDownloadAuthorization(
  requestUrl: string,
  apiKey: string,
): SameOriginDownloadAuthorization {
  return {
    origin: new URL(requestUrl).origin,
    authorization: `Bearer ${apiKey}`,
  };
}

function safeUrlOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return '<invalid-url>';
  }
}

function readErrorName(error: unknown): string | undefined {
  return readErrorString(error, 'name');
}

function readNestedErrorCode(error: unknown): string | undefined {
  return readErrorString(error, 'code') ?? readErrorString(readErrorField(error, 'cause'), 'code');
}

function readErrorString(error: unknown, key: string): string | undefined {
  const value = readErrorField(error, key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readErrorField(error: unknown, key: string): unknown {
  if ((typeof error !== 'object' && typeof error !== 'function') || error === null) {
    return undefined;
  }
  try {
    return Reflect.get(error, key) as unknown;
  } catch {
    return undefined;
  }
}

/** Maximum bytes accepted from a remote image download (20 MB). */
const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * Check whether an IP address literal (IPv4 or IPv6) refers to a
 * private / loopback / link-local / unique-local range.
 */
function isAddressPrivate(address: string): boolean {
  const lower = address.toLowerCase();

  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) {
    if (lower === '0.0.0.0') return true;
    if (/^0\./.test(lower)) return true; // 0.0.0.0/8 — "this network"
    if (/^127\./.test(lower)) return true; // loopback
    if (/^10\./.test(lower)) return true; // private
    if (/^192\.168\./.test(lower)) return true; // private
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(lower)) return true; // private
    if (/^169\.254\./.test(lower)) return true; // link-local
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(lower)) return true; // 100.64.0.0/10 CGNAT
    return false;
  }

  // IPv6 loopback / unspecified (both full and shorthand forms)
  if (
    lower === '::1' ||
    lower === '::' ||
    lower === '0:0:0:0:0:0:0:1' ||
    lower === '0:0:0:0:0:0:0:0'
  ) {
    return true;
  }
  // Link-local fe80::/10 — first segment falls in fe80..febf
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) return true;
  // Unique-local fc00::/7 — first segment starts with fc** or fd**
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true;

  // IPv4-mapped IPv6 — Node may normalize to either form:
  //   Form A (dotted-decimal tail):  ::ffff:10.0.0.1
  //   Form B (hex groups):           ::ffff:a00:1   (Node default for URL hosts)
  const mappedDotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(lower);
  if (mappedDotted && mappedDotted[1]) return isAddressPrivate(mappedDotted[1]);
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(lower);
  if (mappedHex) {
    const g1 = parseInt(mappedHex[1] ?? '0', 16);
    const g2 = parseInt(mappedHex[2] ?? '0', 16);
    const ipv4 = `${(g1 >> 8) & 0xff}.${g1 & 0xff}.${(g2 >> 8) & 0xff}.${g2 & 0xff}`;
    return isAddressPrivate(ipv4);
  }

  return false;
}

/**
 * Validate a remote URL before fetching to reduce SSRF / resource-exhaustion
 * risk. Performs scheme check + DNS resolution so a public-looking domain
 * that secretly resolves to a private address is rejected (hostname-only
 * string filters are trivially bypassable by attacker-controlled DNS).
 *
 * This is the outer check; the TOCTOU window between this validation and
 * the TCP connect is closed by `createSafeDispatcher()`, which installs a
 * custom `lookup` that re-validates the resolved IP at socket-connect time.
 */
async function assertRemoteUrlSafe(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Refusing to fetch non-http(s) URL: ${parsed.protocol}`);
  }
  const rawHost = parsed.hostname;
  if (!rawHost) {
    throw new Error(`URL has no hostname: ${rawUrl}`);
  }
  // WHATWG URL in Node returns IPv6 hostnames wrapped in `[...]` — strip them
  // so downstream matching works on the bare address form. This also defends
  // against `URL.hostname` implementations that leave the brackets attached.
  const host = rawHost.startsWith('[') && rawHost.endsWith(']') ? rawHost.slice(1, -1) : rawHost;

  const isIPv4Literal = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  // An IPv6 literal contains at least one colon. Domain names / IPv4 never do.
  const isIPv6Literal = host.includes(':');

  if (isIPv4Literal || isIPv6Literal) {
    if (isAddressPrivate(host)) {
      throw new Error(`Refusing to fetch from private/internal address: ${host}`);
    }
    return parsed;
  }

  // Bare hostnames (no dot, no colon) usually resolve via local /etc/hosts or
  // container service discovery — reject.
  if (!host.includes('.')) {
    throw new Error(`Refusing to fetch from bare hostname: ${host}`);
  }

  // Resolve all A/AAAA records and validate each against private ranges.
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dnsLookup(host, { all: true });
  } catch {
    throw new Error(`DNS lookup failed for host: ${host}`);
  }
  if (addresses.length === 0) {
    throw new Error(`No addresses resolved for host: ${host}`);
  }
  for (const { address } of addresses) {
    if (isAddressPrivate(address)) {
      throw new Error(`Host ${host} resolves to private/internal address: ${address}`);
    }
  }
  return parsed;
}

/** Maximum number of HTTP redirects to follow. */
const MAX_REDIRECTS = 5;

/**
 * Build an undici `Dispatcher` whose TCP-level `lookup` forbids resolving to
 * any private/loopback/link-local address — effectively closing the DNS
 * rebinding / TOCTOU window between URL validation and socket connection.
 *
 * Returns undefined if `undici` is not resolvable (non-Node runtime, unusual
 * bundler). In that case the caller falls back to the pre-fetch DNS check,
 * which is still safer than no validation but leaves the TOCTOU gap open.
 */
/**
 * Shape of an undici-like dispatcher that we care about: it's usable as a
 * `fetch({ dispatcher })` option and exposes `close()` / `destroy()` so we
 * can release its keep-alive connections when done.
 */
interface CloseableDispatcher {
  close(): Promise<void>;
  destroy(): Promise<void>;
}

async function createSafeDispatcher(): Promise<CloseableDispatcher | undefined> {
  try {
    const undiciModule = (await import('undici')) as {
      Agent: new (opts: {
        connect: {
          lookup: (
            hostname: string,
            options: unknown,
            callback: (err: Error | null, address?: string, family?: number) => void,
          ) => void;
        };
      }) => CloseableDispatcher;
    };
    const { Agent } = undiciModule;
    return new Agent({
      connect: {
        lookup: (hostname, _options, callback) => {
          dnsLookup(hostname, { all: true })
            .then((addresses) => {
              for (const { address } of addresses) {
                if (isAddressPrivate(address)) {
                  callback(new Error(`Host ${hostname} resolves to private address: ${address}`));
                  return;
                }
              }
              const first = addresses[0];
              if (first) {
                callback(null, first.address, first.family);
              } else {
                callback(new Error(`No addresses resolved for host: ${hostname}`));
              }
            })
            .catch((err: unknown) => callback(err instanceof Error ? err : new Error(String(err))));
        },
      },
    });
  } catch {
    return undefined;
  }
}

/**
 * Best-effort release of an undici dispatcher. Tries `close()` for a graceful
 * shutdown (lets in-flight requests finish), falls back to `destroy()` if
 * close fails. Swallows errors — cleanup must never mask the original result.
 */
async function releaseDispatcher(dispatcher: CloseableDispatcher): Promise<void> {
  try {
    await dispatcher.close();
  } catch {
    try {
      await dispatcher.destroy();
    } catch {
      // ignore — nothing more we can do
    }
  }
}

/**
 * Download a remote URL into bytes + MIME with SSRF / size / MIME guards.
 *
 * Security layers (defence in depth):
 *   1. Pre-fetch `assertRemoteUrlSafe()` — cheap string + DNS validation.
 *   2. Per-hop re-validation during manual redirect walk.
 *   3. Undici dispatcher pins the DNS lookup at socket-connect time so even
 *      an attacker-controlled authoritative server that rebinds between
 *      validation and connection cannot redirect the socket to a private IP.
 *
 * Returns undefined on transport failure; throws on policy rejection so the
 * caller can distinguish "remote 404" from "refused by client".
 */
async function fetchBinary(
  url: string,
  signal?: AbortSignal,
  authorization?: SameOriginDownloadAuthorization,
): Promise<{ bytes: Uint8Array; mimeType: string } | undefined> {
  const dispatcher = await createSafeDispatcher();
  try {
    return await fetchBinaryWithDispatcher(url, signal, dispatcher, authorization);
  } finally {
    // Release keep-alive connections held by the per-download Agent. Creating
    // a fresh Agent per call keeps the TOCTOU closure (each lookup callback
    // is tied to this request) but without explicit cleanup each downloaded
    // reference image would leak sockets and FDs over long sessions.
    if (dispatcher) {
      await releaseDispatcher(dispatcher);
    }
  }
}

/**
 * Best-effort release of a fetched `Response`'s body. Undici requires the
 * body to be either consumed or cancelled — otherwise the underlying socket
 * stays pinned and can stall / deadlock subsequent requests on the same
 * dispatcher. Every early-return / throw path in `fetchBinaryWithDispatcher`
 * must route through this helper.
 */
async function discardBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // ignore — already aborted or never opened
  }
}

async function fetchBinaryWithDispatcher(
  url: string,
  signal: AbortSignal | undefined,
  dispatcher: CloseableDispatcher | undefined,
  authorization?: SameOriginDownloadAuthorization,
): Promise<{ bytes: Uint8Array; mimeType: string } | undefined> {
  let currentUrl = url;
  let res: Response | undefined;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertRemoteUrlSafe(currentUrl);
    try {
      const headers =
        authorization && new URL(currentUrl).origin === authorization.origin
          ? { Authorization: authorization.authorization }
          : undefined;
      res = await fetch(
        currentUrl,
        dispatcher
          ? // `dispatcher` is an undici-specific option recognized by Node's
            // built-in fetch. Typed as `any` because the stdlib `RequestInit`
            // does not declare it.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({ signal, redirect: 'manual', dispatcher, headers } as any)
          : { signal, redirect: 'manual', headers },
      );
    } catch {
      return undefined;
    }
    if (res.status >= 300 && res.status < 400 && res.status !== 304) {
      // Drain the redirect response body — undici keeps the socket pinned
      // until the body is consumed or cancelled, even for 3xx hops.
      await discardBody(res);
      const location = res.headers.get('location');
      if (!location) return undefined;
      // Resolve relative `Location` values against the current URL.
      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).href;
      } catch {
        throw new Error(`Invalid redirect Location header: ${location}`);
      }
      if (hop === MAX_REDIRECTS) {
        throw new Error(`Too many redirects (> ${MAX_REDIRECTS}) starting at ${url}`);
      }
      currentUrl = nextUrl;
      continue;
    }
    break;
  }
  if (!res) return undefined;
  if (!res.ok) {
    await discardBody(res);
    return undefined;
  }

  // Require explicit, image-typed Content-Type. An absent or non-image
  // response must not be silently treated as a PNG — that would let any
  // endpoint be smuggled through as "image bytes".
  const contentTypeHeader = res.headers.get('content-type');
  if (!contentTypeHeader) {
    await discardBody(res);
    throw new Error('Refusing response without Content-Type header');
  }
  const mimeType = contentTypeHeader.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!mimeType.startsWith('image/')) {
    await discardBody(res);
    throw new Error(`Refusing non-image response (content-type: ${contentTypeHeader})`);
  }

  const declaredLength = Number(res.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_IMAGE_BYTES) {
    await discardBody(res);
    throw new Error(
      `Remote image exceeds max size (${declaredLength} > ${MAX_REMOTE_IMAGE_BYTES} bytes)`,
    );
  }

  // Stream-read with running size cap in case content-length is absent / lies.
  const reader = res.body?.getReader();
  if (!reader) {
    // No readable stream: fall back to arrayBuffer(), which itself consumes
    // the body. Still enforce the size cap on the collected buffer.
    let buffer: ArrayBuffer;
    try {
      buffer = await res.arrayBuffer();
    } catch {
      return undefined;
    }
    if (buffer.byteLength > MAX_REMOTE_IMAGE_BYTES) {
      throw new Error(`Remote image exceeds max size (${buffer.byteLength} bytes)`);
    }
    return { bytes: new Uint8Array(buffer), mimeType };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_REMOTE_IMAGE_BYTES) {
        // cancel() releases the reader's grip and tears down the underlying
        // socket so the dispatcher can be closed cleanly downstream.
        await reader.cancel().catch(() => undefined);
        throw new Error(`Remote image exceeds max size (> ${MAX_REMOTE_IMAGE_BYTES} bytes)`);
      }
      chunks.push(value);
    }
  } catch (err) {
    // Any error during streaming: ensure the reader is released before rethrow.
    await reader.cancel().catch(() => undefined);
    throw err;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes: merged, mimeType };
}

type MaskConvertResult = { ok: true; bytes: Uint8Array } | { ok: false; reason: string };

/**
 * Convert a grayscale mask PNG (Neko convention: white = repaint, black =
 * keep) to an RGBA PNG where white pixels become transparent, matching the
 * OpenAI `/v1/images/edits` contract.
 *
 * Uses `sharp` dynamically. On failure returns a structured result so the
 * caller can surface a diagnostic error instead of silently falling back
 * to the wrong mask semantics.
 */
async function grayscaleMaskToTransparentPng(input: Uint8Array): Promise<MaskConvertResult> {
  let sharpModule: { default: (buf: Uint8Array) => unknown } | undefined;
  try {
    sharpModule = (await import('sharp')) as {
      default: (buf: Uint8Array) => unknown;
    };
  } catch (err) {
    return {
      ok: false,
      reason: `'sharp' could not be loaded: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!sharpModule?.default) {
    return { ok: false, reason: "'sharp' module resolved but has no default export" };
  }
  const sharp = sharpModule.default;

  try {
    // Decode to raw RGBA, build alpha = 255 - luminance, re-encode PNG.
    const pipeline = sharp(input) as {
      ensureAlpha: () => {
        raw: () => {
          toBuffer: (options: { resolveWithObject: true }) => Promise<{
            data: Buffer;
            info: { width: number; height: number; channels: number };
          }>;
        };
      };
    };
    const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      // Rec. 601 luminance; "white" pixels (high luminance) → alpha 0 (edit area).
      const luminance = (r * 299 + g * 587 + b * 114) / 1000;
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = Math.max(0, Math.min(255, Math.round(255 - luminance)));
    }

    const sharpEncoder = sharpModule as unknown as {
      default: (
        input: Buffer,
        opts: { raw: { width: number; height: number; channels: number } },
      ) => { png: () => { toBuffer: () => Promise<Buffer> } };
    };
    const png = await sharpEncoder
      .default(out, {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
      .png()
      .toBuffer();
    return { ok: true, bytes: new Uint8Array(png) };
  } catch (err) {
    return {
      ok: false,
      reason: `mask conversion failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** File extension hint derived from MIME type for multipart filename. */
function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/bmp':
      return 'bmp';
    case 'image/avif':
      return 'avif';
    default:
      return 'png';
  }
}
