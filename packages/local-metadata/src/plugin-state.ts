import { LocalMetadataError, type LocalMetadataStore } from './contracts';

export type PluginDeliverySource = 'bundled' | 'local';
export type PluginInstallState = 'installing' | 'installed' | 'invalid';

export interface PluginStateRecord {
  readonly pluginId: string;
  readonly deliverySource: PluginDeliverySource;
  readonly relativeInstallLocator: string | null;
  readonly installState: PluginInstallState;
  readonly enabled: boolean;
  readonly configurationReference: string | null;
}

export interface PluginStateReadDiagnostic {
  readonly code: 'invalid-plugin-state-record';
  readonly pluginId: string;
}

export interface PluginStateListResult {
  readonly records: readonly PluginStateRecord[];
  readonly diagnostics: readonly PluginStateReadDiagnostic[];
}

export interface PluginStateRepository {
  get(pluginId: string): Promise<PluginStateRecord | null>;
  list(): Promise<PluginStateListResult>;
  put(record: PluginStateRecord): Promise<void>;
  setEnabled(pluginId: string, enabled: boolean): Promise<void>;
  setInstallState(pluginId: string, installState: PluginInstallState): Promise<void>;
  remove(pluginId: string): Promise<boolean>;
}

export function createSqlitePluginStateRepository(
  store: LocalMetadataStore,
): PluginStateRepository {
  return new DefaultPluginStateRepository(store);
}

class DefaultPluginStateRepository implements PluginStateRepository {
  constructor(private readonly store: LocalMetadataStore) {}

  async get(pluginId: string): Promise<PluginStateRecord | null> {
    requirePluginId(pluginId);
    const rows = await this.store.transaction(
      { mode: 'read', ownership: 'state', operation: 'read-plugin-state' },
      ({ sql }) => sql.all(`${PLUGIN_STATE_SELECT} WHERE plugin_id = ?`, [pluginId]),
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    if (!row) return null;
    return decodePluginState(row);
  }

  async list(): Promise<PluginStateListResult> {
    const rows = await this.store.transaction(
      { mode: 'read', ownership: 'state', operation: 'list-plugin-state' },
      ({ sql }) => sql.all(`${PLUGIN_STATE_SELECT} ORDER BY plugin_id`),
    );
    const records: PluginStateRecord[] = [];
    const diagnostics: PluginStateReadDiagnostic[] = [];
    for (const row of rows) {
      try {
        records.push(decodePluginState(row));
      } catch {
        diagnostics.push({
          code: 'invalid-plugin-state-record',
          pluginId: readDiagnosticPluginId(row['plugin_id']),
        });
      }
    }
    return Object.freeze({
      records: Object.freeze(records),
      diagnostics: Object.freeze(diagnostics),
    });
  }

  async put(record: PluginStateRecord): Promise<void> {
    assertPluginState(record);
    await this.store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'put-plugin-state' },
      ({ sql }) =>
        sql.run(
          `INSERT INTO plugin_states(
             plugin_id, delivery_source, relative_install_locator,
             install_state, enabled, configuration_reference
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(plugin_id) DO UPDATE SET
             delivery_source = excluded.delivery_source,
             relative_install_locator = excluded.relative_install_locator,
             install_state = excluded.install_state,
             enabled = excluded.enabled,
             configuration_reference = excluded.configuration_reference`,
          [
            record.pluginId,
            record.deliverySource,
            record.relativeInstallLocator,
            record.installState,
            record.enabled ? 1 : 0,
            record.configurationReference,
          ],
        ),
    );
  }

  async setEnabled(pluginId: string, enabled: boolean): Promise<void> {
    requirePluginId(pluginId);
    const result = await this.store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'set-plugin-enabled' },
      ({ sql }) =>
        sql.run('UPDATE plugin_states SET enabled = ? WHERE plugin_id = ?', [
          enabled ? 1 : 0,
          pluginId,
        ]),
    );
    if (result.changes !== 1) throw missingPluginState(pluginId, 'set-plugin-enabled');
  }

  async setInstallState(pluginId: string, installState: PluginInstallState): Promise<void> {
    requirePluginId(pluginId);
    requireInstallState(installState);
    const result = await this.store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'set-plugin-install-state' },
      ({ sql }) =>
        sql.run('UPDATE plugin_states SET install_state = ? WHERE plugin_id = ?', [
          installState,
          pluginId,
        ]),
    );
    if (result.changes !== 1) throw missingPluginState(pluginId, 'set-plugin-install-state');
  }

  async remove(pluginId: string): Promise<boolean> {
    requirePluginId(pluginId);
    const result = await this.store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'remove-plugin-state' },
      ({ sql }) => sql.run('DELETE FROM plugin_states WHERE plugin_id = ?', [pluginId]),
    );
    return result.changes > 0;
  }
}

const PLUGIN_STATE_SELECT = `SELECT plugin_id, delivery_source, relative_install_locator,
                                    install_state, enabled, configuration_reference
                               FROM plugin_states`;

function decodePluginState(row: Readonly<Record<string, unknown>>): PluginStateRecord {
  const pluginId = requirePluginId(row['plugin_id']);
  const deliverySource = requireDeliverySource(row['delivery_source']);
  const relativeInstallLocator = requireNullableString(row['relative_install_locator']);
  const installState = requireInstallState(row['install_state']);
  const enabled = requireStoredBoolean(row['enabled']);
  const configurationReference = requireNullableString(row['configuration_reference']);
  assertLocator(deliverySource, relativeInstallLocator);
  return Object.freeze({
    pluginId,
    deliverySource,
    relativeInstallLocator,
    installState,
    enabled,
    configurationReference,
  });
}

function assertPluginState(record: PluginStateRecord): void {
  requirePluginId(record.pluginId);
  requireDeliverySource(record.deliverySource);
  requireInstallState(record.installState);
  if (typeof record.enabled !== 'boolean') throw new TypeError('Plugin enabled state is invalid.');
  requireNullableString(record.configurationReference);
  assertLocator(record.deliverySource, record.relativeInstallLocator);
}

function assertLocator(source: PluginDeliverySource, locator: string | null): void {
  if (source === 'bundled' && locator !== null) {
    throw new TypeError('Bundled Plugin state cannot contain an install locator.');
  }
  if (source === 'local') {
    if (locator === null || !isPluginId(locator) || locator !== locator.trim()) {
      throw new TypeError('Local Plugin install locator is invalid.');
    }
  }
}

function requirePluginId(value: unknown): string {
  if (!isPluginId(value)) throw new TypeError('Plugin identity is invalid.');
  return value;
}

function isPluginId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/.test(value) &&
    !value.includes('..')
  );
}

function requireDeliverySource(value: unknown): PluginDeliverySource {
  if (value !== 'bundled' && value !== 'local') {
    throw new TypeError('Plugin delivery source is invalid.');
  }
  return value;
}

function requireInstallState(value: unknown): PluginInstallState {
  if (value !== 'installing' && value !== 'installed' && value !== 'invalid') {
    throw new TypeError('Plugin install state is invalid.');
  }
  return value;
}

function requireNullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('Plugin state optional text is invalid.');
  }
  return value;
}

function requireStoredBoolean(value: unknown): boolean {
  if (value === 0 || value === 0n) return false;
  if (value === 1 || value === 1n) return true;
  throw new TypeError('Plugin enabled state is invalid.');
}

function readDiagnosticPluginId(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : '<invalid>';
}

function missingPluginState(pluginId: string, operation: string): LocalMetadataError {
  return new LocalMetadataError({
    code: 'metadata-integrity-failed',
    operation,
    message: `Plugin state '${pluginId}' does not exist.`,
  });
}
