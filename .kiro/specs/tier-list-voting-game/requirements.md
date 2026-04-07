# Document d'Exigences — Jeu de Vote Tier List

## Introduction

Le Jeu de Vote Tier List est un nouveau jeu multijoueur FFA (free-for-all) intégré au Game Hub existant. À chaque partie, un thème est sélectionné aléatoirement via une animation de roulette. Les joueurs votent secrètement pour placer chaque élément du thème dans un tier (rang) d'une tier list en glissant-déposant l'élément vers le tier souhaité. Le placement final de chaque élément est déterminé par la moyenne des votes. Plus le vote d'un joueur est proche de la moyenne du groupe, plus il gagne de points. La partie se termine lorsque tous les éléments du thème ont été placés. Le jeu réutilise l'infrastructure existante du hub (système de lobby, protocole WebSocket, système d'avatars, gestion de l'hôte) et ajoute sa propre logique de jeu, ses écrans et ses animations. Les données de thèmes proviennent de la même base de données que le Ranking Game (items.json / item store).

## Glossaire

- **Jeu_Tier_List**: Le jeu multijoueur FFA dans lequel les joueurs votent pour placer des éléments dans une tier list.
- **Thème**: Un ensemble d'éléments à classer (ex. : « Les pâtes », « Les films »). Chaque thème est associé à une catégorie du magasin d'éléments existant (items.json).
- **Tier**: Un rang dans la tier list, identifié par une lettre (S, A, B, C, D, F). S est le rang le plus élevé (valeur 6), F le plus bas (valeur 1). Les couleurs classiques sont : S = rouge/rose vif (#FF7F7F), A = orange (#FFBF7F), B = jaune (#FFDF7F), C = vert (#BFFF7F), D = bleu clair (#7FBFFF), F = rose/magenta (#FF7FBF).
- **Tier_List**: Une grille composée de tiers (S, A, B, C, D, F) dans laquelle les éléments sont placés au fil des manches.
- **Élément**: Un item du thème à placer dans la tier list (ex. : « Spaghetti » dans le thème « Les pâtes »).
- **Vote**: Le choix secret d'un joueur pour le tier dans lequel un élément donné devrait être placé, effectué par glisser-déposer de l'élément vers le tier souhaité.
- **Moyenne_Votes**: La moyenne arithmétique des votes de tous les joueurs pour un élément donné, convertie en tier final.
- **Score_Proximité**: Les points attribués à un joueur en fonction de la distance entre son vote et la Moyenne_Votes pour un élément. Formule : Score_Proximité = 5 - |valeur_vote_joueur - Moyenne_Votes| (distance maximale = 5, entre S=6 et F=1).
- **Manche**: Une phase de jeu correspondant au vote et au placement d'un seul élément.
- **Roulette**: L'animation de sélection aléatoire du thème en début de partie, où les thèmes défilent visuellement.
- **Phase_Suspense**: Le moment entre la fin du vote et la révélation du résultat, accompagné d'un roulement de tambour.
- **Portrait_Joueur**: La représentation visuelle d'un joueur à l'écran, composée de son avatar et de son nom d'utilisateur.
- **Backend_Serveur**: Le serveur Node.js/TypeScript existant qui gère l'état du jeu, les lobbies et les connexions WebSocket.
- **Service_WebSocket**: La couche de communication temps réel existante utilisée pour synchroniser l'état du jeu entre le Backend_Serveur et les joueurs.
- **Lobby**: Le système de lobby existant du hub, réutilisé pour le Jeu_Tier_List.
- **Hôte**: Le joueur qui a créé le lobby et qui peut lancer la partie.
- **Joueur**: Tout utilisateur connecté au lobby du Jeu_Tier_List.
- **Spectateur**: Un joueur ayant rejoint la partie en cours qui observe sans pouvoir voter jusqu'au prochain rematch.

## Exigences

### Exigence 1 : Sélection du Thème par Roulette

**User Story :** En tant que Joueur, je veux voir une animation de roulette sélectionner le thème de la partie, afin que le choix du thème soit excitant et imprévisible.

#### Critères d'Acceptation

1. WHEN l'Hôte lance la partie, THE Jeu_Tier_List SHALL afficher une animation de roulette montrant les thèmes disponibles qui défilent horizontalement.
2. WHILE la Roulette est active, THE Jeu_Tier_List SHALL afficher les noms des thèmes qui défilent avec une décélération progressive jusqu'à l'arrêt sur le thème sélectionné.
3. WHEN la Roulette s'arrête sur un thème, THE Backend_Serveur SHALL enregistrer le thème sélectionné pour la session de jeu en cours.
4. WHEN la Roulette s'arrête, THE Jeu_Tier_List SHALL afficher directement l'écran de jeu sans aucune transition.
5. THE Backend_Serveur SHALL sélectionner le thème aléatoirement parmi les catégories disponibles dans le magasin d'éléments existant (items.json).
6. THE Backend_Serveur SHALL s'assurer que le thème sélectionné contient au minimum 5 éléments pour permettre une partie complète.

### Exigence 2 : Écran de Jeu Principal

**User Story :** En tant que Joueur, je veux voir un écran de jeu clair avec la tier list, les portraits des joueurs et les scores, afin de suivre la progression de la partie.

#### Critères d'Acceptation

1. WHEN l'écran de jeu apparaît après la Roulette, THE Jeu_Tier_List SHALL afficher le nom du thème en haut de l'écran.
2. WHEN l'écran de jeu apparaît, THE Jeu_Tier_List SHALL afficher une Tier_List vide au centre de l'écran avec les tiers S, A, B, C, D et F visibles, chacun avec sa couleur classique.
3. WHEN l'écran de jeu apparaît, THE Jeu_Tier_List SHALL afficher les Portrait_Joueur de tous les joueurs actifs à l'écran.
4. WHEN l'écran de jeu apparaît, THE Jeu_Tier_List SHALL afficher les scores de chaque joueur initialisés à 0.

### Exigence 3 : Phase de Vote Secret par Glisser-Déposer

**User Story :** En tant que Joueur, je veux voter secrètement pour le tier d'un élément en le glissant vers le tier souhaité, afin que mon choix ne soit pas influencé par les autres joueurs.

#### Critères d'Acceptation

1. WHEN une Manche commence, THE Jeu_Tier_List SHALL afficher l'élément en cours de vote de manière visible à tous les joueurs.
2. WHEN une Manche commence, THE Jeu_Tier_List SHALL réduire visuellement la Tier_List pour faire de la place à l'élément en cours de vote.
3. WHILE un Joueur n'a pas encore voté, THE Jeu_Tier_List SHALL afficher une animation d'attente (idle) sur le Portrait_Joueur de ce joueur.
4. WHEN un Joueur soumet son Vote, THE Jeu_Tier_List SHALL afficher une coche sur le Portrait_Joueur de ce joueur et rendre le portrait statique.
5. WHILE une Manche est active, THE Jeu_Tier_List SHALL masquer les votes des autres joueurs pour chaque joueur individuel.
6. WHEN un Joueur glisse l'élément vers un tier de la Tier_List et le dépose, THE Jeu_Tier_List SHALL enregistrer ce choix comme le Vote du joueur pour l'élément en cours et le soumettre immédiatement.
7. WHILE une Manche est active, THE Jeu_Tier_List SHALL maintenir visible les placements précédents dans la Tier_List pour influencer les votes futurs.
8. WHEN un Joueur vote, THE Service_WebSocket SHALL transmettre le Vote au Backend_Serveur sans révéler le vote aux autres joueurs.

### Exigence 4 : Minuteur de Vote

**User Story :** En tant que Joueur, je veux avoir un temps limité pour voter, afin que la partie garde un rythme dynamique.

#### Critères d'Acceptation

1. WHEN une Manche commence, THE Jeu_Tier_List SHALL démarrer un minuteur de vote configurable (par défaut 15 secondes, plage 5 à 120 secondes).
2. WHILE une Manche est active, THE Jeu_Tier_List SHALL afficher le décompte du minuteur de vote en temps réel.
3. WHEN le minuteur de vote atteint zéro, THE Backend_Serveur SHALL terminer la Manche et utiliser un vote par défaut (tier C) pour les joueurs qui n'ont pas voté.
4. WHEN tous les joueurs actifs ont soumis leur Vote avant l'expiration du minuteur, THE Backend_Serveur SHALL terminer la Manche immédiatement (complétion anticipée).

### Exigence 5 : Phase de Suspense

**User Story :** En tant que Joueur, je veux un moment de suspense avant la révélation du résultat, afin de rendre le jeu plus excitant.

#### Critères d'Acceptation

1. WHEN tous les joueurs ont voté (ou le minuteur a expiré), THE Jeu_Tier_List SHALL retirer les coches des Portrait_Joueur et rétablir les animations d'attente.
2. WHEN la Phase_Suspense commence, THE Jeu_Tier_List SHALL afficher l'élément voté en rotation ou en lévitation au-dessus de la Tier_List.
3. WHEN la Phase_Suspense commence, THE Jeu_Tier_List SHALL jouer un effet sonore de roulement de tambour accompagné d'un indicateur visuel.
4. THE Phase_Suspense SHALL durer entre 2 et 4 secondes avant de passer à l'affichage du résultat.

### Exigence 6 : Affichage du Résultat et Placement

**User Story :** En tant que Joueur, je veux voir où l'élément est placé dans la tier list et comment chaque joueur a voté, afin de comparer les opinions.

#### Critères d'Acceptation

1. WHEN la Phase_Suspense se termine, THE Backend_Serveur SHALL calculer la Moyenne_Votes en faisant la moyenne arithmétique des valeurs numériques des votes de tous les joueurs actifs (S=6, A=5, B=4, C=3, D=2, F=1).
2. WHEN la Moyenne_Votes est calculée, THE Backend_Serveur SHALL convertir la moyenne en tier final selon les seuils suivants : S (≥5.5), A (≥4.5 et <5.5), B (≥3.5 et <4.5), C (≥2.5 et <3.5), D (≥1.5 et <2.5), F (<1.5).
3. WHEN le tier final est déterminé, THE Jeu_Tier_List SHALL animer l'élément glissant dans le tier correspondant de la Tier_List.
4. WHEN le résultat est affiché, THE Jeu_Tier_List SHALL afficher les Portrait_Joueur dans le tier pour lequel chaque joueur a voté, révélant ainsi tous les votes.
5. WHEN le résultat est affiché, THE Backend_Serveur SHALL calculer le Score_Proximité de chaque joueur pour cette Manche.
6. WHEN les scores sont calculés, THE Jeu_Tier_List SHALL mettre à jour l'affichage des scores de chaque joueur avec une animation.

### Exigence 7 : Calcul du Score de Proximité

**User Story :** En tant que Joueur, je veux gagner plus de points quand mon vote est proche de la moyenne du groupe, afin que le jeu récompense le consensus.

#### Critères d'Acceptation

1. WHEN une Manche se termine, THE Backend_Serveur SHALL attribuer à chaque joueur un Score_Proximité basé sur la distance absolue entre la valeur numérique de son vote et la Moyenne_Votes.
2. THE Backend_Serveur SHALL calculer le Score_Proximité selon la formule : Score_Proximité = 5 - |valeur_vote_joueur - Moyenne_Votes|, où 5 est la distance maximale possible entre les tiers S (valeur 6) et F (valeur 1).
3. THE Backend_Serveur SHALL arrondir le Score_Proximité à 2 décimales.
4. THE Backend_Serveur SHALL attribuer un Score_Proximité plus élevé aux joueurs dont le vote est plus proche de la Moyenne_Votes.
5. WHEN les scores de la Manche sont calculés, THE Backend_Serveur SHALL mettre à jour les scores cumulés de chaque joueur.

### Exigence 8 : Déroulement des Manches

**User Story :** En tant que Joueur, je veux que le jeu enchaîne les manches jusqu'à ce que tous les éléments soient placés, afin de construire une tier list complète.

#### Critères d'Acceptation

1. WHEN le résultat d'une Manche a été affiché et un délai configurable est écoulé, THE Jeu_Tier_List SHALL passer automatiquement à la Manche suivante avec le prochain élément du thème.
2. THE Backend_Serveur SHALL présenter les éléments du thème dans un ordre aléatoire déterminé au début de la partie.
3. THE Backend_Serveur SHALL continuer les manches jusqu'à ce que tous les éléments du thème sélectionné aient été placés dans la Tier_List.
4. WHILE les manches se succèdent, THE Jeu_Tier_List SHALL conserver tous les placements précédents visibles dans la Tier_List.
5. WHEN une nouvelle Manche commence, THE Jeu_Tier_List SHALL afficher un indicateur de progression (ex. : « Élément 3/12 »).

### Exigence 9 : Écran de Fin de Partie

**User Story :** En tant que Joueur, je veux voir la tier list complète et le classement final, afin de connaître le résultat de la partie.

#### Critères d'Acceptation

1. WHEN tous les éléments ont été placés, THE Jeu_Tier_List SHALL afficher la Tier_List complète en plein écran.
2. WHEN un Joueur appuie sur un bouton (ou le gagnant le fait), THE Jeu_Tier_List SHALL afficher le classement final trié par score cumulé décroissant.
3. WHEN le classement final est affiché, THE Jeu_Tier_List SHALL mettre en évidence le gagnant avec un effet visuel (animation de couronne).
4. IF deux ou plusieurs joueurs ont le même score cumulé le plus élevé, THEN THE Jeu_Tier_List SHALL déclarer tous les joueurs à égalité comme co-gagnants.
5. WHEN la partie se termine, THE Backend_Serveur SHALL diffuser le classement final et l'identifiant du gagnant à tous les joueurs connectés via le Service_WebSocket.

### Exigence 10 : Rematch et Rejouabilité

**User Story :** En tant que Joueur, je veux pouvoir relancer une partie automatiquement après la fin, afin de continuer à jouer sans recréer un lobby.

#### Critères d'Acceptation

1. WHEN une partie se termine, THE Jeu_Tier_List SHALL afficher un compte à rebours de 30 secondes sur l'écran de fin de partie.
2. WHEN le compte à rebours de 30 secondes expire, THE Backend_Serveur SHALL démarrer automatiquement une nouvelle partie avec tous les joueurs restés connectés, sans action de l'Hôte.
3. WHEN un rematch démarre, THE Backend_Serveur SHALL réutiliser le même code de lobby et la même URL de page de jeu.
4. WHEN un rematch démarre, THE Backend_Serveur SHALL sélectionner un nouveau thème aléatoirement via la Roulette.
5. IF le gagnant de la partie précédente est présent dans le rematch, THEN THE Jeu_Tier_List SHALL afficher une couronne sur le Portrait_Joueur de ce joueur.
6. WHEN un rematch démarre, THE Backend_Serveur SHALL promouvoir les spectateurs en participants actifs.
7. WHEN un Joueur quitte l'écran de fin de partie avant l'expiration du compte à rebours, THE Backend_Serveur SHALL exclure ce joueur du rematch.

### Exigence 11 : Intégration avec l'Infrastructure Existante

**User Story :** En tant que développeur, je veux que le Jeu_Tier_List réutilise l'infrastructure existante du hub, afin d'éviter la duplication de code.

#### Critères d'Acceptation

1. THE Jeu_Tier_List SHALL réutiliser le système de Lobby existant (création, codes de join, gestion de l'hôte, spectateurs).
2. THE Jeu_Tier_List SHALL réutiliser le protocole WebSocket existant (format `{ type: string, payload: object }`) en ajoutant de nouveaux types de messages spécifiques au jeu.
3. THE Jeu_Tier_List SHALL réutiliser le système de génération d'avatars existant pour les Portrait_Joueur.
4. THE Jeu_Tier_List SHALL réutiliser le mécanisme de reconnexion existant (période de grâce de 15 secondes).
5. THE Jeu_Tier_List SHALL réutiliser le mécanisme de réassignation de l'Hôte existant (prochain joueur par ordre d'arrivée).
6. THE Jeu_Tier_List SHALL être accessible via une URL dédiée (`/game/tierlist/:code`) qui sert de page unique pour le lobby, le jeu et les résultats.
7. THE Jeu_Tier_List SHALL apparaître comme une carte de jeu interne sur la page du Game Hub, aux côtés du Ranking Game existant.

### Exigence 12 : Synchronisation Temps Réel

**User Story :** En tant que Joueur, je veux que l'état du jeu se mette à jour en temps réel pour tous les joueurs, afin que l'expérience soit synchronisée.

#### Critères d'Acceptation

1. WHEN un Joueur soumet son Vote, THE Service_WebSocket SHALL diffuser la mise à jour du statut de vote (coche) à tous les joueurs connectés sans révéler le tier choisi.
2. WHEN la Phase_Suspense commence, THE Service_WebSocket SHALL diffuser l'événement de début de suspense à tous les joueurs connectés.
3. WHEN le résultat d'une Manche est calculé, THE Service_WebSocket SHALL diffuser le tier final, les votes individuels et les scores mis à jour à tous les joueurs connectés.
4. WHEN la Roulette sélectionne un thème, THE Service_WebSocket SHALL diffuser le thème sélectionné et la liste des éléments à tous les joueurs connectés.
5. THE Backend_Serveur SHALL diffuser les mises à jour d'état du jeu à tous les joueurs connectés dans un délai de 200 ms.

### Exigence 13 : Animations et Effets Sonores

**User Story :** En tant que Joueur, je veux des animations fluides et des effets sonores engageants, afin que l'expérience de jeu soit visuellement attrayante et dynamique.

#### Critères d'Acceptation

1. THE Jeu_Tier_List SHALL utiliser des animations fluides pour la Roulette de sélection de thème (défilement avec décélération).
2. THE Jeu_Tier_List SHALL utiliser des animations d'attente (idle) sur les Portrait_Joueur des joueurs qui n'ont pas encore voté.
3. THE Jeu_Tier_List SHALL utiliser une animation de rotation ou lévitation pour l'élément pendant la Phase_Suspense.
4. THE Jeu_Tier_List SHALL utiliser une animation de glissement pour le placement de l'élément dans son tier final.
5. THE Jeu_Tier_List SHALL utiliser une animation de mise à jour pour les scores après chaque Manche.
6. THE Jeu_Tier_List SHALL jouer un effet sonore de roulement de tambour pendant la Phase_Suspense.
7. THE Jeu_Tier_List SHALL jouer un effet sonore de placement lorsque l'élément glisse dans son tier.
8. THE Jeu_Tier_List SHALL utiliser une animation de couronne pour mettre en évidence le gagnant sur l'écran de fin de partie.

### Exigence 14 : Gestion des Données de Thèmes

**User Story :** En tant que développeur, je veux que les thèmes et éléments proviennent de la même base de données que le Ranking Game, afin de centraliser les données et éviter la duplication.

#### Critères d'Acceptation

1. THE Backend_Serveur SHALL charger les thèmes et éléments depuis le magasin d'éléments existant (items.json) partagé avec le Ranking Game, où chaque catégorie représente un thème.
2. THE Backend_Serveur SHALL exposer la liste des thèmes disponibles (catégories avec au moins 5 éléments) pour la Roulette.
3. WHEN un thème est sélectionné, THE Backend_Serveur SHALL charger tous les éléments de la catégorie correspondante pour la session de jeu.
4. THE Backend_Serveur SHALL permettre l'ajout de nouveaux thèmes en ajoutant des éléments avec une nouvelle catégorie dans le magasin d'éléments, sans modification de code.

### Exigence 15 : Contraintes Techniques Frontend

**User Story :** En tant que développeur, je veux des contraintes techniques claires pour le frontend du Jeu_Tier_List, afin que l'interface soit cohérente avec le reste du hub.

#### Critères d'Acceptation

1. THE Jeu_Tier_List SHALL être implémenté comme un composant Angular intégré à l'application monopage existante.
2. THE Jeu_Tier_List SHALL utiliser uniquement du SCSS personnalisé pour le style visuel, sans Tailwind CSS, Bootstrap ou autre framework CSS.
3. THE Jeu_Tier_List SHALL être fonctionnel sur les navigateurs desktop et mobile.
4. THE Jeu_Tier_List SHALL utiliser un style visuel ludique et coloré, cohérent avec le design existant du Game Hub (éléments arrondis, typographie grasse, couleurs vives).
5. THE Jeu_Tier_List SHALL utiliser le Angular CDK drag-drop pour l'interaction de glisser-déposer des éléments vers les tiers lors du vote.
