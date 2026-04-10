# Requirements Document

## Introduction

Replace the current SVG-based avatar generation system with a Cloudflare-hosted PNG image avatar system. An avatar is composed of a head image and an optional accessory image (rendered behind the head). The backend selects a unique head+accessory combination per player within a lobby and sends the image URLs to clients. The frontend composites the two layers for display. All images are 380×380 PNG files hosted on Cloudflare.

## Glossary

- **Avatar_Service_Backend**: The backend module responsible for selecting avatar combinations and producing image URLs. Replaces the current `avatar-generator.ts`.
- **Avatar_Component**: The Angular frontend component (`player-avatar.component.ts`) responsible for rendering the composited avatar from head and accessory image URLs.
- **Avatar_Service_Frontend**: The Angular service (`avatar.service.ts`) that caches and distributes avatar data per player.
- **Lobby_Manager**: The backend module that manages lobbies, player join/leave, and delegates avatar assignment.
- **Head**: A 380×380 PNG image representing the main face of an avatar. Hosted in the `heads` directory on Cloudflare.
- **Accessory**: A 380×380 PNG image representing an optional decoration rendered behind the head. Hosted in the `accessories` directory on Cloudflare.
- **Combination_Key**: A string identifying a unique head+accessory pair (e.g., `"Antoine|Hood"` or `"Michel|none"`).
- **Cloudflare_Base_URL**: A configurable base URL (environment variable) pointing to the Cloudflare image hosting root.

## Requirements

### Requirement 1: Avatar Combination Selection

**User Story:** As a player, I want to receive a unique avatar when I join a lobby, so that I am visually distinguishable from other players.

#### Acceptance Criteria

1. WHEN a player joins a lobby, THE Avatar_Service_Backend SHALL select a random head from the list of available heads.
2. WHEN a player joins a lobby, THE Avatar_Service_Backend SHALL select a random accessory from the list of available accessories or select no accessory.
3. THE Avatar_Service_Backend SHALL ensure that the selected Combination_Key is not already in use within the same lobby.
4. IF the Avatar_Service_Backend cannot find a unique combination after 1000 attempts, THEN THE Avatar_Service_Backend SHALL throw an error indicating that no unique avatar is available.
5. THE Avatar_Service_Backend SHALL produce a Combination_Key in the format `"{head}|{accessory}"` where accessory is `"none"` when no accessory is selected.

### Requirement 2: Cloudflare URL Construction

**User Story:** As a developer, I want avatar image URLs to be constructed from a configurable base URL, so that the hosting location can change without code modifications.

#### Acceptance Criteria

1. THE Avatar_Service_Backend SHALL read the Cloudflare_Base_URL from the `CLOUDFLARE_AVATAR_BASE_URL` environment variable loaded from a `.env` file at the backend root.
6. IF the `CLOUDFLARE_AVATAR_BASE_URL` environment variable is not set, THE Avatar_Service_Backend SHALL throw an error indicating the variable is required.
7. A `.env.example` file SHALL be committed to the repository documenting the required environment variables.
8. THE `.env` file SHALL NOT be committed to the repository (already excluded via `.gitignore`).
2. WHEN constructing a head image URL, THE Avatar_Service_Backend SHALL produce a URL in the format `"{Cloudflare_Base_URL}/heads/{head_name}.png"`.
3. WHEN constructing an accessory image URL, THE Avatar_Service_Backend SHALL produce a URL in the format `"{Cloudflare_Base_URL}/accessories/{accessory_name}.png"`.
4. WHEN the selected accessory is "none", THE Avatar_Service_Backend SHALL set the accessory URL to `null`.
5. THE Avatar_Service_Backend SHALL URL-encode the head and accessory names to handle names containing spaces or special characters.

### Requirement 3: Available Asset Registry

**User Story:** As a developer, I want the list of available heads and accessories to be defined in one place, so that adding new assets only requires updating the registry.

#### Acceptance Criteria

1. THE Avatar_Service_Backend SHALL define a hardcoded list of available head names: Alberto, Antoine, Charles, Cyprien, Dami le boss, Damien, Dorian, Doriprogra, Grotoine, Jonathan Normal, Jonathan, Michel, Miel, Ragnarok réel, Ragnarok.
2. THE Avatar_Service_Backend SHALL define a hardcoded list of available accessory names: Collar, Fool, Hood.
3. THE Avatar_Service_Backend SHALL include "none" as a valid accessory option in addition to the named accessories.

### Requirement 4: Shared Type Migration

**User Story:** As a developer, I want the shared types to carry head and accessory URLs instead of a single data URI, so that the frontend can composite the avatar layers.

#### Acceptance Criteria

1. THE Player interface SHALL replace the `avatarDataUri` field with `avatarHeadUrl` (string) and `avatarAccessoryUrl` (string or null).
2. THE AvatarAssignedPayload SHALL replace the `avatarDataUri` field with `avatarHeadUrl` (string) and `avatarAccessoryUrl` (string or null).
3. THE PlayerScore interface SHALL replace the `avatarDataUri` field with `avatarHeadUrl` (string) and `avatarAccessoryUrl` (string or null).
4. THE LeaderboardEntry interface SHALL replace the `avatarDataUri` field with `avatarHeadUrl` (string) and `avatarAccessoryUrl` (string or null).
5. THE PlayerTierVote interface SHALL replace the `avatarDataUri` field with `avatarHeadUrl` (string) and `avatarAccessoryUrl` (string or null).
6. THE PlayerProximityScore interface SHALL replace the `avatarDataUri` field with `avatarHeadUrl` (string) and `avatarAccessoryUrl` (string or null).

### Requirement 5: Frontend Avatar Rendering

**User Story:** As a player, I want to see my avatar as a composited image with the accessory behind the head, so that the avatar looks correct.

#### Acceptance Criteria

1. THE Avatar_Component SHALL render the head image as the foreground layer.
2. WHEN an accessory URL is provided, THE Avatar_Component SHALL render the accessory image behind the head image.
3. WHEN no accessory URL is provided, THE Avatar_Component SHALL render only the head image.
4. THE Avatar_Component SHALL display a fallback placeholder when no head URL is available.
5. THE Avatar_Component SHALL accept `avatarHeadUrl` and `avatarAccessoryUrl` as inputs instead of a single `src` input.

### Requirement 6: Frontend Avatar Caching

**User Story:** As a player, I want avatar data to be cached on the frontend, so that avatars persist across UI navigations within a session.

#### Acceptance Criteria

1. WHEN an AVATAR_ASSIGNED message is received, THE Avatar_Service_Frontend SHALL cache the `avatarHeadUrl` and `avatarAccessoryUrl` keyed by player ID.
2. WHEN avatar data is requested for a player, THE Avatar_Service_Frontend SHALL return the cached `avatarHeadUrl` and `avatarAccessoryUrl`.
3. WHEN the service is destroyed, THE Avatar_Service_Frontend SHALL clear the avatar cache.

### Requirement 7: WebSocket Avatar Broadcasting

**User Story:** As a player, I want to receive avatar assignments for all players in my lobby, so that I can see everyone's avatar.

#### Acceptance Criteria

1. WHEN a player joins a lobby, THE WebSocket server SHALL broadcast an AVATAR_ASSIGNED message containing `playerId`, `avatarHeadUrl`, and `avatarAccessoryUrl` to all players in the lobby.
2. WHEN a new player joins, THE WebSocket server SHALL send AVATAR_ASSIGNED messages for all existing players to the new player.
3. WHEN a player reconnects, THE WebSocket server SHALL send AVATAR_ASSIGNED messages for all players to the reconnected player.

### Requirement 8: Lobby Avatar Uniqueness Tracking

**User Story:** As a player, I want each avatar in my lobby to be unique, so that players are easily distinguishable.

#### Acceptance Criteria

1. THE Lobby_Manager SHALL maintain a set of used Combination_Keys per lobby.
2. WHEN a player leaves a lobby, THE Lobby_Manager SHALL retain the used Combination_Key to prevent reassignment within the same lobby session.
3. WHEN a lobby is destroyed, THE Lobby_Manager SHALL release all tracked Combination_Keys for that lobby.

### Requirement 9: Removal of SVG Avatar Generator

**User Story:** As a developer, I want the old SVG avatar generation code removed, so that the codebase has no dead code.

#### Acceptance Criteria

1. THE codebase SHALL remove the SVG composition logic from `avatar-generator.ts` and replace it with the Cloudflare URL-based avatar selection logic.
2. THE codebase SHALL remove all references to `avatarDataUri` from shared types, backend modules, and frontend services.
3. THE codebase SHALL update all existing tests to work with the new avatar URL fields instead of `avatarDataUri`.
