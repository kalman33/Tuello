# CLAUDE.md

Ce fichier fournit des instructions à Claude Code (claude.ai/code) pour travailler avec le code de ce dépôt.

**IMPORTANT : Toujours répondre en français lors des interactions avec les utilisateurs dans ce dépôt.**
Utilisez toujours Context7 lorsque j'ai besoin de génération de code, d'étapes d'installation ou de configuration, ou de documentation de bibliothèque/API.

Cela signifie que vous devez utiliser automatiquement les outils Context7 MCP pour résoudre l'identifiant de la bibliothèque et obtenir sa documentation sans que j'aie à le demander explicitement.

## Aperçu du projet

Tuello est une extension Chrome (Manifest v3) construite avec Angular 19. Elle permet d'intercepter/modifier les requêtes HTTP, d'enregistrer et rejouer les actions utilisateur avec comparaison visuelle, de suivre les éléments HTML et de formater le JSON.

## Commandes de build

```bash
npm run build        # Build dev : Angular + extension Chrome (webpack)
npm run build:prod   # Build production avec optimisation
npm run start        # Serveur dev sur localhost:4200
npm run test         # Tests unitaires Karma
npm run lint         # ESLint pour fichiers .ts et .html
npm run clean        # Supprime les répertoires dist et tmp
```

## Architecture

### Double système de build

- **Application Angular** : Construite via Angular CLI, sortie dans `dist/tuello/`
- **Extension Chrome** : Construite via webpack (`chrome/webpack.config.js`), regroupe le service worker et les content scripts

### Structure de l'extension Chrome

- `chrome/src/background.ts` - Service worker gérant le routage des messages et les tâches longues
- `chrome/src/contentscript.ts` - Injecté dans les pages web, intercepte les interactions utilisateur
- `chrome/src/httpmanager.ts` - Logique d'interception HTTP (hooks XHR et fetch)
- `chrome/manifest.json` - Configuration de l'extension (permissions, commandes)

### Structure de l'application Angular

Tous les composants utilisent l'API standalone avec des routes lazy-loaded :

| Route                | Fonctionnalité                                 |
| -------------------- | ---------------------------------------------- |
| `/recorder` (défaut) | Interception des requêtes HTTP et édition JSON |
| `/spy`               | Enregistrement/lecture des actions navigateur  |
| `/track`             | Surlignage et suivi des éléments               |
| `/search`            | Recherche d'éléments                           |
| `/json-formatter`    | Formatage JSON                                 |
| `/settings`          | Configuration                                  |

### Répertoires clés

- `src/app/core/` - Services partagés, layout, animations, utilitaires
- `src/app/*/services/` - Services par fonctionnalité avec RxJS Subjects pour l'état
- `src/app/*/models/` - Interfaces et classes TypeScript
- `src/assets/i18n/` - Fichiers de traduction (en.json, fr.json)

### Gestion de l'état

Pas de Redux/NgRx - utilise des services avec RxJS Subjects. État persistant stocké dans `chrome.storage.local` :

- `tuelloRecords` - Historique des interceptions HTTP
- `uiRecord` - Enregistrements des actions UI
- `darkMode`, `language` - Préférences utilisateur

### Pattern de communication

Les contextes Chrome communiquent via `chrome.runtime.sendMessage()`. Le composant Angular AppComponent (`src/app/app.component.ts`) écoute les messages comme `SHOW_COMPARISON_RESULTS`, `TRACK_VIEW`, `ACTIONS_PAUSED` pour déclencher la navigation.

## Conventions de code

- Préfixe des sélecteurs de composants : `mmn` (ex: `mmn-recorder-http`)
- Préfixe des sélecteurs de directives : `mmn` (camelCase)
- Styles SCSS avec classes Bootstrap 5.3
- Composants Angular Material partout
