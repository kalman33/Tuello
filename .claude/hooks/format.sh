#!/usr/bin/env bash
# Formate le fichier modifié par Claude avec Prettier, uniquement si Prettier est installé dans le projet.
file="$(jq -r '.tool_input.file_path // empty')"
[ -z "$file" ] || [ ! -f "$file" ] && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
if [ -x node_modules/.bin/prettier ]; then
  node_modules/.bin/prettier --write --ignore-unknown --log-level silent "$file" >/dev/null 2>&1
fi
exit 0
