import {
  ProfessionalApplicationContractError,
  parseProfessionalApplicationBinding,
  parseProfessionalApplicationManagementProjection,
  type ProfessionalApplicationBinding,
  type ProfessionalApplicationLaunchReceipt,
  type ProfessionalApplicationManagementProjection,
  type ProfessionalApplicationSelectionReceipt,
} from './index';

export const PROFESSIONAL_APPLICATION_HOST_CHANNEL = 'openneko:professional-applications:execute';

export type ProfessionalApplicationHostRequest =
  | {
      readonly requestId: string;
      readonly identity: { readonly windowId: string };
      readonly route: 'snapshot.get';
    }
  | {
      readonly requestId: string;
      readonly identity: { readonly windowId: string };
      readonly route: 'binding.update';
      readonly binding: ProfessionalApplicationBinding;
    }
  | {
      readonly requestId: string;
      readonly identity: { readonly windowId: string };
      readonly route: 'application.select';
      readonly integrationId: string;
    }
  | {
      readonly requestId: string;
      readonly identity: { readonly windowId: string };
      readonly route: 'application.launch';
      readonly integrationId: string;
    };

export interface ProfessionalApplicationHostResult {
  readonly requestId: string;
  readonly route: ProfessionalApplicationHostRequest['route'];
  readonly projection: ProfessionalApplicationManagementProjection;
  readonly launchReceipt?: ProfessionalApplicationLaunchReceipt;
  readonly selectionReceipt?: ProfessionalApplicationSelectionReceipt;
}

export interface OpenNekoProfessionalApplicationBridge {
  readonly professionalApplications: {
    execute(input: ProfessionalApplicationHostRequest): Promise<ProfessionalApplicationHostResult>;
  };
}

export function createProfessionalApplicationHostRequest(
  input: ProfessionalApplicationHostRequest,
): ProfessionalApplicationHostRequest {
  return parseProfessionalApplicationHostRequest(input);
}

export function parseProfessionalApplicationHostRequest(
  value: unknown,
): ProfessionalApplicationHostRequest {
  const record = recordValue(value, 'Professional application Host request');
  const route = oneOf(
    record['route'],
    ['snapshot.get', 'binding.update', 'application.select', 'application.launch'] as const,
    'Professional application Host route',
  );
  const allowed =
    route === 'snapshot.get'
      ? ['requestId', 'identity', 'route']
      : route === 'binding.update'
        ? ['requestId', 'identity', 'route', 'binding']
        : ['requestId', 'identity', 'route', 'integrationId'];
  exactKeys(record, allowed, 'Professional application Host request');
  const identityRecord = recordValue(record['identity'], 'Professional application Host identity');
  exactKeys(identityRecord, ['windowId'], 'Professional application Host identity');
  const base = {
    requestId: identity(record['requestId'], 'Professional application Host request'),
    identity: {
      windowId: identity(identityRecord['windowId'], 'Professional application Host Window'),
    },
  };
  if (route === 'snapshot.get') return { ...base, route };
  if (route === 'binding.update') {
    return { ...base, route, binding: parseProfessionalApplicationBinding(record['binding']) };
  }
  return {
    ...base,
    route,
    integrationId: identity(record['integrationId'], 'Professional application Host integration'),
  };
}

export function parseProfessionalApplicationHostResult(
  value: unknown,
  expectedRequest: ProfessionalApplicationHostRequest,
): ProfessionalApplicationHostResult {
  const record = recordValue(value, 'Professional application Host result');
  exactKeys(
    record,
    ['requestId', 'route', 'projection', 'launchReceipt', 'selectionReceipt'],
    'Professional application Host result',
  );
  const requestId = identity(record['requestId'], 'Professional application Host result');
  if (requestId !== expectedRequest.requestId || record['route'] !== expectedRequest.route) {
    throw new ProfessionalApplicationContractError(
      'professional-application-request-mismatch',
      'Professional application Host result does not match its request.',
    );
  }
  const projection = parseProfessionalApplicationManagementProjection(record['projection']);
  if (projection.identity.windowId !== expectedRequest.identity.windowId) {
    throw new ProfessionalApplicationContractError(
      'professional-application-request-mismatch',
      'Professional application Host projection does not match its Window.',
    );
  }
  const launchReceipt =
    record['launchReceipt'] === undefined ? undefined : parseLaunchReceipt(record['launchReceipt']);
  const selectionReceipt =
    record['selectionReceipt'] === undefined
      ? undefined
      : parseSelectionReceipt(record['selectionReceipt']);
  if (expectedRequest.route === 'application.launch' && !launchReceipt) {
    invalid('Professional application launch result requires a launch receipt.');
  }
  if (expectedRequest.route !== 'application.launch' && launchReceipt) {
    invalid('Professional application non-launch result must not contain a launch receipt.');
  }
  if (expectedRequest.route === 'application.select' && !selectionReceipt) {
    invalid('Professional application selection result requires a selection receipt.');
  }
  if (expectedRequest.route !== 'application.select' && selectionReceipt) {
    invalid('Professional application non-selection result must not contain a selection receipt.');
  }
  if (
    expectedRequest.route === 'application.select' &&
    selectionReceipt?.integrationId !== expectedRequest.integrationId
  ) {
    throw new ProfessionalApplicationContractError(
      'professional-application-request-mismatch',
      'Professional application selection receipt does not match its request.',
    );
  }
  return {
    requestId,
    route: expectedRequest.route,
    projection,
    ...(launchReceipt ? { launchReceipt } : {}),
    ...(selectionReceipt ? { selectionReceipt } : {}),
  };
}

function parseSelectionReceipt(value: unknown): ProfessionalApplicationSelectionReceipt {
  const record = recordValue(value, 'Professional application selection receipt');
  exactKeys(record, ['integrationId', 'status'], 'Professional application selection receipt');
  return {
    integrationId: identity(record['integrationId'], 'Professional application integration'),
    status: oneOf(
      record['status'],
      ['selected', 'cancelled'] as const,
      'Professional application selection status',
    ),
  };
}

function parseLaunchReceipt(value: unknown): ProfessionalApplicationLaunchReceipt {
  const record = recordValue(value, 'Professional application launch receipt');
  exactKeys(
    record,
    ['integrationId', 'operationId', 'status', 'targetIdentity'],
    'Professional application launch receipt',
  );
  if (record['status'] !== 'launched')
    invalid('Professional application launch status is invalid.');
  return {
    integrationId: identity(record['integrationId'], 'Professional application integration'),
    operationId: identity(record['operationId'], 'Professional application operation'),
    status: 'launched',
    targetIdentity: identity(record['targetIdentity'], 'Professional application target'),
  };
}

function recordValue(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} is invalid.`);
  return value as Readonly<Record<string, unknown>>;
}

function exactKeys(
  record: Readonly<Record<string, unknown>>,
  allowedKeys: readonly string[],
  label: string,
): void {
  const allowed = new Set(allowedKeys);
  const extra = Object.keys(record).filter((key) => !allowed.has(key));
  if (extra.length > 0) invalid(`${label} contains unsupported fields: ${extra.join(', ')}.`);
}

function identity(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  ) {
    invalid(`${label} is invalid.`);
  }
  return value;
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) invalid(`${label} is invalid.`);
  return value as T[number];
}

function invalid(message: string): never {
  throw new ProfessionalApplicationContractError(
    'professional-application-payload-invalid',
    message,
  );
}
