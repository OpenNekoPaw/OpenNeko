#!/usr/bin/env bash

# OpenNeko Local CI Script
# Mirrors .github/workflows/ci.yml checks for local pre-push verification.
# Supports macOS ARM64 and Linux x64.
#
# Usage:
#   ./ci.sh                Full check (TS + Rust)
#   ./ci.sh --ts           TypeScript only
#   ./ci.sh --rust         Rust only
#   ./ci.sh --quick        Skip build (format + lint + test only)
#   ./ci.sh --fix          Auto-fix format/lint issues
#   ./ci.sh --release      Build one complete OpenNeko VSIX for the current platform
set -euo pipefail

# =============================================================================
# Platform detection
# =============================================================================

detect_platform() {
  local os
  os="$(uname -s)"
  case "$os" in
    Darwin)                echo "macos" ;;
    Linux)                 echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)                     echo "unknown" ;;
  esac
}

# Map OS+arch to VSCode platform target (used by neko-engine VSIX)
detect_vscode_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin)
      case "$arch" in
        arm64)  echo "darwin-arm64" ;;
        *) return 1 ;;
      esac ;;
    Linux)
      case "$arch" in
        x86_64|amd64) echo "linux-x64" ;;
        *) return 1 ;;
      esac ;;
    *) return 1 ;;
  esac
}

PLATFORM="$(detect_platform)"
if ! VSCODE_TARGET="$(detect_vscode_target)"; then
  echo "Unsupported host: $(uname -s)-$(uname -m). Supported targets: darwin-arm64, linux-x64." >&2
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="$SCRIPT_DIR/packages/neko-engine"

read_package_group() {
  node "$SCRIPT_DIR/scripts/read-package-group.mjs" "$1"
}

read_package_group_into() {
  local array_name="$1"
  local group_path="$2"
  local item
  local group_output

  eval "$array_name=()"
  group_output="$(read_package_group "$group_path")"
  while IFS= read -r item; do
    [ -n "$item" ] && eval "$array_name+=(\"\$item\")"
  done <<< "$group_output"
}

# =============================================================================
# Options
# =============================================================================

RUN_TS=1
RUN_RUST=1
QUICK=0
FIX=0
RELEASE=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --ts)      RUN_TS=1; RUN_RUST=0; shift ;;
    --rust)    RUN_TS=0; RUN_RUST=1; shift ;;
    --quick)   QUICK=1; shift ;;
    --fix)     FIX=1; shift ;;
    --release) RELEASE=1; shift ;;
    --help|-h)
      sed -n '3,14p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# =============================================================================
# TS extension list shared with compile-ts-vsix and release packaging.
# =============================================================================

read_package_group_into TS_EXTENSIONS packages.tsExtensions

# =============================================================================
# Result tracking
# =============================================================================

RESULTS=()
FAILED=0

run_step() {
  local name="$1"
  shift
  printf "  %-40s " "$name"
  if "$@" > /dev/null 2>&1; then
    echo "PASS"
    RESULTS+=("PASS  $name")
  else
    echo "FAIL"
    RESULTS+=("FAIL  $name")
    FAILED=1
    # Re-run to show output on failure
    echo "--- $name output ---"
    "$@" || true
    echo "--- end ---"
  fi
}

print_summary() {
  echo ""
  echo "========================================"
  echo " Summary"
  echo "========================================"
  for r in "${RESULTS[@]}"; do
    echo "  $r"
  done
  echo "========================================"
  if [ "$FAILED" -eq 1 ]; then
    echo "  RESULT: FAILED"
  else
    echo "  RESULT: ALL PASSED"
  fi
  echo "========================================"
}

# =============================================================================
# Prerequisite checks
# =============================================================================

check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo "Error: '$1' not found."
    [ -n "${2:-}" ] && echo "  Install: $2"
    return 1
  fi
  return 0
}

check_ffmpeg() {
  if pkg-config --exists libavcodec 2>/dev/null; then
    return 0
  fi
  if command -v ffmpeg &> /dev/null; then
    return 0
  fi
  echo "Warning: FFmpeg dev libraries not detected. Rust build may fail."
  case "$PLATFORM" in
    macos)   echo "  Install: brew install ffmpeg pkg-config" ;;
    linux)   echo "  Install: sudo apt-get install libavcodec-dev libavformat-dev libavutil-dev libswscale-dev libswresample-dev libavfilter-dev libavdevice-dev pkg-config" ;;
    windows) echo "  Install: choco install ffmpeg-shared" ;;
  esac
  return 1
}

# =============================================================================
# TypeScript checks (mirrors: build + test-ts + code-quality jobs)
# =============================================================================

make_ts_filters() {
  local filters=""
  for pkg in "${TS_EXTENSIONS[@]}"; do
    filters+=" --filter=${pkg}"
  done
  echo "$filters"
}

run_ts() {
  echo ""
  echo "========================================"
  echo " TypeScript"
  echo "========================================"

  check_command node "https://nodejs.org" || return 1
  check_command pnpm "corepack enable" || return 1

  # Format
  if [ "$FIX" -eq 1 ]; then
    run_step "format (fix)" pnpm format
  else
    run_step "format:check" pnpm format:check
  fi

  # Lint
  if [ "$FIX" -eq 1 ]; then
    run_step "lint (fix)" pnpm lint:fix
  else
    run_step "lint" pnpm lint
  fi

  # Build (TS extensions only — Rust native build is in the --rust path)
  if [ "$QUICK" -eq 0 ]; then
    # shellcheck disable=SC2046
    run_step "build (TS)" pnpm turbo compile $(make_ts_filters)
  fi

  # Test
  run_step "test" pnpm test -- --run

  # Code quality
  run_step "check:unused (knip)" pnpm check:unused
  run_step "check:deps (depcruise)" pnpm check:deps
}

# =============================================================================
# Rust checks (mirrors: test-rust + cargo-deny jobs)
# =============================================================================

run_rust() {
  echo ""
  echo "========================================"
  echo " Rust"
  echo "========================================"

  check_command cargo "https://rustup.rs" || return 1
  check_ffmpeg || echo "  (continuing anyway — cargo will report if linkage fails)"

  # Remove vendor source override (same as CI)
  rm -f "$ENGINE_DIR/.cargo/config.toml"

  local wd="$ENGINE_DIR"

  # Format
  run_step "cargo fmt --check" \
    cargo fmt --all --manifest-path "$wd/Cargo.toml" -- --check

  # Clippy
  run_step "cargo clippy" \
    cargo clippy --manifest-path "$wd/Cargo.toml" --workspace -- -D warnings

  run_step "cargo clippy (onnx)" \
    cargo clippy --manifest-path "$wd/Cargo.toml" --package neko-engine-kernel --features onnx -- -D warnings

  # Test
  run_step "cargo test" \
    cargo test --manifest-path "$wd/Cargo.toml" --workspace

  run_step "cargo test (onnx)" \
    cargo test --manifest-path "$wd/Cargo.toml" --package neko-engine-kernel --features onnx
}

# =============================================================================
# Release: Build one complete platform VSIX (mirrors package-openneko-vsix)
# =============================================================================

release_openneko() {
  echo ""
  echo "========================================"
  echo " Release: OpenNeko VSIX ($VSCODE_TARGET)"
  echo "========================================"
  echo ""
  echo "  Cross-platform note:"
  echo "    Local build targets: $VSCODE_TARGET (current host)"
  echo "    Full matrix (darwin-arm64, linux-x64)"
  echo "    is built by GitHub Actions for Pull Requests, manual CI, and release tags."
  echo ""

  check_command cargo "https://rustup.rs" || return 1
  check_ffmpeg || return 1

  # Remove vendor source override (same as CI)
  rm -f "$ENGINE_DIR/.cargo/config.toml"

  # Build native .node addon
  run_step "build host-napi ($VSCODE_TARGET)" \
    pnpm --filter @neko-engine/host-napi run build:native

  # Build-only Engine payload, then assemble every retained feature into one VSIX.
  run_step "package Engine payload ($VSCODE_TARGET)" \
    bash "$ENGINE_DIR/scripts/package-platform.sh" "$VSCODE_TARGET"
  run_step "assemble OpenNeko ($VSCODE_TARGET)" \
    node "$SCRIPT_DIR/scripts/package-openneko-platform.mjs" --target "$VSCODE_TARGET"

  echo ""
  echo "  OpenNeko VSIX artifact:"
  ls -lh "$SCRIPT_DIR/vsix-artifacts/OpenNeko-$VSCODE_TARGET-"*.vsix 2>/dev/null | awk '{print "    " $NF " (" $5 ")"}'
}

# =============================================================================
# Main
# =============================================================================

main() {
  echo "OpenNeko — Local CI"
  echo "Platform: $PLATFORM ($VSCODE_TARGET)"
  echo "Mode: ts=$([ "$RUN_TS" -eq 1 ] && echo yes || echo no) rust=$([ "$RUN_RUST" -eq 1 ] && echo yes || echo no) quick=$([ "$QUICK" -eq 1 ] && echo yes || echo no) fix=$([ "$FIX" -eq 1 ] && echo yes || echo no) release=$([ "$RELEASE" -eq 1 ] && echo yes || echo no)"

  cd "$SCRIPT_DIR"

  if [ "$RELEASE" -eq 1 ]; then
    if [ "$RUN_TS" -ne 1 ] || [ "$RUN_RUST" -ne 1 ]; then
      echo "Release packaging requires both TypeScript features and the native Engine." >&2
      FAILED=1
    else
      release_openneko
    fi
  else
    # CI mode: validate checks
    [ "$RUN_TS" -eq 1 ] && run_ts
    [ "$RUN_RUST" -eq 1 ] && run_rust
  fi

  print_summary
  exit "$FAILED"
}

main
