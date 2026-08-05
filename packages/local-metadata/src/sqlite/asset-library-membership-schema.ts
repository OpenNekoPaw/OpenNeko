import type { LocalMetadataStore } from '../contracts';
import { initializeLocalMetadataTables } from '../table-initialization';

const ASSET_LIBRARY_MEMBERSHIP_TABLES = [
  `CREATE TABLE IF NOT EXISTS asset_library_memberships (
    membership_id TEXT PRIMARY KEY NOT NULL,
    source_relative_path TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    media_type TEXT,
    byte_length INTEGER CHECK (byte_length IS NULL OR byte_length >= 0),
    modified_at TEXT,
    membership_state TEXT NOT NULL CHECK (membership_state IN ('active', 'removed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS asset_library_memberships_active_label_idx
    ON asset_library_memberships(membership_state, label, membership_id)`,
  `CREATE TABLE IF NOT EXISTS asset_library_inventory_state (
    inventory_id TEXT PRIMARY KEY NOT NULL CHECK (inventory_id = 'flat-v1'),
    completed_at TEXT NOT NULL
  ) STRICT`,
] as const;

export function initializeAssetLibraryMembershipTables(store: LocalMetadataStore): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'state',
    operation: 'initialize-asset-library-membership-tables',
    statements: ASSET_LIBRARY_MEMBERSHIP_TABLES,
  });
}
