import type { LocalMetadataMigration } from '../contracts';

export const ASSET_LIBRARY_MEMBERSHIP_MIGRATIONS: readonly LocalMetadataMigration[] = [
  {
    namespace: 'asset-library-membership',
    version: 1,
    name: 'persistent-asset-library-membership',
    checksum: 'sha256:persistent-asset-library-membership-v1',
    ownership: 'state',
    destructive: false,
    statements: [
      `CREATE TABLE asset_library_memberships (
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
      `CREATE INDEX asset_library_memberships_active_label_idx
        ON asset_library_memberships(membership_state, label, membership_id)`,
      `CREATE TABLE asset_library_inventory_state (
        inventory_id TEXT PRIMARY KEY NOT NULL CHECK (inventory_id = 'flat-v1'),
        completed_at TEXT NOT NULL
      ) STRICT`,
    ],
  },
];
