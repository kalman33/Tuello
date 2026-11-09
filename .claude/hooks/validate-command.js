#!/usr/bin/env node
/**
 * Hook PreToolUse (Bash) : bloque les commandes dangereuses avant exécution.
 * Exit 0 = autorisé, exit 2 = bloqué (le message stderr est renvoyé à Claude).
 * Test : echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | node .claude/hooks/validate-command.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const RULES = [
  [/\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-r\s+-f|-f\s+-r)[a-z]*\s+(\/|~|\$HOME)(\s|$|\*)/i, 'rm -rf sur la racine ou le home'],
  [/\brm\s+-[a-z]*r[a-z]*\s+\/(etc|usr|bin|sbin|boot|sys|proc|var|System|Library|Applications)\b/i, 'rm récursif sur un répertoire système'],
  [/\bsudo\b/, 'élévation de privilèges (sudo)'],
  [/\b(mkfs(\.\w+)?|fdisk|diskutil\s+(erase|partition)|shred)\b/i, 'commande de destruction de disque'],
  [/\bdd\s+.*of=\/dev\//i, 'écriture directe sur un périphérique'],
  [/>\s*\/dev\/(sd|hd|nvme|disk)/i, 'écriture directe sur un disque'],
  [/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, 'fork bomb'],
  [/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|python3?)\b/i, 'exécution de script distant (curl | sh)'],
  [/\bchmod\s+(-R\s+)?777\s+\//, 'chmod 777 sur un chemin absolu'],
  [/\bgit\s+push\s+.*(--force(?!-with-lease)|\s-f\b)/i, 'git push --force (utiliser --force-with-lease)'],
  [/\bgit\s+(clean\s+-[a-z]*f[a-z]*d|reset\s+--hard\s+origin)/i, 'opération git destructrice'],
  [/\b(cat|less|more|head|tail|bat)\s+(?![^|;&\n]*[<>])[^|;&\n]*\.env(?!\.example)(\.\w+)?(\s|$)/i, 'lecture d\'un fichier .env (secrets)'],
  [/\b(printenv|env)\b.*\b(KEY|TOKEN|SECRET|PASSWORD)\b/i, 'exposition de secrets'],
  [/\bnpm\s+publish\b/i, 'publication npm']
];

function log(entry) {
  try {
    const file = path.join(os.homedir(), '.claude', 'security.log');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  } catch {}
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    process.exit(0); // entrée illisible : on ne bloque pas
  }
  const command = data?.tool_input?.command;
  if (data?.tool_name !== 'Bash' || typeof command !== 'string') process.exit(0);

  const violations = RULES.filter(([re]) => re.test(command)).map(([, label]) => label);
  if (violations.length === 0) process.exit(0);

  log({ date: new Date().toISOString(), session: data.session_id, cwd: data.cwd, command: command.slice(0, 500), violations });
  console.error(`Commande bloquée par le hook de sécurité : ${violations.join(', ')}.\nSi elle est réellement nécessaire, demander à l'utilisateur de l'exécuter lui-même.`);
  process.exit(2);
});
