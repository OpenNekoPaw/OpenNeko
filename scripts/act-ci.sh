#!/usr/bin/env bash

# Local GitHub Actions smoke runner powered by act.
# This is an optional workflow-shape check; GitHub-hosted runners remain the
# authoritative CI environment, especially for macOS Rust/Metal jobs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKFLOW_FILE="$ROOT_DIR/.github/workflows/ci.yml"

DEFAULT_EVENT="push"
DEFAULT_PLATFORM="${ACT_PLATFORM:-ubuntu-latest=catthehacker/ubuntu:act-latest}"
DEFAULT_CONTAINER_ARCHITECTURE="${ACT_CONTAINER_ARCHITECTURE:-linux/amd64}"

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
  --pull              Ask act to pull/update the runner image.
  --help, -h          Show this help.

Default jobs:
  build, test-ts, code-quality, cargo-deny

Notes:
  - This intentionally excludes test-rust because CI runs it on macos-latest.
    Use `pnpm ci:local:rust` for Rust checks and GitHub Actions for the final
    macOS runner signal.
  - Override the act image with ACT_PLATFORM, for example:
      ACT_PLATFORM='ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-22.04' pnpm ci:act
  - Override container architecture with ACT_CONTAINER_ARCHITECTURE.
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

cd "$ROOT_DIR"

echo "OpenNeko - local act workflow check"
echo "Workflow: $WORKFLOW_FILE"
echo "Event:    $EVENT"
echo "Platform: $DEFAULT_PLATFORM"
echo "Arch:     $DEFAULT_CONTAINER_ARCHITECTURE"
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
    --platform "$DEFAULT_PLATFORM"
    --container-architecture "$DEFAULT_CONTAINER_ARCHITECTURE"
  )

  if [[ "$PULL_IMAGE" -eq 1 ]]; then
    cmd+=(--pull)
  fi

  if [[ "${#ACT_ARGS[@]}" -gt 0 ]]; then
    cmd+=("${ACT_ARGS[@]}")
  fi
  "${cmd[@]}"
done
