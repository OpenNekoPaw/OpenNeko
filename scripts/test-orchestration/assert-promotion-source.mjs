#!/usr/bin/env node

export function assertPromotionSource({ headRef, baseRef }) {
  if (
    typeof headRef !== 'string' ||
    headRef.length === 0 ||
    headRef === 'main' ||
    baseRef !== 'main'
  ) {
    throw new Error(
      `Merge Gate requires a non-main development branch -> main; received ${headRef || '<empty>'} -> ${baseRef || '<empty>'}`,
    );
  }

  return Object.freeze({ headRef, baseRef });
}

function main() {
  const result = assertPromotionSource({
    headRef: process.env.PR_HEAD_REF ?? '',
    baseRef: process.env.PR_BASE_REF ?? '',
  });
  process.stdout.write(`Promotion source validated: ${result.headRef} -> ${result.baseRef}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
