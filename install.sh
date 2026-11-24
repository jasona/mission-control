#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_NAME="mission-control"
PLUGINS_ROOT="${GEMINI_PLUGINS_DIR:-${HOME}/.gemini/config/plugins}"
TARGET_DIR="${PLUGINS_ROOT}/${PLUGIN_NAME}"

MODE="symlink"
FORCE=0

usage() {
  cat <<EOF
Usage: ./install.sh [OPTIONS]

Install or uninstall the Antigravity Mission Control plugin into:
  ${TARGET_DIR}

Options:
  --symlink     Install via symlink (default)
  --copy        Install by copying plugin files instead of symlinking
  --uninstall   Remove installed plugin at target path
  --force       Back up any conflicting non-symlink target directory (or replace
                an existing symlink pointing elsewhere) before installing
  -h, --help    Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --symlink)
      MODE="symlink"
      shift
      ;;
    --copy)
      MODE="copy"
      shift
      ;;
    --uninstall)
      MODE="uninstall"
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

is_mission_control_dir() {
  local dir="$1"
  [[ -f "${dir}/plugin.json" ]] && grep -qE '"name"[[:space:]]*:[[:space:]]*"mission-control"' "${dir}/plugin.json"
}

backup_target() {
  local stamp
  stamp="$(date +%Y%m%d%H%M%S)"
  local backup_path="${TARGET_DIR}.bak.${stamp}"
  while [[ -e "${backup_path}" || -L "${backup_path}" ]]; do
    backup_path="${backup_path}_1"
  done
  mv "${TARGET_DIR}" "${backup_path}"
  echo "Backed up existing directory to: ${backup_path}"
}

if [[ "${MODE}" == "uninstall" ]]; then
  if [[ -L "${TARGET_DIR}" ]]; then
    rm "${TARGET_DIR}"
    echo "Removed symlink: ${TARGET_DIR}"
  elif [[ -d "${TARGET_DIR}" ]]; then
    if is_mission_control_dir "${TARGET_DIR}" || [[ "${FORCE}" -eq 1 ]]; then
      rm -rf "${TARGET_DIR}"
      echo "Removed directory: ${TARGET_DIR}"
    else
      echo "Error: ${TARGET_DIR} does not appear to be a Mission Control plugin directory. Re-run with --force to remove." >&2
      exit 1
    fi
  elif [[ -e "${TARGET_DIR}" ]]; then
    if [[ "${FORCE}" -eq 1 ]]; then
      rm -f "${TARGET_DIR}"
      echo "Removed file: ${TARGET_DIR}"
    else
      echo "Error: ${TARGET_DIR} exists and is not a Mission Control directory. Re-run with --force to remove." >&2
      exit 1
    fi
  else
    echo "Mission Control is not installed at ${TARGET_DIR}."
  fi
  exit 0
fi

# Verify prerequisites for install
if ! command -v node >/dev/null 2>&1; then
  echo "Error: 'node' (Node.js) was not found in PATH. Install Node.js before installing Mission Control." >&2
  exit 1
fi
NODE_VERSION="$(node --version)"

if [[ ! -f "${SCRIPT_DIR}/plugin.json" ]] || [[ ! -f "${SCRIPT_DIR}/sidecars/mission_control/main.mjs" ]]; then
  echo "Error: Expected plugin files not found under ${SCRIPT_DIR}." >&2
  exit 1
fi

mkdir -p "${PLUGINS_ROOT}"

RESOLVED_SOURCE="$(cd "${SCRIPT_DIR}" && pwd -P)"

if [[ -L "${TARGET_DIR}" ]]; then
  EXISTING_LINK="$(readlink "${TARGET_DIR}")"
  RESOLVED_EXISTING=""
  if [[ -d "${TARGET_DIR}" ]]; then
    RESOLVED_EXISTING="$(cd "${TARGET_DIR}" && pwd -P)"
  fi

  if [[ "${MODE}" == "symlink" ]] && [[ "${RESOLVED_EXISTING}" == "${RESOLVED_SOURCE}" ]]; then
    echo "Already linked: ${TARGET_DIR} -> ${EXISTING_LINK}"
  elif [[ "${FORCE}" -eq 1 ]] || [[ "${RESOLVED_EXISTING}" == "${RESOLVED_SOURCE}" ]]; then
    rm "${TARGET_DIR}"
  else
    echo "Error: ${TARGET_DIR} is an existing symlink pointing to ${EXISTING_LINK}. Re-run with --force to replace it." >&2
    exit 1
  fi
elif [[ -e "${TARGET_DIR}" ]]; then
  if [[ -d "${TARGET_DIR}" ]] && is_mission_control_dir "${TARGET_DIR}" && [[ "${MODE}" == "copy" ]]; then
    if [[ "${FORCE}" -eq 1 ]]; then
      backup_target
    else
      rm -rf "${TARGET_DIR}"
    fi
  else
    if [[ "${FORCE}" -eq 1 ]]; then
      backup_target
    else
      echo "Error: ${TARGET_DIR} already exists as a non-symlink path. Re-run with --force to back it up and replace it." >&2
      exit 1
    fi
  fi
fi

if [[ "${MODE}" == "symlink" ]]; then
  if [[ ! -L "${TARGET_DIR}" ]]; then
    ln -s "${RESOLVED_SOURCE}" "${TARGET_DIR}"
    echo "Installed symlink: ${TARGET_DIR} -> ${RESOLVED_SOURCE}"
  fi
else
  mkdir -p "${TARGET_DIR}"
  cp "${RESOLVED_SOURCE}/plugin.json" "${TARGET_DIR}/plugin.json"
  cp "${RESOLVED_SOURCE}/README.md" "${TARGET_DIR}/README.md"
  [[ -f "${RESOLVED_SOURCE}/LICENSE" ]] && cp "${RESOLVED_SOURCE}/LICENSE" "${TARGET_DIR}/LICENSE"
  cp -R "${RESOLVED_SOURCE}/assets" "${TARGET_DIR}/assets"
  cp -R "${RESOLVED_SOURCE}/skills" "${TARGET_DIR}/skills"
  cp -R "${RESOLVED_SOURCE}/rules" "${TARGET_DIR}/rules"
  cp -R "${RESOLVED_SOURCE}/sidecars" "${TARGET_DIR}/sidecars"
  echo "Copied Mission Control plugin files to: ${TARGET_DIR}"
fi

cat <<EOF

Mission Control installed successfully (Node ${NODE_VERSION}).

Next steps to verify:
  1. Check manifest & standalone preview:
     node "${TARGET_DIR}/sidecars/mission_control/main.mjs" --standalone --demo --port 4321
  2. Run automated tests:
     node --test "${TARGET_DIR}/sidecars/mission_control/test/"*.test.mjs
  3. Enable in Antigravity:
     Open Customizations -> Plugins, enable "Mission Control", and open:
     [Open Mission Control](sidecar://mission-control/mission_control/)
EOF
