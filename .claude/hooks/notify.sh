#!/usr/bin/env bash
# Notification système quand Claude a terminé (Stop) ou attend une action (Notification).
# Utilise terminal-notifier (Homebrew ou app dans /Applications) si présent, sinon osascript / notify-send.
# Un clic sur la notification ramène la fenêtre VS Code du projet (via `open -b com.microsoft.VSCode`).
input="$(cat)"
event="$(printf '%s' "$input" | jq -r '.hook_event_name // "Stop"' 2>/dev/null)"
msg="$(printf '%s' "$input" | jq -r '.message // empty' 2>/dev/null)"
project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"
project="$(basename "$project_dir")"

if [ "$event" = "Notification" ]; then
  title="Claude Code — action requise"; sound="Ping"; msg="${msg:-Claude attend votre réponse}"
else
  title="Claude Code — tâche terminée"; sound="Glass"; msg="Tâche terminée !"
fi

# Clicking the notification brings back the VS Code window of this project (not just any VS Code window).
# `open -b` hands the folder to the running VS Code, which focuses the window that already has it open.
# (The `code` CLI is not used: launched from the notification, it spawns a short-lived extra window.)
on_click=(-execute "$(printf '/usr/bin/open -b com.microsoft.VSCode %q' "$project_dir")")

# The app bundle (manual install) comes first: an older broken wrapper may still sit in the PATH.
notifier=""
for candidate in /Applications/terminal-notifier.app/Contents/MacOS/terminal-notifier \
  "$HOME/Applications/terminal-notifier.app/Contents/MacOS/terminal-notifier" \
  "$(command -v terminal-notifier)"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    notifier="$candidate"
    break
  fi
done

if [ -n "$notifier" ] &&
  "$notifier" -title "$title" -subtitle "$project" -message "$msg" -sound "$sound" \
    -group "claude-$project" "${on_click[@]}" >/dev/null 2>&1; then
  :
elif command -v osascript >/dev/null 2>&1; then
  osascript -e "display notification \"${msg//\"/\\\"}\" with title \"$title\" subtitle \"$project\" sound name \"$sound\""
elif command -v notify-send >/dev/null 2>&1; then
  notify-send "$title — $project" "$msg"
else
  printf '\a'
fi
exit 0
