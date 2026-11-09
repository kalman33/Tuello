#!/usr/bin/env bash
# Status line Claude Code : modèle | usage 5 h | usage semaine | coût de la session | contexte utilisé.
# Lit le JSON envoyé par Claude Code sur stdin (jq, sinon python3) ; un champ absent est simplement omis.
export LC_NUMERIC=C
input=$(cat)

if command -v jq >/dev/null 2>&1; then
  vals=$(printf '%s' "$input" | jq -r '[
    (.model.display_name // ""),
    (.rate_limits.five_hour.used_percentage // ""),
    (.rate_limits.seven_day.used_percentage // ""),
    (.cost.total_cost_usd // ""),
    (.context_window.used_percentage // "")
  ] | map(tostring) | join("\u001f")')
elif command -v python3 >/dev/null 2>&1; then
  vals=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
def g(*p):
    x = d
    for k in p:
        x = x.get(k) if isinstance(x, dict) else None
        if x is None:
            return ""
    return str(x)
print("\x1f".join([g("model","display_name"), g("rate_limits","five_hour","used_percentage"),
  g("rate_limits","seven_day","used_percentage"), g("cost","total_cost_usd"),
  g("context_window","used_percentage")]))
')
else
  exit 0
fi

IFS=$'\x1f' read -r model five week cost ctx <<<"$vals"

parts=()
[ -n "$model" ] && parts+=("$model")
[ -n "$five" ] && parts+=("5h $(printf '%.0f' "$five")%")
[ -n "$week" ] && parts+=("semaine $(printf '%.0f' "$week")%")
[ -n "$cost" ] && parts+=("session \$$(printf '%.2f' "$cost")")
[ -n "$ctx" ] && parts+=("ctx $(printf '%.0f' "$ctx")%")

out=""
for p in "${parts[@]}"; do
  out="${out:+$out | }$p"
done
printf '%s\n' "$out"
