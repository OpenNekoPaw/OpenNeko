#!/usr/bin/env bash

# Local GitHub Actions smoke runner powered by act.
# This is an optional workflow-shape check; GitHub-hosted runners remain the
# authoritative CI environment, especially for macOS Rust/Metal jobs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKFLOW_FILE="$ROOT_DIR/.github/workflows/ci.yml"
ACT_DOCKER_CONTEXT="$SCRIPT_DIR/act"

DEFAULT_EVENT="push"
DEFAULT_CONTAINER_ARCHITECTURE="${ACT_CONTAINER_ARCHITECTURE:-linux/arm64/v8}"
DEFAULT_BASE_IMAGE="${ACT_BASE_IMAGE:-catthehacker/ubuntu:act-latest}"

DEFAULT_JOBS=(build test-ts code-quality cargo-deny)
SUPPORTED_JOBS=(changes build test-ts code-quality cargo-deny proto-check)

EVENT="$DEFAULT_EVENT"
RUN_ALL=0
LIST_ONLY=0
PULL_IMAGE=0
JOBS=()
ACT_ARGS=()

usage() {
  cat <<'EOF'
Usage:
  scripts/act-ci.sh [options] [-- extra act args]

Options:
  --job, -j <id>       Run one supported job. May be repeated.
  --all               Run the default local act job set.
  --list              List supported jobs and exit.
  --event <name>      GitHub event name passed to act (default: push).
  --pull              Refresh the prepared runner image and its base image.
  --help, -h          Show this help.

Default jobs:
  build, test-ts, code-quality, cargo-deny

Notes:
  - This intentionally excludes test-rust because CI runs it on macos-latest.
    Use `pnpm ci:local:rust` for Rust checks and GitHub Actions for the final
    macOS runner signal.
  - The default prepared image caches Linux FFmpeg and native build packages.
    Override it with ACT_PLATFORM, for example:
      ACT_PLATFORM='ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-22.04' pnpm ci:act
    Custom platforms install native packages inside the workflow as usual.
  - Local runs default to native Apple Silicon via linux/arm64/v8.
    act receives the Docker-normalized linux/arm64 value because local image
    metadata does not retain the equivalent v8 variant marker.
    Override with ACT_CONTAINER_ARCHITECTURE=linux/amd64 when an explicit
    GitHub-hosted Linux x64 compatibility check is needed.
  - Rebuildable caches are stored below ACT_CACHE_ROOT, which defaults to
    ~/.cache/openneko-act, and are isolated by container architecture.
EOF
}

contains_job() {
  local needle="$1"
  local job
  for job in "${SUPPORTED_JOBS[@]}"; do
    [[ "$job" == "$needle" ]] && return 0
  done
  return 1
}

check_prerequisites() {
  if ! command -v act >/dev/null 2>&1; then
    echo "Error: act is not installed."
    echo "Install: https://github.com/nektos/act"
    exit 1
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Error: docker CLI is not installed or not on PATH."
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "Error: Docker is not running or is not reachable."
    exit 1
  fi
}

list_jobs() {
  echo "Supported local act jobs:"
  printf '  %s\n' "${SUPPORTED_JOBS[@]}"
  echo ""
  echo "Default job set:"
  printf '  %s\n' "${DEFAULT_JOBS[@]}"
  echo ""
  echo "Excluded by design:"
  echo "  test-rust       macos-latest; use pnpm ci:local:rust locally"
  echo "  dependency-review, package-*  PR/release-only GitHub runner checks"
}

configure_local_runtime() {
  local runner_revision

  ARCH_CACHE_KEY="${DEFAULT_CONTAINER_ARCHITECTURE//\//-}"
  if [[ ! "$ARCH_CACHE_KEY" =~ ^[a-z0-9][a-z0-9._-]*$ ]]; then
    echo "Error: unsupported container architecture '$DEFAULT_CONTAINER_ARCHITECTURE'."
    echo "Use a Docker platform such as linux/arm64/v8 or linux/amd64."
    exit 1
  fi

  ACT_RUNTIME_ARCHITECTURE="$DEFAULT_CONTAINER_ARCHITECTURE"
  if [[ "$ACT_RUNTIME_ARCHITECTURE" == "linux/arm64/v8" ]]; then
    ACT_RUNTIME_ARCHITECTURE="linux/arm64"
  fi

  if [[ -n "${ACT_CACHE_ROOT:-}" ]]; then
    CACHE_ROOT="$ACT_CACHE_ROOT"
  else
    [[ -n "${HOME:-}" ]] || { echo "Error: HOME or ACT_CACHE_ROOT is required."; exit 1; }
    CACHE_ROOT="$HOME/.cache/openneko-act"
  fi
  [[ "$CACHE_ROOT" == /* ]] || { echo "Error: ACT_CACHE_ROOT must be absolute."; exit 1; }

  CACHE_DIR="$CACHE_ROOT/$ARCH_CACHE_KEY"
  CACHE_MOUNTS=(
    "$CACHE_DIR/pnpm-store:/root/.local/share/pnpm/store"
    "$CACHE_DIR/corepack:/root/.cache/node/corepack"
    "$CACHE_DIR/cargo-home:/root/.cargo"
    "$CACHE_DIR/rustup:/root/.rustup"
    "$CACHE_DIR/turbo:$ROOT_DIR/.turbo"
    "$CACHE_DIR/cargo-target:$ROOT_DIR/packages/neko-engine/target"
  )

  mkdir -p \
    "$CACHE_DIR/pnpm-store" \
    "$CACHE_DIR/corepack" \
    "$CACHE_DIR/cargo-home" \
    "$CACHE_DIR/rustup" \
    "$CACHE_DIR/turbo" \
    "$CACHE_DIR/cargo-target"

  CONTAINER_OPTIONS=""
  local mount_spec escaped_mount
  for mount_spec in "${CACHE_MOUNTS[@]}"; do
    printf -v escaped_mount '%q' "$mount_spec"
    CONTAINER_OPTIONS+="${CONTAINER_OPTIONS:+ }--volume=$escaped_mount"
  done

  USE_PREPARED_RUNNER=1
  if [[ -n "${ACT_PLATFORM:-}" ]]; then
    PLATFORM="$ACT_PLATFORM"
    USE_PREPARED_RUNNER=0
    return 0
  fi

  runner_revision="$({ cd "$ACT_DOCKER_CONTEXT"; cksum Dockerfile native-build-packages.txt; } | cksum | awk '{print $1}')"
  RUNNER_IMAGE="${ACT_RUNNER_IMAGE:-openneko-act:${ARCH_CACHE_KEY}-${runner_revision}}"
  PLATFORM="ubuntu-latest=$RUNNER_IMAGE"
}

ensure_prepared_runner() {
  [[ "$USE_PREPARED_RUNNER" -eq 1 ]] || return 0

  if [[ "$PULL_IMAGE" -eq 0 ]] && docker image inspect "$RUNNER_IMAGE" >/dev/null 2>&1; then
    return 0
  fi

  local build_command=(
    docker build
    --platform "$ACT_RUNTIME_ARCHITECTURE"
    --build-arg "ACT_BASE_IMAGE=$DEFAULT_BASE_IMAGE"
    --tag "$RUNNER_IMAGE"
    --file "$ACT_DOCKER_CONTEXT/Dockerfile"
  )
  if [[ "$PULL_IMAGE" -eq 1 ]]; then
    build_command+=(--pull)
  fi
  build_command+=("$ACT_DOCKER_CONTEXT")

  echo "Preparing local act runner image: $RUNNER_IMAGE"
  "${build_command[@]}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --job|-j)
      [[ $# -ge 2 ]] || { echo "Error: --job requires a value"; exit 1; }
      JOBS+=("$2")
      shift 2
      ;;
    --all)
      RUN_ALL=1
      shift
      ;;
    --list)
      LIST_ONLY=1
      shift
      ;;
    --event)
      [[ $# -ge 2 ]] || { echo "Error: --event requires a value"; exit 1; }
      EVENT="$2"
      shift 2
      ;;
    --pull)
      PULL_IMAGE=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      ACT_ARGS+=("$@")
      break
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "$LIST_ONLY" -eq 1 ]]; then
  list_jobs
  exit 0
fi

if [[ "${#JOBS[@]}" -eq 0 || "$RUN_ALL" -eq 1 ]]; then
  JOBS=("${DEFAULT_JOBS[@]}")
fi

for job in "${JOBS[@]}"; do
  if ! contains_job "$job"; then
    echo "Error: unsupported local act job '$job'."
    echo ""
    list_jobs
    exit 1
  fi
done

check_prerequisites
configure_local_runtime
ensure_prepared_runner
ACT_PULL_VALUE=false
if [[ "$USE_PREPARED_RUNNER" -eq 0 && "$PULL_IMAGE" -eq 1 ]]; then
  ACT_PULL_VALUE=true
fi

cd "$ROOT_DIR"

echo "OpenNeko - local act workflow check"
echo "Workflow: $WORKFLOW_FILE"
echo "Event:    $EVENT"
echo "Platform: $PLATFORM"
echo "Arch:     $DEFAULT_CONTAINER_ARCHITECTURE (act: $ACT_RUNTIME_ARCHITECTURE)"
echo "Cache:    $CACHE_DIR"
echo "Jobs:     ${JOBS[*]}"
echo ""

for job in "${JOBS[@]}"; do
  echo "========================================"
  echo " act job: $job"
  echo "========================================"

  cmd=(
    act "$EVENT"
    --workflows "$WORKFLOW_FILE"
    --job "$job"
    --platform "$PLATFORM"
    --container-architecture "$ACT_RUNTIME_ARCHITECTURE"
    --container-options "$CONTAINER_OPTIONS"
    --pull="$ACT_PULL_VALUE"
  )

  if [[ "$USE_PREPARED_RUNNER" -eq 1 ]]; then
    cmd+=(--env ACT_NATIVE_DEPS_READY=true)
  fi
  cmd+=(--env npm_config_store_dir=/root/.local/share/pnpm/store)

  if [[ "${#ACT_ARGS[@]}" -gt 0 ]]; then
    cmd+=("${ACT_ARGS[@]}")
  fi
  "${cmd[@]}"
done
