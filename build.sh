#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DESKTOP=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --package)
      PACKAGE_DESKTOP=1
      shift
      ;;
    --help|-h)
      echo "Usage: ./build.sh [--package]"
      echo "  --package  Build the Electron application package after the workspace build"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

cd "$SCRIPT_DIR"
pnpm build

if [ "$PACKAGE_DESKTOP" -eq 1 ]; then
  pnpm package:desktop
fi
