#!/usr/bin/env bash
# Blocks obvious credentials from entering a commit. Run against the staged diff.
set -euo pipefail
cd "$(dirname "$0")/.."
PATTERN='sb_secret_[A-Za-z0-9_-]+|service_role[^_a-z]|eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.'
if git diff --cached -U0 2>/dev/null | grep -vE '^\+\+\+|^---' | grep -E '^\+' | grep -qE "$PATTERN"; then
  echo "check-secrets: a staged line matches a credential pattern. Unstage it." >&2
  exit 1
fi
echo "check-secrets: clean"
