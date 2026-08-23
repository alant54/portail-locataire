#!/usr/bin/env bash
set -euo pipefail

USER_NAME="vscode"
HOME_DIR="/home/${USER_NAME}"
WORKSPACE_DIR="/workspace"

CLAUDE_DIR="${HOME_DIR}/.claude"
CLAUDE_MEM_DIR="${HOME_DIR}/.claude-mem"
SSH_DIR="${HOME_DIR}/.ssh"
HISTORY_DIR="/commandhistory"

GITHUB_KEY="${SSH_DIR}/github_chess_stats"
GITHUB_PUBKEY_EXPORT="${WORKSPACE_DIR}/.devcontainer/github_chess_stats.pub"

CLAUDE_JSON_TARGET="${CLAUDE_DIR}/.claude.json"
CLAUDE_JSON_LINK="${HOME_DIR}/.claude.json"

echo "Setting up persistent directories..."

sudo mkdir -p \
  "${CLAUDE_DIR}" \
  "${CLAUDE_MEM_DIR}" \
  "${SSH_DIR}" \
  "${HISTORY_DIR}"

sudo chown -R "${USER_NAME}:${USER_NAME}" \
  "${CLAUDE_DIR}" \
  "${CLAUDE_MEM_DIR}" \
  "${SSH_DIR}" \
  "${HISTORY_DIR}"

chmod 700 "${SSH_DIR}"

# Persist ~/.claude.json inside the mounted ~/.claude volume.
# Claude requires this file to contain valid JSON, not be empty.
if [ -d "${CLAUDE_JSON_LINK}" ] && [ ! -L "${CLAUDE_JSON_LINK}" ]; then
  echo "Error: ${CLAUDE_JSON_LINK} is a directory. Remove it before continuing."
  exit 1
fi

# If ~/.claude.json already exists as a real file, copy it once before replacing it with a symlink.
if [ -f "${CLAUDE_JSON_LINK}" ] && [ ! -L "${CLAUDE_JSON_LINK}" ] && [ ! -s "${CLAUDE_JSON_TARGET}" ]; then
  cp "${CLAUDE_JSON_LINK}" "${CLAUDE_JSON_TARGET}"
fi

# Create a valid default JSON file if missing or empty.
if [ ! -s "${CLAUDE_JSON_TARGET}" ]; then
  printf '{}\n' > "${CLAUDE_JSON_TARGET}"
fi

# If the file exists but contains invalid JSON, back it up and reset it.
if ! python3 -m json.tool "${CLAUDE_JSON_TARGET}" >/dev/null 2>&1; then
  cp "${CLAUDE_JSON_TARGET}" "${CLAUDE_JSON_TARGET}.invalid.$(date +%s)"
  printf '{}\n' > "${CLAUDE_JSON_TARGET}"
fi

ln -sfn "${CLAUDE_JSON_TARGET}" "${CLAUDE_JSON_LINK}"

sudo chown "${USER_NAME}:${USER_NAME}" "${CLAUDE_JSON_TARGET}"
sudo chown -h "${USER_NAME}:${USER_NAME}" "${CLAUDE_JSON_LINK}" 2>/dev/null || true

echo "Installing global npm tools..."

if ! command -v openspec >/dev/null; then
  npm install -g @fission-ai/openspec@latest
fi

if ! command -v pyright-langserver >/dev/null; then
  npm install -g pyright typescript typescript-language-server
fi

echo "Setting up SSH config..."

touch "${SSH_DIR}/config" "${SSH_DIR}/known_hosts"
chmod 600 "${SSH_DIR}/config"
chmod 644 "${SSH_DIR}/known_hosts"

if ! ssh-keygen -F github.com >/dev/null; then
  ssh-keyscan github.com >> "${SSH_DIR}/known_hosts"
fi

if ! grep -q "^Host github.com" "${SSH_DIR}/config"; then
  cat >> "${SSH_DIR}/config" <<EOF
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_chess_stats
  IdentitiesOnly yes
EOF
fi

echo "Generating GitHub SSH key if missing..."

if [ ! -f "${GITHUB_KEY}" ]; then
  ssh-keygen \
    -t ed25519 \
    -C "claude-devcontainer-chess-stats" \
    -f "${GITHUB_KEY}" \
    -N ""

  cp "${GITHUB_KEY}.pub" "${GITHUB_PUBKEY_EXPORT}"

  echo ""
  echo "GitHub public key exported to:"
  echo "  ${GITHUB_PUBKEY_EXPORT}"
  echo ""
  echo "Add it in GitHub:"
  echo "  Repo → Settings → Deploy keys → Add deploy key → Allow write access"
  echo ""
fi

chmod 600 "${GITHUB_KEY}" 2>/dev/null || true

echo "Configuring Git..."

git config --global --add safe.directory "${WORKSPACE_DIR}"

echo "Configuring Claude Code permission mode..."

cat > "${CLAUDE_DIR}/settings.json" <<EOF
{
  "permissions": {
    "defaultMode": "bypassPermissions"
  }
}
EOF

echo "Adding Claude bypass alias..."

if ! grep -q "alias claude=" "${HOME_DIR}/.bashrc"; then
  echo 'alias claude="claude --permission-mode bypassPermissions"' >> "${HOME_DIR}/.bashrc"
fi

echo "Post-create setup complete."