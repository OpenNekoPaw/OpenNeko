import { requireExactRecord, requireIdentity } from './codec';
import {
  parseWorldManagementCatalogProjection,
  parseWorldManagementDetailProjection,
  type WorldManagementCatalogProjection,
  type WorldManagementCatalogQuery,
  type WorldManagementDetailProjection,
} from './world-management';

export const WORLD_MANAGEMENT_HOST_CHANNEL = 'neko:world:management' as const;

export type WorldManagementHostRequest =
  | {
      readonly requestId: string;
      readonly operation: 'catalog-get';
      readonly query: WorldManagementCatalogQuery;
    }
  | {
      readonly requestId: string;
      readonly operation: 'detail-get';
      readonly globalWorldId: string;
    };

export type WorldManagementHostResult =
  | {
      readonly requestId: string;
      readonly operation: 'catalog-get';
      readonly catalog: WorldManagementCatalogProjection;
    }
  | {
      readonly requestId: string;
      readonly operation: 'detail-get';
      readonly detail: WorldManagementDetailProjection;
    };

export interface OpenNekoDesktopWorldManagementBridge {
  readonly worldManagement: {
    getCatalog(query: WorldManagementCatalogQuery): Promise<WorldManagementCatalogProjection>;
    getDetail(globalWorldId: string): Promise<WorldManagementDetailProjection>;
  };
}

export function createWorldManagementCatalogRequest(
  requestId: string,
  query: WorldManagementCatalogQuery,
): WorldManagementHostRequest {
  return parseWorldManagementHostRequest({ requestId, operation: 'catalog-get', query });
}

export function createWorldManagementDetailRequest(
  requestId: string,
  globalWorldId: string,
): WorldManagementHostRequest {
  return parseWorldManagementHostRequest({ requestId, operation: 'detail-get', globalWorldId });
}

export function parseWorldManagementHostRequest(value: unknown): WorldManagementHostRequest {
  const record = requireExactRecord(
    value,
    ['requestId', 'operation', 'query', 'globalWorldId'],
    'World management host request',
  );
  const requestId = requireIdentity(record['requestId'], 'World management request identity');
  if (record['operation'] === 'catalog-get') {
    if (record['globalWorldId'] !== undefined) {
      throw new Error('World management catalog request cannot carry GlobalWorld identity.');
    }
    const queryRecord = requireExactRecord(
      record['query'],
      ['search', 'sort'],
      'World management catalog query',
    );
    const parsed = parseWorldManagementCatalogProjection({
      scope: { kind: 'global-catalog' },
      query: queryRecord,
      items: [],
      diagnostics: [],
    });
    return { requestId, operation: 'catalog-get', query: parsed.query };
  }
  if (record['operation'] === 'detail-get') {
    if (record['query'] !== undefined) {
      throw new Error('World management detail request cannot carry catalog query.');
    }
    return {
      requestId,
      operation: 'detail-get',
      globalWorldId: requireIdentity(
        record['globalWorldId'],
        'World management GlobalWorld identity',
      ),
    };
  }
  throw new Error(`Unknown World management operation '${String(record['operation'])}'.`);
}

export function parseWorldManagementHostResult(
  value: unknown,
  expected: WorldManagementHostRequest,
): WorldManagementHostResult {
  const record = requireExactRecord(
    value,
    ['requestId', 'operation', 'catalog', 'detail'],
    'World management host result',
  );
  const requestId = requireIdentity(record['requestId'], 'World management response identity');
  if (requestId !== expected.requestId || record['operation'] !== expected.operation) {
    throw new Error('World management response request or operation identity mismatch.');
  }
  if (expected.operation === 'catalog-get') {
    if (record['detail'] !== undefined) {
      throw new Error('World management catalog response cannot carry detail.');
    }
    return {
      requestId,
      operation: 'catalog-get',
      catalog: parseWorldManagementCatalogProjection(record['catalog']),
    };
  }
  if (record['catalog'] !== undefined) {
    throw new Error('World management detail response cannot carry catalog.');
  }
  const detail = parseWorldManagementDetailProjection(record['detail']);
  if (detail.globalWorldId !== expected.globalWorldId) {
    throw new Error('World management detail response GlobalWorld identity mismatch.');
  }
  return { requestId, operation: 'detail-get', detail };
}
