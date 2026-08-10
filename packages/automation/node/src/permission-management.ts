import type { AutomationPermission } from '@neko/automation-contracts';
import type {
  AutomationPermissionProjection,
  AutomationPermissionRequestAction,
  AutomationPermissionStatus,
} from '@neko/automation-contracts/permission-management';

const PERMISSIONS = Object.freeze([
  'screen-recording',
  'accessibility',
  'input-control',
] satisfies readonly AutomationPermission[]);

export interface AutomationPermissionManagementHostPort {
  query(permission: AutomationPermission): Promise<Exclude<AutomationPermissionStatus, 'error'>>;
  requestAction(permission: AutomationPermission): AutomationPermissionRequestAction;
  request(permission: AutomationPermission): Promise<void>;
}

export interface AutomationPermissionManagementService {
  list(): Promise<readonly AutomationPermissionProjection[]>;
  request(permission: AutomationPermission): Promise<readonly AutomationPermissionProjection[]>;
}

export function createAutomationPermissionManagementService(
  host: AutomationPermissionManagementHostPort,
): AutomationPermissionManagementService {
  const list = async (): Promise<readonly AutomationPermissionProjection[]> =>
    Object.freeze(
      await Promise.all(
        PERMISSIONS.map(async (permission): Promise<AutomationPermissionProjection> => {
          const requestAction = host.requestAction(permission);
          try {
            return Object.freeze({
              permission,
              status: await host.query(permission),
              requestAction,
              diagnostics: Object.freeze([]),
            });
          } catch {
            return Object.freeze({
              permission,
              status: 'error',
              requestAction,
              diagnostics: Object.freeze(['query-failed'] as const),
            });
          }
        }),
      ),
    );

  return Object.freeze({
    list,
    async request(permission: AutomationPermission) {
      requirePermission(permission);
      if (host.requestAction(permission) === 'unsupported') {
        throw new Error(`Automation permission '${permission}' cannot be requested on this Host.`);
      }
      await host.request(permission);
      return list();
    },
  });
}

function requirePermission(value: string): asserts value is AutomationPermission {
  if (!PERMISSIONS.includes(value as AutomationPermission)) {
    throw new Error(`Automation permission '${value}' is unavailable.`);
  }
}
