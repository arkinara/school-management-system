#!/usr/bin/env bash
# Push to GitHub using PAT in URL (bypasses SSH host-key verification issues
# on fresh containers). Token never sits in .git/config after this script exits.
#
# Usage: scripts/push-via-pat.sh [<remote-name>] [<branch>]
#
# Reads GH_TOKEN from $GH_TOKEN or `gh auth token`. Defaults: remote=origin, branch=main.

set -euo pipefail

REMOTE="${1:-origin}"
BRANCH="${2:-main}"

if [[ -n "${GH_TOKEN:-}" ]]; then
    TOK="$GH_TOKEN"
else
    TOK="$(gh auth token)"
fi

CLEAN_URL=$(git remote get-url "$REMOTE")
# If URL already has token, strip it
CLEAN_URL="${CLEAN_URL#https://x-access-token:*@}"
CLEAN_URL="${CLEAN_URL#https://*@}"

# Set URL with token, push, restore
git remote set-url "$REMOTE" "https://x-access-token:${TOK}@${CLEAN_URL#https://}"
GIT_TERMINAL_PROMPT=0 git push -u "$REMOTE" "$BRANCH"
git remote set-url "$REMOTE" "$CLEAN_URL"

echo "Pushed to $REMOTE/$BRANCH; remote URL restored to clean form."
