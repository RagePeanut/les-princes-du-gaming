# Plan d'Implémentation : Jeu de Vote Tier List

## Vue d'ensemble

Ce plan implémente le Jeu de Vote Tier List comme nouveau jeu dans le Multiplayer Game Hub existant. L'approche est incrémentale : d'abord les types et modèles de données partagés, puis le moteur de scoring backend (avec tests property-based), le moteur de jeu backend, les extensions WebSocket et REST, puis les services et composants frontend. Chaque étape s'appuie sur les précédentes et se termine par un câblage complet.

## Tâches

- [x] 1. Définir les types et modèles de données partagés
  - [x] 1.1 Étendre `shared/types.ts` avec les types tier list
    - Ajouter le type `TierName = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'`
    - Ajouter les constantes `TIER_VALUES`, `TIER_COLORS`, `TIER_THRESHOLDS`
    - Ajouter les interfaces `TierListRoundData`, `TierListGameSession`, `TierListResult`
    - Ajouter le champ `gameType: 'ranking' | 'tierlist'` à l'interface `Lobby`
    - Ajouter le champ `tierListSession: TierListGameSession | null` à l'interface `Lobby`
    - Étendre `LobbyState` avec les nouveaux états : `'roulette'`, `'suspense'`
    - _Exigences : 11.2, 14.1_

  - [x] 1.2 Étendre `shared/ws-messages.ts` avec les messages tier list
    - Ajouter `SUBMIT_TIER_VOTE` aux constantes `CLIENT_MSG`
    - Ajouter les constantes serveur : `TIERLIST_ROULETTE_START`, `TIERLIST_ROULETTE_RESULT`, `TIERLIST_ROUND_START`, `TIERLIST_VOTE_STATUS`, `TIERLIST_SUSPENSE_START`, `TIERLIST_ROUND_RESULT`, `TIERLIST_GAME_ENDED`
    - Ajouter les interfaces de payload : `SubmitTierVotePayload`, `TierListRouletteStartPayload`, `TierListRouletteResultPayload`, `TierListRoundStartPayload`, `TierListVoteStatusPayload`, `TierListSuspenseStartPayload`, `TierListRoundResultPayload`, `TierListGameEndedPayload`
    - Ajouter les interfaces `PlayerTierVote` et `PlayerProximityScore`
    - Étendre les types union `ClientMessage` et `ServerMessage`
    - _Exigences : 11.2, 12.1, 12.2, 12.3, 12.4_

- [x] 2. Implémenter le TierListScoringEngine (backend)
  - [x] 2.1 Créer `backend/src/tierlist/tierlist-scoring-engine.ts`
    - Implémenter `computeAverageAndTier(votes)` : calcule la moyenne arithmétique des valeurs de votes et convertit en tier final selon les seuils
    - Implémenter `computeProximityScore(votedTier, averageValue)` : `5 - |valeur_vote - moyenne|`, arrondi à 2 décimales
    - Implémenter `updateCumulativeScores(cumulativeScores, roundScores)` : addition des scores de manche aux scores cumulés
    - Implémenter `buildTierListLeaderboard(cumulativeScores, players)` : classement trié par score décroissant avec gestion des égalités
    - _Exigences : 6.1, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5, 9.2, 9.4_

  - [x] 2.2 Écrire le test property-based pour le calcul de la moyenne et conversion en tier
    - **Propriété 8 : Calcul de la moyenne et conversion en tier**
    - **Valide : Exigences 6.1, 6.2**

  - [x] 2.3 Écrire le test property-based pour la formule du score de proximité
    - **Propriété 9 : Formule du score de proximité et arrondi**
    - **Valide : Exigences 7.1, 7.2, 7.3**

  - [x] 2.4 Écrire le test property-based pour la monotonicité du scoring
    - **Propriété 10 : Monotonicité du scoring**
    - **Valide : Exigences 7.4**

  - [x] 2.5 Écrire le test property-based pour la mise à jour additive des scores cumulés
    - **Propriété 11 : Mise à jour additive des scores cumulés**
    - **Valide : Exigences 7.5**

  - [x] 2.6 Écrire le test property-based pour le tri du classement et gestion des égalités
    - **Propriété 12 : Tri du classement et gestion des égalités**
    - **Valide : Exigences 9.2, 9.4**

- [x] 3. Checkpoint — Vérifier que tous les tests du scoring passent
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implémenter le TierListGameEngine (backend)
  - [x] 4.1 Créer `backend/src/tierlist/tierlist-game-engine.ts`
    - Implémenter la structure `TierListGameEngineCallbacks` pour les callbacks de diffusion
    - Implémenter `startGame(lobby)` : sélection du thème via ItemStore, mélange aléatoire des éléments, initialisation de la session, envoi de la roulette
    - Implémenter `startRound(lobby)` : démarrage d'une manche avec l'élément courant, lancement du minuteur
    - Implémenter `submitVote(lobby, playerId, tier)` : enregistrement du vote, validation (tier valide, pas spectateur, pas de double vote, manche active), diffusion du statut de vote, complétion anticipée
    - Implémenter `endRound(lobby)` : vote par défaut (tier C) pour les non-votants, calcul de la moyenne et du tier final, calcul des scores, phase de suspense, diffusion du résultat, avancement à la manche suivante ou fin de partie
    - Implémenter `startRematch(lobby)` : promotion des spectateurs, couronne au gagnant précédent, nouvelle session, nouvelle roulette
    - _Exigences : 1.3, 1.5, 1.6, 3.6, 3.8, 4.3, 4.4, 5.4, 6.1, 6.2, 6.5, 8.1, 8.2, 8.3, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 4.2 Écrire le test property-based pour la validité de la sélection du thème
    - **Propriété 1 : Validité de la sélection du thème**
    - **Valide : Exigences 1.5, 1.6, 14.2**

  - [x] 4.3 Écrire le test property-based pour la complétude et permutation des éléments
    - **Propriété 2 : Complétude et permutation des éléments du thème**
    - **Valide : Exigences 8.2, 8.3, 14.3**

  - [x] 4.4 Écrire le test property-based pour l'initialisation des scores à zéro
    - **Propriété 3 : Initialisation des scores à zéro**
    - **Valide : Exigences 2.4**

  - [x] 4.5 Écrire le test property-based pour l'enregistrement du vote
    - **Propriété 4 : Enregistrement du vote**
    - **Valide : Exigences 3.6**

  - [x] 4.6 Écrire le test property-based pour le secret du vote
    - **Propriété 5 : Secret du vote dans la diffusion**
    - **Valide : Exigences 3.5, 3.8, 12.1**

  - [x] 4.7 Écrire le test property-based pour le vote par défaut
    - **Propriété 6 : Vote par défaut pour les non-votants**
    - **Valide : Exigences 4.3**

  - [x] 4.8 Écrire le test property-based pour la complétion anticipée
    - **Propriété 7 : Complétion anticipée de la manche**
    - **Valide : Exigences 4.4**

  - [x] 4.9 Écrire le test property-based pour le rematch
    - **Propriété 13 : Rematch — membres, couronne et promotion des spectateurs**
    - **Valide : Exigences 10.2, 10.3, 10.5, 10.6, 10.7**

- [x] 5. Checkpoint — Vérifier que tous les tests du game engine passent
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Étendre le LobbyManager et l'API REST (backend)
  - [x] 6.1 Étendre le LobbyManager pour supporter `gameType`
    - Ajouter le champ `gameType` à la création de lobby
    - Initialiser `tierListSession: null` sur les nouveaux lobbies
    - Mettre à jour `DEFAULT_CONFIG` si nécessaire
    - _Exigences : 11.1_

  - [x] 6.2 Étendre les routes REST API
    - Modifier `POST /api/lobbies` pour accepter `gameType: 'tierlist'` dans le body et retourner `joinUrl: /game/tierlist/:code`
    - Ajouter `GET /api/themes` : retourne la liste des catégories avec ≥5 éléments depuis l'ItemStore
    - Ajouter la carte de jeu « Tier List Game » dans `INTERNAL_GAMES`
    - _Exigences : 11.7, 14.2_

  - [x] 6.3 Écrire les tests unitaires pour les extensions REST API
    - Tester la création de lobby avec `gameType: 'tierlist'`
    - Tester `GET /api/themes` retourne les catégories valides
    - _Exigences : 14.2_

- [x] 7. Étendre le serveur WebSocket (backend)
  - [x] 7.1 Étendre `GameWebSocketServer` pour le tier list
    - Ajouter le handler pour `SUBMIT_TIER_VOTE` : validation et routage vers `TierListGameEngine.submitVote()`
    - Modifier `handleStartGame` pour router vers `TierListGameEngine.startGame()` quand `gameType === 'tierlist'`
    - Instancier `TierListGameEngine` dans le constructeur avec les callbacks de diffusion appropriés
    - Implémenter les callbacks : `onRouletteStart`, `onRouletteResult`, `onTierListRoundStart`, `onVoteStatus`, `onSuspenseStart`, `onTierListRoundResult`, `onTierListGameEnded`, `onTimerTick`, `onRematchCountdown`
    - Étendre `buildSpectatorPayload` pour inclure l'état tier list quand `gameType === 'tierlist'`
    - _Exigences : 11.2, 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 8. Checkpoint — Vérifier que tout le backend compile et que les tests passent
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implémenter les services frontend Angular
  - [x] 9.1 Créer le service `TierListGameStateService`
    - Créer `frontend/src/app/services/tierlist-game-state.service.ts`
    - Gérer l'état du jeu tier list : thème courant, élément en cours, tier list construite, votes, scores, classement
    - Exposer des signaux/observables pour chaque phase : `roulette`, `playing`, `suspense`, `round_results`, `results`
    - S'abonner aux messages WebSocket tier list via `WebSocketService`
    - Gérer les transitions de phase automatiques
    - _Exigences : 2.1, 2.2, 2.3, 2.4, 8.4, 8.5_

  - [x] 9.2 Étendre le `WebSocketService` existant
    - Ajouter les méthodes d'envoi pour `SUBMIT_TIER_VOTE`
    - Ajouter les observables/sujets pour les nouveaux types de messages serveur tier list
    - _Exigences : 11.2, 12.1_

  - [x] 9.3 Étendre le `LobbyService` existant
    - Modifier la création de lobby pour supporter `gameType: 'tierlist'`
    - Ajouter la méthode `getThemes()` pour appeler `GET /api/themes`
    - _Exigences : 11.1, 14.2_

- [x] 10. Implémenter la page de jeu Tier List (frontend)
  - [x] 10.1 Créer le composant principal `TierListGameComponent`
    - Créer `frontend/src/app/pages/tierlist-game/tierlist-game.component.ts` (+ HTML, SCSS)
    - Ajouter la route `/game/tierlist/:code` dans `app.routes.ts`
    - Implémenter le switch de phase basé sur l'état du `TierListGameStateService`
    - Gérer le flux de connexion : prompt username → WebSocket → avatar
    - _Exigences : 11.6, 15.1_

  - [x] 10.2 Implémenter la phase Lobby
    - Créer le sous-composant `tierlist-lobby` dans `phases/`
    - Réutiliser le layout existant du lobby (liste joueurs, config hôte, lien partageable, bouton Start)
    - Configuration spécifique : minuteur de vote (5-120s), mode (catégorie/aléatoire)
    - _Exigences : 11.1, 4.1_

  - [x] 10.3 Implémenter la phase Roulette
    - Créer le sous-composant `tierlist-roulette` dans `phases/`
    - Animation de défilement horizontal des noms de thèmes avec décélération progressive
    - Réception du thème sélectionné via WebSocket et arrêt de l'animation
    - Transition directe vers l'écran de jeu
    - _Exigences : 1.1, 1.2, 1.4, 13.1_

  - [x] 10.4 Implémenter la phase de Jeu (vote par drag-drop)
    - Créer le sous-composant `tierlist-gameplay` dans `phases/`
    - Afficher le nom du thème en haut
    - Afficher la tier list avec 6 tiers (S, A, B, C, D, F) et couleurs classiques
    - Afficher l'élément en cours de vote de manière proéminente
    - Implémenter le drag-drop via Angular CDK : glisser l'élément vers un tier pour voter
    - Afficher les portraits des joueurs avec animations d'attente/coches
    - Afficher l'indicateur de progression (« Élément X/Y »)
    - Afficher le minuteur de vote en temps réel
    - Conserver les placements précédents visibles dans la tier list
    - _Exigences : 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 8.4, 8.5, 15.2, 15.4, 15.5_

  - [x] 10.5 Implémenter la phase de Suspense
    - Créer le sous-composant `tierlist-suspense` dans `phases/`
    - Élément en rotation/lévitation au-dessus de la tier list
    - Effet sonore de roulement de tambour
    - Indicateur visuel de suspense
    - Durée 2-4 secondes puis transition vers le résultat
    - _Exigences : 5.1, 5.2, 5.3, 5.4, 13.3, 13.6_

  - [x] 10.6 Implémenter la phase de Résultat de Manche
    - Créer le sous-composant `tierlist-round-result` dans `phases/`
    - Animation de l'élément glissant dans son tier final
    - Affichage des portraits des joueurs dans le tier pour lequel ils ont voté
    - Mise à jour des scores avec animation
    - Transition automatique vers la manche suivante après délai
    - _Exigences : 6.3, 6.4, 6.6, 8.1, 13.4, 13.5, 13.7_

  - [x] 10.7 Implémenter la phase de Fin de Partie
    - Créer le sous-composant `tierlist-end-game` dans `phases/`
    - Tier list complète en plein écran
    - Bouton pour afficher le classement final
    - Classement trié par score cumulé décroissant
    - Animation de couronne pour le gagnant
    - Compte à rebours de 30 secondes pour le rematch
    - Gestion des co-gagnants en cas d'égalité
    - _Exigences : 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.5, 10.7, 13.8_

- [x] 11. Intégration et câblage final
  - [x] 11.1 Ajouter la carte Tier List Game sur la page Hub
    - Ajouter une carte de jeu interne « Tier List Game » dans le composant Hub
    - Clic → POST `/api/lobbies` avec `gameType: 'tierlist'` → navigation vers `/game/tierlist/:code`
    - _Exigences : 11.7_

  - [x] 11.2 Vérifier la compatibilité mobile et le style SCSS
    - S'assurer que tous les composants tier list sont fonctionnels sur mobile
    - Vérifier la cohérence du style visuel avec le Game Hub existant (éléments arrondis, typographie grasse, couleurs vives)
    - _Exigences : 15.2, 15.3, 15.4_

  - [x] 11.3 Écrire les tests d'intégration WebSocket pour le flux tier list
    - Tester le flux complet : roulette → vote → suspense → résultat → manche suivante → fin
    - Tester la diffusion du statut de vote sans révéler le tier
    - Tester la complétion anticipée via WebSocket
    - Tester le rematch automatique après 30 secondes
    - _Exigences : 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 12. Checkpoint final — Vérifier que tous les tests passent et que l'application compile
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Les tâches marquées avec `*` sont optionnelles et peuvent être ignorées pour un MVP plus rapide
- Chaque tâche référence les exigences spécifiques pour la traçabilité
- Les checkpoints assurent une validation incrémentale
- Les tests property-based valident les propriétés de correction universelles du document de design
- Les tests unitaires valident des exemples spécifiques et des cas limites
- Le jeu réutilise intégralement l'infrastructure existante : LobbyManager, WebSocket, avatars, ItemStore, TimerManager, reconnexion, gestion de l'hôte
