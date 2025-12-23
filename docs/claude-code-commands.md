1. Analyse de code générale
   bash# Analyser un fichier spécifique
   claude analyze src/services/dashboardProvider.ts

# Analyser un dossier entier

claude analyze src/services/

# Recherche de bugs avec contexte

claude "Analyse ce fichier et trouve tous les bugs potentiels: src/services/fileScannerService.ts" 2. Recherche ciblée de bugs
bash# Bugs de sécurité
claude "Trouve les vulnérabilités de sécurité dans mon code TypeScript"

# Bugs de performance

claude "Identifie les problèmes de performance dans src/services/"

# Bugs de mémoire

claude "Cherche les fuites mémoire potentielles dans mon extension chrome"

# Bugs de null/undefined

claude "Trouve tous les accès non sécurisés à des propriétés qui pourraient être undefined" 3. Analyse spécifique par type
bash# Erreurs de gestion d'erreurs
claude "Vérifie que toutes les promesses ont un .catch() ou try/catch"

# Erreurs de typage TypeScript

claude "Trouve les 'any' et suggère des types plus précis"

# Erreurs de logique

claude "Analyse la logique de cette fonction et trouve les cas limites non gérés: [coller le code]"
⚡ Optimiser le code

1. Optimisation générale
   bash# Optimiser un fichier
   claude optimize src/services/statisticsService.ts

# Optimiser avec contraintes

claude "Optimise ce code pour réduire la consommation mémoire: [fichier]"

# Refactoring complet

claude "Refactorise ce code en suivant les best practices TypeScript: [fichier]" 2. Optimisations spécifiques
bash# Performance
claude "Optimise les boucles et itérations dans fileScannerService.ts"

# Bundle size

claude "Réduis la taille du bundle en optimisant les imports"

# Async/await

claude "Convertis ce code callback en async/await et optimise les appels parallèles"

# Algorithmes

claude "Améliore la complexité algorithmique de cette fonction de tri/recherche" 3. Clean code
bash# Lisibilité
claude "Améliore la lisibilité de ce code en le décomposant en fonctions plus petites"

# Duplication

claude "Trouve et élimine le code dupliqué dans src/services/"

# Nommage

claude "Suggère de meilleurs noms pour les variables et fonctions dans ce fichier"
🎯 Commandes pratiques pour votre projet
Pour votre dashboard Angular :
bash# Analyser le composant dashboard
claude "Analyse dashboard.component.ts et trouve les bugs potentiels liés à la gestion des états"

# Optimiser les performances

claude "Optimise les re-renders du composant dashboard et suggère l'usage de OnPush si pertinent"

# Vérifier les memory leaks

claude "Vérifie que tous les événements sont correctement nettoyés dans ngOnDestroy()"
Pour vos services TypeScript :
bash# Analyser fileScannerService
claude "Analyse fileScannerService.ts et trouve les cas où le scan pourrait planter"

# Optimiser les recherches de fichiers

claude "Optimise la recherche récursive de fichiers dans fileScannerService pour de gros projets"

# Améliorer la gestion d'erreurs

claude "Améliore la gestion d'erreurs dans statisticsService.ts"
Pour l'extension VS Code :
bash# Analyser l'activation
claude "Vérifie que l'extension s'active correctement et ne bloque pas VS Code"

# Optimiser les performances

claude "Optimise les appels à l'API VS Code pour réduire la latence"

# Vérifier les fuites mémoire

claude "Trouve les listeners non nettoyés qui pourraient causer des fuites mémoire"
🚀 Workflow recommandé

1. Analyse initiale (5 min)
   bash# Scanner tout le projet
   claude "Fais un audit complet du projet et liste les 10 problèmes les plus critiques"
2. Correction des bugs critiques (30 min)
   bash# Pour chaque bug trouvé
   claude "Corrige ce bug: [description] dans [fichier]"

# Vérifier la correction

claude "Vérifie que cette correction n'introduit pas de nouveaux bugs" 3. Optimisation (20 min)
bash# Performance
claude "Optimise les parties les plus lentes du code identifiées par le profiler"

# Code quality

claude "Applique les best practices TypeScript/Angular à ce fichier" 4. Tests (15 min)
bash# Générer des tests
claude "Génère des tests unitaires pour couvrir tous les cas limites de cette fonction"

# Vérifier la couverture

claude "Quels sont les scénarios non testés dans ce code ?"
📋 Checklist d'analyse complète
bash# 1. Sécurité
claude "Audit de sécurité: trouve les injections, XSS, accès non autorisés"

# 2. Performance

claude "Profile le code et identifie les bottlenecks"

# 3. Qualité

claude "Vérifie la conformité aux standards TypeScript/Angular"

# 4. Maintenabilité

claude "Évalue la complexité cyclomatique et suggère des simplifications"

# 5. Tests

claude "Calcule la couverture de tests et génère les tests manquants"

# 6. Documentation

claude "Vérifie que tout le code public est documenté avec JSDoc"
💡 Astuces avancées
Mode interactif
bash# Lancer une session interactive
claude chat

# Puis dans le chat:

> Analyse mon code et pose-moi des questions sur les parties ambiguës
> Optimise ce fichier étape par étape en m'expliquant chaque changement
> Avec contexte du projet
> bash# Donner le contexte complet
> claude --context "Je développe une extension VS Code pour générer des tests avec IA. Voici mon architecture: [description]" analyze src/
> Comparaison avant/après
> bash# Sauvegarder l'original
> cp src/service.ts src/service.ts.bak

# Optimiser

claude optimize src/service.ts

# Comparer

claude "Compare ces deux versions et explique les améliorations: service.ts vs service.ts.bak"
⚠️ Points d'attention pour votre code
Basé sur ce que j'ai vu dans vos fichiers, voici ce que je recommande d'analyser en priorité :
bash# 1. Gestion des erreurs dans les parsers Java
claude "Analyse javaUtils.ts et vérifie la robustesse du parsing face à du code Java invalide"

# 2. Performance du scan de fichiers

claude "Optimise fileScannerService.ts pour éviter de scanner node_modules même avec les glob patterns"

# 3. Gestion de la mémoire dans le dashboard

claude "Vérifie que le composant dashboard ne garde pas de références après destruction"

# 4. Race conditions dans les stats

claude "Vérifie qu'il n'y a pas de race condition lors de l'incrémentation des stats"

# 5. Validation des inputs

claude "Trouve tous les endroits où les inputs utilisateur ne sont pas validés"
