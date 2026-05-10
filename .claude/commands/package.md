On va réaliser un build de prod de Tuello.
Avant on vérifie que tout est pushé. Si c'est pas le cas, on arrête tout et on prévient l'utilisateur

=== MODE DE FONCTIONNEMENT ===
Réalise dans l'ordre les actions suivantes :

1. On incrémente l'avant dernier digit du numéro de version. Par exemple si c'est 0.0.12.0, on mettra 0.0.13.O
2. Le numéro de version affiché à l'utilisateur (layout.component.html) n'affiche pas le dernier digit. Par conséquent on incrémentera le dernier digit. Si c'est 0.0.12, on mettra 0.0.13
3. On met à jour le CHANGELOG.md en rajoutant de façon tres tres synthétique ce qu'on a rajouté
4. Lance un build : npm run build:prod
5. Lance le packaging: npm run package
6. pose un tag de version. Par exemple pour la version 0.0.12 on mettra le tag v0.0.12
7. Ne push pas sur le repo
