# Implementation Plan: Cloudflare Avatar System

## Overview

Replace the SVG-based avatar generation with a Cloudflare R2-hosted PNG image system. The backend selects a unique head+accessory combination per player, constructs URLs from a configurable base URL, and broadcasts them via WebSocket. The frontend composites two image layers (accessory behind head) for display. All `avatarDataUri` references are migrated to `avatarHeadUrl` + `avatarAccessoryUrl` across shared types, backend modules, frontend services, and components.

## Tasks

- [x] 1. Set up environment configuration and install dependencies
  - [x] 1.1 Install `dotenv` dependency in the backend
    - Run `npm install dotenv` in the `backend/` directory
    - _Requirements: 2.1_
  - [x] 1.2 Create `backend/.env.example` file
    - Document `CLOUDFLARE_AVATAR_BASE_URL=https://pub-urlid.r2.dev`
    - _Requirements: 2.7_
  - [x] 1.3 Create `backend/.env` file with the actual base URL
    - Set `CLOUDFLARE_AVATAR_BASE_URL=https://pub-urlid.r2.dev`
    - Verify `.env` is already in `.gitignore`
    - _Requirements: 2.1, 2.8_
  - [x] 1.4 Add `dotenv` config loading to `backend/src/index.ts` or server entry point
    - Add `import 'dotenv/config'` at the top of the backend entry point so env vars are available before any module uses them
    - _Requirements: 2.1_

- [x] 2. Update shared types and WebSocket message payloads
  - [x] 2.1 Update `shared/types.ts` — replace `avatarDataUri` with `avatarHeadUrl` and `avatarAccessoryUrl`
    - In the `Player` interface, remove `avatarDataUri: string` and add `avatarHeadUrl: string` and `avatarAccessoryUrl: string | null`
    - _Requirements: 4.1_
  - [x] 2.2 Update `shared/ws-messages.ts` — migrate all payload interfaces
    - Replace `avatarDataUri: string` with `avatarHeadUrl: string` and `avatarAccessoryUrl: string | null` in: `AvatarAssignedPayload`, `PlayerScore`, `LeaderboardEntry`, `PlayerTierVote`, `PlayerProximityScore`
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 3. Rewrite backend avatar generator
  - [x] 3.1 Rewrite `backend/src/avatar/avatar-generator.ts`
    - Remove all SVG composition logic (feature layers, SVG rendering, data URI encoding)
    - Define `HEADS` array with 15 head names: Alberto, Antoine, Charles, Cyprien, Dami le boss, Damien, Dorian, Doriprogra, Grotoine, Jonathan Normal, Jonathan, Michel, Miel, Ragnarok réel, Ragnarok
    - Define `ACCESSORIES` array with 3 accessory names: Collar, Fool, Hood
    - Define `ACCESSORY_OPTIONS` as `[...ACCESSORIES, 'none']`
    - Implement `getBaseUrl()` that reads `CLOUDFLARE_AVATAR_BASE_URL` from `process.env` and throws if not set
    - Implement `buildHeadUrl(headName: string): string` — returns `{baseUrl}/heads/{encodeURIComponent(headName)}.png`
    - Implement `buildAccessoryUrl(accessoryName: string): string | null` — returns null for "none", otherwise `{baseUrl}/accessories/{encodeURIComponent(accessoryName)}.png`
    - Implement `buildCombinationKey(head: string, accessory: string): string` — returns `"{head}|{accessory}"`
    - Update `AvatarResult` interface to `{ headUrl: string; accessoryUrl: string | null; combinationKey: string }`
    - Implement `generateAvatar(usedCombinations: Set<string>): AvatarResult` — random head + random accessory option, reroll on collision up to 1000 attempts, add key to set
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 9.1_
  - [x] 3.2 Write property test for avatar combination validity
    - **Property 1: Avatar combination validity**
    - Generate random avatars and verify the combination key format is `"{head}|{accessory}"` where head is in HEADS and accessory is in ACCESSORY_OPTIONS
    - **Validates: Requirements 1.1, 1.2, 1.5**
  - [x] 3.3 Write property test for avatar uniqueness within a lobby
    - **Property 2: Avatar uniqueness within a lobby**
    - Generate N avatars (N ∈ [1, 60]) with a shared `usedCombinations` set and verify all keys are distinct and set size equals N
    - **Validates: Requirements 1.3, 8.1**
  - [x] 3.4 Write property test for URL construction correctness
    - **Property 3: URL construction correctness**
    - For any head/accessory from the valid sets, verify URL construction produces correctly formatted and encoded URLs, and that "none" maps to null
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5**
  - [x] 3.5 Rewrite unit tests in `backend/src/avatar/avatar-generator.test.ts`
    - Test asset registry sizes (15 heads, 3 accessories, 4 accessory options)
    - Test `buildHeadUrl` and `buildAccessoryUrl` produce correct URLs with encoding
    - Test `buildAccessoryUrl("none")` returns null
    - Test `generateAvatar` returns valid `AvatarResult` with headUrl, accessoryUrl, combinationKey
    - Test uniqueness across multiple generations
    - Test exhaustion error after all 60 combinations are used
    - Test missing `CLOUDFLARE_AVATAR_BASE_URL` throws error
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3_

- [x] 4. Checkpoint — Verify avatar generator
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Update backend modules to use new avatar fields
  - [x] 5.1 Update `backend/src/lobby/lobby-manager.ts`
    - Change `joinLobby()` to store `avatarHeadUrl` and `avatarAccessoryUrl` on the Player object instead of `avatarDataUri`
    - Update the import from `avatar-generator` to use the new `generateAvatar` return shape
    - _Requirements: 1.1, 1.2, 8.1, 8.2, 8.3, 9.2_
  - [x] 5.2 Update `backend/src/ws/ws-server.ts`
    - In `handleJoinLobby()`, broadcast `avatarHeadUrl` and `avatarAccessoryUrl` in AVATAR_ASSIGNED messages instead of `avatarDataUri`
    - In `handleReconnection()`, send `avatarHeadUrl` and `avatarAccessoryUrl` for all players
    - Update all references from `player.avatarDataUri` to `player.avatarHeadUrl` and `player.avatarAccessoryUrl`
    - _Requirements: 7.1, 7.2, 7.3, 9.2_
  - [x] 5.3 Update `backend/src/game/game-engine.ts`
    - Replace `player.avatarDataUri` with `player.avatarHeadUrl` and `player.avatarAccessoryUrl` in `PlayerScore` construction
    - _Requirements: 4.3, 9.2_
  - [x] 5.4 Update `backend/src/scoring/scoring-engine.ts`
    - Replace `player.avatarDataUri` with `player.avatarHeadUrl` and `player.avatarAccessoryUrl` in `LeaderboardEntry` construction
    - _Requirements: 4.4, 9.2_
  - [x] 5.5 Update `backend/src/tierlist/tierlist-game-engine.ts`
    - Replace `player.avatarDataUri` with `player.avatarHeadUrl` and `player.avatarAccessoryUrl` in `PlayerTierVote` and `PlayerProximityScore` construction
    - _Requirements: 4.5, 4.6, 9.2_
  - [x] 5.6 Update `backend/src/tierlist/tierlist-scoring-engine.ts`
    - Replace `player.avatarDataUri` with `player.avatarHeadUrl` and `player.avatarAccessoryUrl` in `LeaderboardEntry` construction
    - _Requirements: 4.4, 9.2_

- [x] 6. Checkpoint — Verify backend compiles and existing tests structure
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update frontend avatar service and component
  - [x] 7.1 Update `frontend/src/app/services/avatar.service.ts`
    - Change cache type from `Map<string, string>` to `Map<string, { headUrl: string; accessoryUrl: string | null }>`
    - Update `init()` to cache `{ headUrl: payload.avatarHeadUrl, accessoryUrl: payload.avatarAccessoryUrl }`
    - Update `getAvatar()` to return `{ headUrl: string; accessoryUrl: string | null } | undefined`
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 7.2 Update `frontend/src/app/components/player-avatar/player-avatar.component.ts`
    - Replace `src` input with `headSrc` (string | undefined) and `accessorySrc` (string | null | undefined) inputs
    - Update template to render accessory image behind head image using CSS positioning (accessory as background layer, head as foreground)
    - Show fallback placeholder when `headSrc` is undefined
    - When `accessorySrc` is null or undefined, render only the head image
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 8. Update all frontend game components
  - [x] 8.1 Update `frontend/src/app/pages/game/phases/lobby/lobby.component.ts` and its template
    - Change `getAvatar()` to return the new `{ headUrl, accessoryUrl }` shape
    - Update template bindings from `[src]="getAvatar(player.id)"` to `[headSrc]="getAvatar(player.id)?.headUrl"` and `[accessorySrc]="getAvatar(player.id)?.accessoryUrl"`
    - _Requirements: 5.1, 5.2, 5.5_
  - [x] 8.2 Update `frontend/src/app/pages/game/phases/round-results/round-results.component.ts` and its template
    - Same pattern: update `getAvatar()` return type and template bindings to use `headSrc` and `accessorySrc`
    - _Requirements: 5.1, 5.2, 5.5_
  - [x] 8.3 Update `frontend/src/app/pages/game/phases/end-game/end-game.component.ts` and its template
    - Same pattern: update `getAvatar()` return type and template bindings
    - _Requirements: 5.1, 5.2, 5.5_
  - [x] 8.4 Update `frontend/src/app/pages/tierlist-game/phases/tierlist-lobby/tierlist-lobby.component.ts` and its template
    - Same pattern: update `getAvatar()` return type and template bindings
    - _Requirements: 5.1, 5.2, 5.5_
  - [x] 8.5 Update `frontend/src/app/pages/tierlist-game/phases/tierlist-gameplay/tierlist-gameplay.component.ts` and its template
    - Same pattern: update `getAvatar()` return type and template bindings
    - _Requirements: 5.1, 5.2, 5.5_
  - [x] 8.6 Update `frontend/src/app/pages/tierlist-game/phases/tierlist-round-result/tierlist-round-result.component.ts` and its template
    - Same pattern: update `getAvatar()` return type and template bindings
    - _Requirements: 5.1, 5.2, 5.5_
  - [x] 8.7 Update `frontend/src/app/pages/tierlist-game/phases/tierlist-end-game/tierlist-end-game.component.ts` and its template
    - Same pattern: update `getAvatar()` return type and template bindings
    - _Requirements: 5.1, 5.2, 5.5_

- [x] 9. Update frontend test files
  - [x] 9.1 Update `frontend/src/app/pages/game/phases/end-game/end-game.component.spec.ts`
    - Replace `avatarDataUri: ''` with `avatarHeadUrl: ''` and `avatarAccessoryUrl: null` in all test data
    - _Requirements: 9.2, 9.3_
  - [x] 9.2 Update `frontend/src/app/pages/game/game.component.spec.ts`
    - Replace `avatarDataUri: ''` with `avatarHeadUrl: ''` and `avatarAccessoryUrl: null` in all mock player data
    - _Requirements: 9.2, 9.3_

- [x] 10. Checkpoint — Verify frontend compiles
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Update backend test files
  - [x] 11.1 Update `backend/src/lobby/lobby-manager.test.ts`
    - Update assertions from `avatarDataUri` to `avatarHeadUrl` and `avatarAccessoryUrl`
    - Verify combination key retention on leave and lobby cleanup
    - _Requirements: 8.1, 8.2, 8.3, 9.3_
  - [x] 11.2 Update `backend/src/lobby/lobby-manager.property.test.ts`
    - Update property test assertions to check `avatarHeadUrl` and `avatarAccessoryUrl` instead of `avatarDataUri`
    - _Requirements: 8.1, 9.3_
  - [x] 11.3 Update `backend/src/game/game-engine.test.ts`
    - Update any mock player data from `avatarDataUri` to `avatarHeadUrl` and `avatarAccessoryUrl`
    - _Requirements: 9.3_
  - [x] 11.4 Update `backend/src/game/game-engine.property.test.ts`
    - Update any mock player data from `avatarDataUri` to `avatarHeadUrl` and `avatarAccessoryUrl`
    - _Requirements: 9.3_
  - [x] 11.5 Update `backend/src/scoring/scoring-engine.test.ts`
    - Update any mock player data from `avatarDataUri` to `avatarHeadUrl` and `avatarAccessoryUrl`
    - _Requirements: 9.3_
  - [x] 11.6 Update `backend/src/scoring/scoring-engine.property.test.ts`
    - Update any mock player data from `avatarDataUri` to `avatarHeadUrl` and `avatarAccessoryUrl`
    - _Requirements: 9.3_
  - [x] 11.7 Update `backend/src/tierlist/tierlist-scoring-engine.property.test.ts`
    - Update mock player data from `avatarDataUri` to `avatarHeadUrl` and `avatarAccessoryUrl`
    - _Requirements: 9.3_
  - [x] 11.8 Update `backend/src/tierlist/tierlist-game-engine.property.test.ts`
    - Update mock player data from `avatarDataUri` to `avatarHeadUrl` and `avatarAccessoryUrl`
    - _Requirements: 9.3_
  - [x] 11.9 Update `backend/src/integration/ws-game-flows.test.ts`
    - Update integration tests to verify AVATAR_ASSIGNED messages contain `avatarHeadUrl` and `avatarAccessoryUrl` instead of `avatarDataUri`
    - Verify reconnection avatar sync sends the new fields
    - _Requirements: 7.1, 7.2, 7.3, 9.3_

- [-] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The `.env` file is already excluded via `.gitignore` — no changes needed there
- The Cloudflare base URL for `.env.example` is `https://pub-urlid.r2.dev`
