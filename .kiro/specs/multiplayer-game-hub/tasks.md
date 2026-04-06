# Implementation Plan: Multiplayer Game Hub

## Overview

Build a full-stack multiplayer game hub with an Angular frontend (SCSS) and Node.js/TypeScript backend. Implementation proceeds bottom-up: shared types → backend core logic → backend networking → frontend services → frontend components → integration wiring. Property-based tests use fast-check; unit tests use Jest (backend) and Karma/Jasmine (frontend).

## Tasks

- [x] 1. Project scaffolding and shared types
  - [x] 1.1 Initialize monorepo structure with backend (Node.js/TypeScript/Express) and frontend (Angular) projects
    - Create `backend/` with `tsconfig.json`, `package.json` (express, ws, uuid, fast-check as devDep), Jest config
    - Create `frontend/` Angular project with SCSS styling, Angular CDK dependency
    - Create `shared/` directory for shared TypeScript interfaces
    - _Requirements: 13.1, 14.1, 14.5_

  - [x] 1.2 Define shared data model interfaces and types
    - Create `shared/types.ts` with `Player`, `Lobby`, `LobbyState`, `GameConfig`, `GameSession`, `RoundData`, `Item`, `GameCard`, `WSMessage` interfaces as specified in the design
    - Create `shared/ws-messages.ts` with all client→server and server→client message type constants and payload interfaces
    - _Requirements: 2.2, 11.1_

- [x] 2. Backend: Avatar generation
  - [x] 2.1 Implement AvatarGenerator module
    - Create `backend/src/avatar/avatar-generator.ts`
    - Define feature layer option sets (face shape ×6, skin color ×8, eyes ×10, mouth ×8, hair style ×12 × color ×8, accessories ×6)
    - Implement `generateAvatar(usedCombinations: Set<string>): AvatarResult` that picks random features, rerolls on collision, and composes an SVG data URI
    - Track used combinations per lobby to ensure uniqueness
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 2.2 Write property test: Avatar completeness (Property 2)
    - **Property 2: Avatar completeness**
    - Verify every generated avatar contains all required layers with values within valid sets
    - **Validates: Requirements 4.1**

  - [x] 2.3 Write property test: Avatar uniqueness within a lobby (Property 3)
    - **Property 3: Avatar uniqueness within a lobby**
    - Generate N avatars (N ≤ 20) for a lobby and verify all feature tuples are distinct
    - **Validates: Requirements 4.2**

- [x] 3. Backend: Item store and selection logic
  - [x] 3.1 Implement ItemStore module
    - Create `backend/src/items/item-store.ts`
    - Load items from a JSON data file organized by category
    - Implement `selectItems(mode, usedItemIds, category?)` returning 5 items per the mode rules
    - Category mode: all 5 from one category; Random mode: items from multiple categories
    - Track used item IDs per session to prevent repeats
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 3.2 Create seed item data file
    - Create `backend/data/items.json` with at least 4 categories, each with at least 25 items (enough for 20 rounds)
    - Each item: `{ id, displayName, imageUrl, category }`
    - _Requirements: 6.4_

  - [x] 3.3 Write property test: Category mode selects from single category (Property 5)
    - **Property 5: Category mode selects items from a single category**
    - **Validates: Requirements 6.1**

  - [x] 3.4 Write property test: Random mode selects from multiple categories (Property 6)
    - **Property 6: Random mode selects items from multiple categories**
    - **Validates: Requirements 6.2**

  - [x] 3.5 Write property test: No item repetition across rounds (Property 7)
    - **Property 7: No item repetition across rounds**
    - Simulate R rounds of item selection and verify 5×R unique item IDs
    - **Validates: Requirements 6.3**

- [x] 4. Backend: Scoring engine
  - [x] 4.1 Implement ScoringEngine module
    - Create `backend/src/scoring/scoring-engine.ts`
    - Implement `computeConsensusScores(rankings, itemIds)` per the design algorithm
    - Implement `updateCumulativeScores(cumulativeScores, roundScores)`
    - Implement `buildLeaderboard(cumulativeScores, players)` returning sorted leaderboard with winner/tie detection
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.3, 9.1, 9.3_

  - [x] 4.2 Write property test: Scoring algorithm correctness (Property 8)
    - **Property 8: Scoring algorithm correctness**
    - Verify average positions and consensus scores match the formula for arbitrary rankings
    - **Validates: Requirements 7.1, 7.2**

  - [x] 4.3 Write property test: Scoring monotonicity (Property 9)
    - **Property 9: Scoring monotonicity — closer to consensus means higher score**
    - **Validates: Requirements 7.3**

  - [x] 4.4 Write property test: Leaderboard sorting and winner determination (Property 10)
    - **Property 10: Leaderboard sorting and winner determination**
    - Verify descending sort and correct winner/co-winner identification
    - **Validates: Requirements 8.3, 9.1, 9.3**

- [x] 5. Checkpoint — Core backend logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Backend: Lobby manager
  - [x] 6.1 Implement LobbyManager module
    - Create `backend/src/lobby/lobby-manager.ts`
    - Implement `createLobby(config): Lobby` with 6-char alphanumeric code generation
    - Implement `joinLobby(code, username): Player` — assigns avatar, sets `isSpectator` based on lobby state
    - Implement `leaveLobby(code, playerId)` — handles host reassignment to next player by join order
    - Implement `getLobby(code)` and `destroyLobby(code)`
    - Implement `updateConfig(code, hostId, partialConfig)` — validates host permission and config ranges
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.6, 12.1, 12.3_

  - [x] 6.2 Implement GameConfig validation
    - Validate rounds (1–20), timerSeconds (5–120, default 15), mode ('category' | 'random')
    - Return descriptive error messages for invalid values
    - _Requirements: 2.4, 2.5, 2.6_

  - [x] 6.3 Write property test: GameConfig validation (Property 1)
    - **Property 1: GameConfig validation accepts valid ranges and rejects invalid ranges**
    - **Validates: Requirements 2.4, 2.5**

  - [x] 6.4 Write property test: Spectator assignment based on join timing (Property 13)
    - **Property 13: Spectator assignment based on join timing**
    - Verify players joining in 'waiting' state are active; players joining in other states are spectators
    - **Validates: Requirements 3.3, 3.4**

  - [x] 6.5 Write property test: Host reassignment follows join order (Property 14)
    - **Property 14: Host reassignment follows join order**
    - Verify lowest joinOrder player becomes host when current host leaves
    - **Validates: Requirements 12.1, 12.4**

- [x] 7. Backend: Game engine and timer
  - [x] 7.1 Implement TimerManager module
    - Create `backend/src/game/timer-manager.ts`
    - Manage per-round countdown timers with tick callbacks
    - Trigger round-end callback on expiry
    - _Requirements: 5.5, 5.6_

  - [x] 7.2 Implement GameEngine module
    - Create `backend/src/game/game-engine.ts`
    - Implement round lifecycle: `startGame(lobby)` → `startRound()` → collect rankings → `endRound()` → results → next round or end game
    - Handle early completion when all active players submit before timer
    - Handle `submitRanking(playerId, ranking)` — reject spectators, validate item IDs
    - Implement rematch flow: 30-second countdown → auto-start → promote spectators → assign crown to previous winner
    - Use ItemStore for item selection per round
    - Use ScoringEngine for scoring after each round
    - _Requirements: 5.1, 5.2, 5.4, 5.6, 5.7, 7.4, 8.4, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 7.3 Write property test: Round completion captures current rankings (Property 4)
    - **Property 4: Round completion captures current rankings**
    - Verify recorded rankings match submitted or default order for each player
    - **Validates: Requirements 5.6, 5.7**

  - [x] 7.4 Write property test: Rematch membership, crown, and spectator promotion (Property 11)
    - **Property 11: Rematch lobby membership, crown assignment, and spectator promotion**
    - Verify connected players included, spectators promoted, crown assigned to previous winner
    - **Validates: Requirements 10.2, 10.4, 10.5, 10.6, 10.7**

- [x] 8. Backend: REST API and WebSocket server
  - [x] 8.1 Implement REST API endpoints with Express
    - Create `backend/src/api/routes.ts`
    - `POST /api/lobbies` — create lobby with config validation, return `{ lobbyCode, joinUrl }`
    - `GET /api/lobbies/:code` — return lobby status (exists, state, player count, config)
    - `GET /api/games` — return internal + external game metadata
    - Proper error responses (400, 404, 500) per design error handling table
    - _Requirements: 2.1, 13.4_

  - [x] 8.2 Implement WebSocket server with message routing
    - Create `backend/src/ws/ws-server.ts`
    - Handle all client→server message types: `JOIN_LOBBY`, `START_GAME`, `SUBMIT_RANKING`, `LEAVE_LOBBY`, `UPDATE_CONFIG`
    - Broadcast all server→client message types per the design protocol
    - Implement 15-second reconnection grace period with session retention
    - Handle error cases: wrong lobby, spectator submit, non-host actions, invalid messages
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 12.2_

  - [x] 8.3 Create main server entry point
    - Create `backend/src/server.ts`
    - Wire Express app + WebSocket server on same HTTP server
    - Initialize LobbyManager, GameEngine, ItemStore, AvatarGenerator
    - _Requirements: 13.1, 13.3, 13.4_

- [x] 9. Checkpoint — Full backend
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Frontend: Core services
  - [x] 10.1 Implement WebSocketService
    - Create `frontend/src/app/services/websocket.service.ts`
    - Manage WebSocket connection lifecycle (connect, disconnect, reconnect with exponential backoff: 1s, 2s, 4s, 8s)
    - Expose Observable streams per message type using RxJS subjects
    - Handle reconnection overlay state
    - _Requirements: 11.2, 11.4_

  - [x] 10.2 Implement LobbyService
    - Create `frontend/src/app/services/lobby.service.ts`
    - REST calls using native `fetch` for lobby creation (`POST /api/lobbies`) and status (`GET /api/lobbies/:code`)
    - _Requirements: 2.1, 13.2_

  - [x] 10.3 Implement GameStateService
    - Create `frontend/src/app/services/game-state.service.ts`
    - Manage current game phase (`waiting`, `playing`, `round_results`, `results`, `rematch_countdown`)
    - Track current round, items, timer, rankings, player role (host/active/spectator)
    - Coordinate between WebSocket events and UI state
    - Handle rematch auto-start transition
    - _Requirements: 2.2, 5.5, 10.1_

  - [x] 10.4 Implement AvatarService
    - Create `frontend/src/app/services/avatar.service.ts`
    - Receive and cache avatar data URIs from server
    - _Requirements: 4.3_

- [x] 11. Frontend: Hub page
  - [x] 11.1 Implement Hub page component with game card grid
    - Create `frontend/src/app/pages/hub/` component
    - Fetch game list from `GET /api/games`
    - Render responsive card grid (internal + external games)
    - Internal cards: navigate to create lobby flow
    - External cards: open URL in new tab with external link indicator icon
    - Playful Gartic Phone-inspired SCSS styling: rounded elements, bold typography, vibrant colors
    - _Requirements: 1.1, 1.2, 1.3, 14.2, 14.5, 14.6, 14.7, 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 11.2 Write property test: Game card rendering completeness (Property 12)
    - **Property 12: Game card rendering completeness**
    - Verify all cards rendered, titles/descriptions present, external indicator on external cards only
    - **Validates: Requirements 1.1, 2.7, 15.1, 15.4**

- [x] 12. Frontend: Game page — Lobby phase
  - [x] 12.1 Implement Game page component with phase-based view switching
    - Create `frontend/src/app/pages/game/` component
    - Route: `/game/ranking/:code`
    - Switch rendered view based on `GameStateService.currentPhase`
    - _Requirements: 2.2_

  - [x] 12.2 Implement Lobby phase view
    - Username prompt on join (if not already joined)
    - Host view: settings configuration (rounds slider 1–20, timer slider 5–120s, mode toggle) + player list in unified layout
    - Non-host view: player list with avatars and usernames, waiting message
    - Shareable link display with copy-to-clipboard button
    - Host "Start Game" button
    - Spectator badge for players who joined mid-game (visible during rematch lobby)
    - SCSS styling consistent with Gartic Phone aesthetic
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 12.3, 14.2, 14.5, 14.6, 14.7_

  - [x] 12.3 Write property test: Game page renders correct view for lobby state (Property 15)
    - **Property 15: Game page renders correct view for lobby state**
    - Verify each lobby state maps to a distinct view
    - **Validates: Requirements 2.2**

- [x] 13. Frontend: Game page — Gameplay phase
  - [x] 13.1 Implement Gameplay phase view
    - Display 5 item cards (image + text overlay) using Angular CDK `DragDropModule`
    - Drag-and-drop reordering of ranking list
    - Round timer countdown display
    - Submit button (sends `SUBMIT_RANKING` via WebSocket)
    - Auto-submit on timer expiry (use current order)
    - Round number indicator (e.g., "Round 2 of 5")
    - Spectator read-only view with "Spectating" indicator, no submit button
    - Smooth drag-and-drop animations via SCSS
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 14.3, 14.4_

- [x] 14. Frontend: Game page — Results phases
  - [x] 14.1 Implement Round Results view
    - Display average ranking of 5 items for the round
    - Per-player scores with avatars and usernames
    - Cumulative leaderboard sorted by total score
    - Host "Next Round" button to advance
    - Score reveal animations
    - _Requirements: 7.4, 8.1, 8.2, 8.3, 8.4, 14.3_

  - [x] 14.2 Implement End-of-Game Results view
    - Final leaderboard sorted by total consensus score
    - Winner highlight with crown animation (handle ties as co-winners)
    - 30-second rematch countdown display
    - Auto-transition to gameplay phase when countdown expires (no navigation, same URL)
    - _Requirements: 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 14.3_

- [x] 15. Frontend: Error handling and reconnection UX
  - [x] 15.1 Implement error handling UI
    - Toast notification system for REST errors with retry option
    - "Reconnecting..." overlay with spinner on WebSocket disconnect
    - Invalid lobby link: redirect to hub with error toast
    - Spectator overlay for mid-game joiners explaining they'll play in next rematch
    - _Requirements: 3.7, 11.4_

- [x] 16. Checkpoint — Full frontend
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Integration wiring and end-to-end flow
  - [x] 17.1 Wire frontend to backend — full game lifecycle
    - Configure Angular proxy for development (API + WebSocket)
    - Verify complete flow: hub → create lobby → join → configure → start → play rounds → results → rematch auto-start
    - Verify mid-game join → spectator view → promoted on rematch
    - Verify host leave → reassignment → game continues
    - Verify external game cards open in new tabs
    - _Requirements: 1.2, 2.2, 3.4, 3.5, 10.2, 12.1, 15.3_

  - [x] 17.2 Write integration tests for WebSocket game flows
    - Test player join → lobby broadcast
    - Test full round lifecycle (start → rank → submit → score → results)
    - Test timer expiry auto-submission
    - Test early completion when all players submit
    - Test reconnection within and after 15-second grace period
    - Test host disconnect → reassignment broadcast
    - Test rematch countdown and auto-start
    - Test spectator promotion on rematch
    - _Requirements: 11.1, 11.3, 11.4, 11.5, 12.2_

- [x] 18. Final checkpoint — All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- Backend uses Jest; frontend uses Karma/Jasmine
- All styling is custom SCSS — no CSS frameworks
