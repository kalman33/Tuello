---
name: commit
description: Crée un commit propre, au format du dépôt Tuello, à partir des modifications en cours. À utiliser quand l'utilisateur demande de committer.
---

1. `git status` et `git diff` (+ `--staged`) pour comprendre les changements.
2. Si les changements couvrent plusieurs sujets, proposer de les découper en plusieurs commits.
3. Vérifier que `npm run lint` passe, et que l'extension compile (`npx webpack --config ./chrome/webpack.config.js`) si `chrome/` est touché.
4. Ajouter les fichiers pertinents (jamais de `.env`, secrets, `dist/` ou `release/`).
5. Rédiger le message en **français**, au format du dépôt : `Fonctionnalité : résumé` (ex. `Spy : rejeu accéléré dans les iframes`, `Tags : édition de l'url de l'api`), ≤ 100 caractères, puis un corps expliquant le _pourquoi_ si utile.
6. Les entrées de `CHANGELOG.md` sont ajoutées au moment du build de version (`/package`), pas à chaque commit.
7. Committer. Ne pas pousser sauf demande explicite.
