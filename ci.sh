#!/usr/bin/env bash

# OpenNeko local CI. The product runtime is TypeScript + Node/FFmpeg; there is no
# separately built Rust media payload.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QUICK=0
FIX=0
RELEASE=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --ts) shift ;;
    --quick) QUICK=1; shift ;;
    --fix) FIX=1; shift ;;
    --release) RELEASE=1; shift ;;
    --help|-h)
      echo "Usage: ./ci.sh [--ts] [--quick] [--fix] [--release]"
      exit 0
      ;;
    --rust)
      echo "The retired Rust media engine no longer has a CI lane." >&2
      exit 2
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

RESULTS=()
FAILED=0

run_step() {
  local name="$1"
  shift
  printf "  %-40s " "$name"
  if "$@" >/dev/null 2>&1; then
    echo "PASS"
    RESULTS+=("PASS  $name")
  else
    echo "FAIL"
    RESULTS+=("FAIL  $name")
    FAILED=1
    "$@" || true
  fi
}

cd "$SCRIPT_DIR"

if [ "$FIX" -eq 1 ]; then
  run_step "format (fix)" pnpm format
  run_step "lint (fix)" pnpm lint:fix
else
  run_step "format:check" pnpm format:check
  run_step "lint" pnpm lint
fi

if [ "$QUICK" -eq 0 ]; then
  run_step "build" pnpm build
fi
run_step "test" pnpm test -- --run
run_step "check:unused" pnpm check:unused
run_step "check:deps" pnpm check:deps
run_step "check:quality" pnpm check:quality

if [ "$RELEASE" -eq 1 ]; then
  run_step "package desktop" pnpm package:desktop
fi

echo ""
for result in "${RESULTS[@]}"; do
  echo "  $result"
done
exit "$FAILED"
