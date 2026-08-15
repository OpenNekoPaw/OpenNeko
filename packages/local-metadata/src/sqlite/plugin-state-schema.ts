import type { LocalMetadataStore } from '../contracts';
import { initializeLocalMetadataTables } from '../table-initialization';

const PLUGIN_STATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS plugin_states (
    plugin_id TEXT PRIMARY KEY,
    delivery_source TEXT NOT NULL CHECK (delivery_source IN ('bundled', 'local')),
    relative_install_locator TEXT,
    install_state TEXT NOT NULL CHECK (install_state IN ('installing', 'installed', 'invalid')),
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    configuration_reference TEXT,
    CHECK (
      (delivery_source = 'bundled' AND relative_install_locator IS NULL) OR
      (delivery_source = 'local' AND length(relative_install_locator) > 0)
    )
  ) STRICT`,
] as const;

export function initializePluginStateTables(store: LocalMetadataStore): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'state',
    operation: 'initialize-plugin-state-tables',
    statements: PLUGIN_STATE_TABLES,
  });
}
