#!/usr/bin/env bash

# OpenNeko Build Script
# Uses Turborepo for caching + parallel builds
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔨 Building OpenNeko..."

# =============================================================================
# Extension classification
# =============================================================================

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

  return 0
}

read_package_group_into RELEASE_PACKAGES packages.buildRelease
read_package_group_into DEV_ONLY_PACKAGES packages.devOnly

# =============================================================================
# Parse arguments
# =============================================================================

BUILD_ALL=0
BUILD_DEV=0
BUILD_PACKAGE=""
SKIP_PACKAGE=0
TARGET_PLATFORM=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --all) BUILD_ALL=1; shift ;;
    --dev) BUILD_DEV=1; shift ;;
    --package) BUILD_PACKAGE="$2"; shift 2 ;;
    --skip-package) SKIP_PACKAGE=1; shift ;;
    --target) TARGET_PLATFORM="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: ./build.sh [options]"
      echo ""
      echo "Options:"
      echo "  --all              Build release-ready extensions (${#RELEASE_PACKAGES[@]} packages)"
      echo "  --dev              Build ALL extensions including dev-only (+ ${#DEV_ONLY_PACKAGES[@]} packages)"
      echo "  --package <name>   Build specific package (e.g., neko-cut)"
      echo "  --target <platform> Platform target for neko-engine VSIX (darwin-arm64|linux-x64|win32-x64)"
      echo "  --skip-package     Compile only, skip VSIX packaging"
      echo "  (no options)       Build neko-cut only (default)"
      echo ""
      echo "Release packages: ${RELEASE_PACKAGES[*]}"
      echo "Dev-only packages: ${DEV_ONLY_PACKAGES[*]}"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# =============================================================================
# Helper functions
# =============================================================================

# Package single extension to VSIX
package_extension() {
  local pkg=$1
  local pkg_dir="packages/$pkg"
  if [ ! -d "$pkg_dir" ]; then
    echo "  ⚠️  $pkg_dir not found, skipping"
    return 0
  fi

  # neko-engine with --target: use platform-specific packaging
  if [ "$pkg" = "neko-engine" ] && [ -n "$TARGET_PLATFORM" ]; then
    echo "  📦 $pkg (platform: $TARGET_PLATFORM)"
    bash "$pkg_dir/scripts/package-platform.sh" "$TARGET_PLATFORM"
    cp -f "$pkg_dir"/*.vsix . 2>/dev/null || true
    return 0
  fi

  echo "  📦 $pkg"
  (cd "$pkg_dir" && npx @vscode/vsce package --allow-missing-repository --no-dependencies 2>/dev/null)
  cp -f "$pkg_dir"/*.vsix . 2>/dev/null || true
}

# Package a list of extensions
package_list() {
  echo ""
  echo "📦 Packaging VSIX..."
  for pkg in "$@"; do
    package_extension "$pkg"
  done
}

# =============================================================================
# Main
# =============================================================================

main() {
  local filters=()
  local packages=()
  local package_name

  cd "$SCRIPT_DIR"

  if [ -n "$BUILD_PACKAGE" ]; then
    # Single package
    filters=("--filter=${BUILD_PACKAGE}...")
    packages=("$BUILD_PACKAGE")
  elif [ "$BUILD_DEV" = "1" ]; then
    # All packages (release + dev-only)
    packages=("${RELEASE_PACKAGES[@]}" "${DEV_ONLY_PACKAGES[@]}")
  elif [ "$BUILD_ALL" = "1" ]; then
    # Release-ready only
    packages=("${RELEASE_PACKAGES[@]}")
  else
    # Default: neko-cut + dependencies
    filters=("--filter=neko-cut...")
    packages=("neko-cut")
  fi

  if [ "${#filters[@]}" = "0" ]; then
    for package_name in "${packages[@]}"; do
      filters+=("--filter=${package_name}")
    done
  fi

  # Turbo handles: dependency resolution, parallel execution, caching
  echo "⚡ Running turbo compile (cached + parallel)..."
  pnpm exec turbo run compile "${filters[@]}"

  # Package VSIX (not cacheable — depends on dist/ content)
  if [ "$SKIP_PACKAGE" = "0" ]; then
    package_list "${packages[@]}"

    # Also package neko-suite extension pack for full builds
    if [ "$BUILD_ALL" = "1" ] || [ "$BUILD_DEV" = "1" ]; then
      package_extension "neko-suite"
    fi
  fi

  echo ""
  echo "✅ Build complete!"
  if [ "$BUILD_DEV" = "1" ] && [ "${#DEV_ONLY_PACKAGES[@]}" -gt "0" ]; then
    echo "⚠️  Dev build: includes ${DEV_ONLY_PACKAGES[*]} (not release-ready)"
  fi
  echo ""
  ls -la neko-*.vsix 2>/dev/null || echo "No VSIX files generated."
}

main
