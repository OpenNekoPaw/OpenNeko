import type { AutomationProfile } from '@neko/automation-contracts';
import type { AutomationMcpArgumentProjector, AutomationMcpResultProjector } from './mcp-provider';

export const CUA_DRIVER_OBSERVE_PROFILE: AutomationProfile = Object.freeze({
  id: 'computer-use.observe.macos',
  provider: Object.freeze({
    extensionId: 'computer-use@openneko',
    providerId: 'cua-driver',
    kind: 'computer',
    deliverySource: Object.freeze({ kind: 'bundled-adapter' as const }),
  }),
  operations: Object.freeze([
    Object.freeze({
      name: 'verify_state',
      requiredInputProperties: Object.freeze(['pid', 'window_id', 'session']),
      modes: Object.freeze(['observe'] as const),
      trait: Object.freeze({
        effect: 'observe' as const,
        readOnly: true,
        destructive: false,
        sensitive: true,
        requiresApproval: false,
      }),
    }),
  ]),
  requiredPermissions: Object.freeze({
    observe: Object.freeze(['screen-recording'] as const),
  }),
});

export const CUA_DRIVER_OBSERVE_TOOL_NAMES = Object.freeze(['verify_state'] as const);

const ALLOWED_VERIFY_STATE_ARGUMENTS = new Set([
  'expect',
  'include_screenshot',
  'stable_samples',
  'timeout_ms',
]);

const mutableCuaDriverArgumentProjector: AutomationMcpArgumentProjector = {
  project({ providerSessionId, target, mode, operation, arguments: args }) {
    if (target.kind !== 'computer' || mode !== 'observe' || operation !== 'verify_state') {
      throw new Error('Cua Driver operation does not match the available Computer profile.');
    }
    const unknownKeys = Object.keys(args).filter((key) => !ALLOWED_VERIFY_STATE_ARGUMENTS.has(key));
    if (unknownKeys.length > 0) {
      throw new Error(
        `Cua Driver verify_state arguments contain unowned fields: ${unknownKeys.sort().join(', ')}.`,
      );
    }
    return Object.freeze({
      ...args,
      pid: target.processId,
      window_id: requireNumericWindowId(target.windowId),
      session: providerSessionId,
    });
  },
};

export const cuaDriverArgumentProjector = Object.freeze(mutableCuaDriverArgumentProjector);

const mutableCuaDriverResultProjector: AutomationMcpResultProjector = {
  project({ operation, result }) {
    const text = result.content
      .filter(
        (item): item is { readonly type: 'text'; readonly text: string } => item.type === 'text',
      )
      .map((item) => item.text)
      .join('\n');
    if (result.isError === true || text.startsWith('Error:')) {
      throw new Error(`Cua Driver operation '${operation}' failed: ${text || 'unknown error'}`);
    }
    const unsupported = result.content.find(
      (item) => item.type !== 'text' && item.type !== 'image',
    );
    if (unsupported) {
      throw new Error(
        `Cua Driver operation '${operation}' returned unsupported ${unsupported.type} content.`,
      );
    }
    const images = result.content.filter(
      (
        item,
      ): item is { readonly type: 'image'; readonly data: string; readonly mimeType: string } =>
        item.type === 'image',
    );
    if (images.length > 1) {
      throw new Error(`Cua Driver operation '${operation}' returned multiple screenshots.`);
    }
    const image = images[0];
    return {
      ...(text.length === 0 ? {} : { text }),
      ...(result.structuredContent === undefined
        ? {}
        : { structuredContent: result.structuredContent }),
      ...(image === undefined ? {} : { observation: projectPngObservation(image) }),
    };
  },
};

export const cuaDriverResultProjector = Object.freeze(mutableCuaDriverResultProjector);

function requireNumericWindowId(value: string): number {
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new Error('Cua Driver requires an exact positive numeric native window identity.');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('Cua Driver native window identity exceeds the safe integer range.');
  }
  return parsed;
}

function projectPngObservation(image: { readonly data: string; readonly mimeType: string }) {
  if (image.mimeType !== 'image/png') throw new Error('Cua Driver screenshot is not PNG.');
  const data = new Uint8Array(Buffer.from(image.data, 'base64'));
  if (
    data.byteLength < 24 ||
    data[0] !== 0x89 ||
    data[1] !== 0x50 ||
    data[2] !== 0x4e ||
    data[3] !== 0x47 ||
    data[12] !== 0x49 ||
    data[13] !== 0x48 ||
    data[14] !== 0x44 ||
    data[15] !== 0x52
  ) {
    throw new Error('Cua Driver screenshot PNG header is invalid.');
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) throw new Error('Cua Driver screenshot dimensions are invalid.');
  return { data, mimeType: image.mimeType, width, height };
}
