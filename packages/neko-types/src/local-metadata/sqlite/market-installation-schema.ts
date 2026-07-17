import type { LocalMetadataMigration } from '../contracts';

export const MARKET_INSTALLATION_MIGRATIONS: readonly LocalMetadataMigration[] = [
  {
    namespace: 'market-installations',
    version: 1,
    name: 'portable-install-receipts',
    checksum: 'sha256:portable-market-install-receipts-v1',
    ownership: 'state',
    destructive: false,
    statements: [
      `CREATE TABLE market_installations (
        package_id TEXT PRIMARY KEY NOT NULL,
        install_location TEXT NOT NULL,
        receipt_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
      ) STRICT`,
      `CREATE INDEX market_installations_updated_idx
        ON market_installations(updated_at DESC, package_id)`,
    ],
  },
];
