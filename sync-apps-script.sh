#!/usr/bin/env bash
set -euo pipefail

STASH_NAME="local replit clasp config"
STASHED=0

cleanup() {
  if [[ "$STASHED" -eq 1 ]]; then
    echo
    echo "Restoring local Replit/clasp config..."
    git stash pop || {
      echo "WARNING: git stash pop needs manual resolution."
      exit 1
    }
  fi
}

trap cleanup EXIT

echo "== CoLector: GitHub -> Replit -> Apps Script =="

echo
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Stashing local changes..."
  git stash push -u -m "$STASH_NAME"
  STASHED=1
else
  echo "Working tree clean; no stash needed."
fi

echo
echo "Pulling origin/main with rebase..."
git pull --rebase origin main

echo
echo "Restoring local config before clasp push..."
if [[ "$STASHED" -eq 1 ]]; then
  git stash pop
  STASHED=0
fi

echo
echo "Pushing Apps Script files..."
npx -y @google/clasp@latest push

echo
echo "Final git status:"
git status

echo
echo "Done. Web App deployment version must still be updated manually in Apps Script."
