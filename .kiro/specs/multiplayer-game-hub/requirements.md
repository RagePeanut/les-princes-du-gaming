# Requirements Document

## Introduction

A multiplayer game hub web application (similar to neal.fun) built with an Angular frontend and a Node.js/TypeScript backend. The hub hosts browser-based multiplayer games accessible via shareable links. The first game is a ranking game where players rank 5 items per round, earn points based on consensus with other players, and compete across configurable rounds. Real-time synchronization is handled via WebSockets. The visual style is playful and game-like, inspired by Gartic Phone.

## Glossary

- **Game_Hub**: The main Angular web application that serves as the entry point and hosts all multiplayer games.
- **Ranking_Game**: The first game in the hub where players rank 5 items per round and earn points based on proximity to the group average ranking.
- **Host**: The player who creates a game lobby and configures game settings (number of rounds, game mode).
- **Player**: Any user who joins a game lobby, including the Host.
- **Lobby**: A waiting room phase where Players gather before a game starts, displayed as part of the unified game page (`/game/ranking/:code`). The Host configures settings and sees joined players simultaneously.
- **Round**: A single phase of the Ranking_Game in which all Players rank the same 5 items.
- **Item**: A rankable element represented by an image with centered text overlay.
- **Category_Mode**: A game mode where all 5 items in a round come from the same category (e.g., "types of pasta").
- **Random_Mode**: A game mode where the 5 items in a round are picked at random from multiple categories.
- **Ranking_List**: An ordered list of 5 Items arranged from top (best) to bottom (worst) by a Player via drag and drop.
- **Consensus_Score**: Points awarded to a Player based on how close their Ranking_List is to the average of all Players' Ranking_Lists for that Round.
- **Avatar**: A randomized cartoon face assigned to each Player, styled similarly to Gartic Phone avatars.
- **Crown**: A visual indicator displayed on the Avatar of the previous game's winner during a rematch.
- **Rematch**: A new game automatically started (without host action) with Players who remain connected 30 seconds after a game ends.
- **Backend_Server**: The Node.js/TypeScript server that manages game state, lobbies, and WebSocket connections.
- **WebSocket_Service**: The real-time communication layer used to synchronize game state between the Backend_Server and all connected Players.
- **Round_Timer**: A configurable countdown timer that limits the duration of each Round, with a default of 15 seconds.
- **External_Game_Card**: A game card on the Game_Hub that links to a multiplayer game hosted on an external website rather than within the Game_Hub itself.
- **Spectator**: A Player who joined a game after the lobby phase ended. Spectators can watch the current game but cannot submit rankings until a rematch starts.

## Requirements

### Requirement 1: Game Hub Navigation

**User Story:** As a Player, I want a central hub page so that I can browse and select available multiplayer games.

#### Acceptance Criteria

1. THE Game_Hub SHALL display a list of available games as selectable cards with a game title and description.
2. WHEN a Player selects a game card, THE Game_Hub SHALL navigate the Player to that game's page or prompt them to create a new lobby.
3. THE Game_Hub SHALL render a responsive layout that adapts to desktop and mobile screen sizes.

### Requirement 2: Lobby Creation and Configuration

**User Story:** As a Host, I want to create a game lobby where I can configure settings and see joined players at the same time, so that setup is fast and seamless.

#### Acceptance Criteria

1. WHEN a Host creates a new Ranking_Game lobby, THE Backend_Server SHALL generate a unique lobby code and return a shareable join link.
2. THE game page (`/game/ranking/:code`) SHALL serve as the single URL for the lobby, gameplay, and results — displaying different views based on the current game phase.
3. WHEN a Host creates a lobby, THE game page SHALL display the settings configuration (rounds, timer, mode) and the player list simultaneously in a unified view.
4. WHEN a Host creates a lobby, THE Backend_Server SHALL allow the Host to configure the number of Rounds (minimum 1, maximum 20).
5. WHEN a Host creates a lobby, THE Backend_Server SHALL allow the Host to configure the Round_Timer duration in seconds (minimum 5, maximum 120, default 15).
6. WHEN a Host creates a lobby, THE Backend_Server SHALL allow the Host to select either Category_Mode or Random_Mode.
7. THE Lobby view SHALL display all currently joined Players with their Avatars and usernames.
8. WHEN a Host clicks a "Start Game" button, THE Backend_Server SHALL transition the Lobby to the first Round of the Ranking_Game.

### Requirement 3: Lobby Joining and Spectating

**User Story:** As a Player, I want to join a game at any point via a shared link so that I can participate or spectate.

#### Acceptance Criteria

1. WHEN a Player opens a valid game link (`/game/ranking/:code`), THE Game_Hub SHALL prompt the Player to enter a username.
2. WHEN a Player submits a username, THE Backend_Server SHALL add the Player to the game and assign a randomized Avatar.
3. WHEN a Player joins during the lobby phase, THE Backend_Server SHALL mark the Player as an active participant who can play when the game starts.
4. WHEN a Player joins while a game is already in progress, THE Backend_Server SHALL mark the Player as a spectator who can watch but cannot submit rankings for the current game.
5. WHEN a spectator is present and a rematch starts, THE Backend_Server SHALL promote the spectator to an active participant for the new game.
6. WHEN a Player joins a game, THE WebSocket_Service SHALL broadcast the updated player list to all connected Players.
7. IF a Player opens an invalid or expired game link, THEN THE Game_Hub SHALL display an error message indicating the game does not exist.

### Requirement 4: Avatar Generation

**User Story:** As a Player, I want a unique randomized avatar so that I am visually identifiable during the game.

#### Acceptance Criteria

1. WHEN a Player joins a Lobby, THE Backend_Server SHALL generate a randomized cartoon-face Avatar composed of interchangeable facial features (eyes, mouth, hair, skin color, accessories).
2. THE Avatar SHALL be visually distinct from other Players' Avatars within the same Lobby.
3. THE Avatar SHALL be displayed next to the Player's username in the Lobby, during gameplay, and on the scoreboard.

### Requirement 5: Round Gameplay — Item Display and Ranking

**User Story:** As a Player, I want to rank 5 items by dragging and dropping them so that I can express my preferences.

#### Acceptance Criteria

1. WHEN a Round starts, THE Ranking_Game SHALL present all Players with the same 5 Items displayed as image cards with centered text overlay.
2. WHILE a Round is active, THE Ranking_Game SHALL allow each Player to reorder the 5 Items in their Ranking_List via drag and drop.
3. WHILE a Round is active, THE Ranking_Game SHALL display the Ranking_List with the top position representing the highest rank and the bottom position representing the lowest rank.
4. WHEN a Player finalizes their Ranking_List and submits it, THE WebSocket_Service SHALL send the Ranking_List to the Backend_Server.
5. WHILE a Round is active, THE Ranking_Game SHALL display the Round_Timer countdown showing the remaining seconds.
6. WHEN the Round_Timer reaches zero, THE Backend_Server SHALL end the Round and use each Player's current Ranking_List order as their submission.
7. WHEN all Players in a Round have submitted their Ranking_Lists before the Round_Timer reaches zero, THE Backend_Server SHALL end the Round immediately (early completion).

### Requirement 6: Item Selection by Game Mode

**User Story:** As a Host, I want to choose between category-based and random item selection so that the game has variety.

#### Acceptance Criteria

1. WHILE the Ranking_Game is in Category_Mode, THE Backend_Server SHALL select all 5 Items for each Round from a single category.
2. WHILE the Ranking_Game is in Random_Mode, THE Backend_Server SHALL select the 5 Items for each Round at random from multiple categories.
3. THE Backend_Server SHALL ensure no Item is repeated across Rounds within the same game session.
4. THE Backend_Server SHALL maintain a data store of Items organized by category, where each Item has a display name and an associated image URL.

### Requirement 7: Scoring

**User Story:** As a Player, I want to earn points based on how closely my ranking matches the group consensus so that the game rewards agreement.

#### Acceptance Criteria

1. WHEN all Players in a Round have submitted their Ranking_Lists, THE Backend_Server SHALL compute the average ranking position for each Item across all Players.
2. WHEN the average ranking is computed, THE Backend_Server SHALL calculate each Player's Consensus_Score for that Round based on the sum of absolute differences between the Player's ranking and the average ranking for each Item.
3. THE Backend_Server SHALL award higher Consensus_Score values to Players with smaller total differences from the average ranking.
4. WHEN scoring is complete for a Round, THE WebSocket_Service SHALL broadcast the Round results (each Player's score and the average ranking) to all Players.

### Requirement 8: Round Results Display

**User Story:** As a Player, I want to see the round results so that I understand how my ranking compared to others.

#### Acceptance Criteria

1. WHEN a Round ends, THE Ranking_Game SHALL display the average ranking of the 5 Items for that Round.
2. WHEN a Round ends, THE Ranking_Game SHALL display each Player's Consensus_Score for that Round alongside their Avatar and username.
3. WHEN a Round ends, THE Ranking_Game SHALL display a cumulative leaderboard sorted by total Consensus_Score across all completed Rounds.
4. WHEN the results have been displayed and the Host proceeds, THE Ranking_Game SHALL advance to the next Round or to the end-of-game screen if all Rounds are complete.

### Requirement 9: End of Game and Winner

**User Story:** As a Player, I want to see who won the game so that the competition has a clear outcome.

#### Acceptance Criteria

1. WHEN all Rounds are complete, THE Ranking_Game SHALL display a final leaderboard sorted by total Consensus_Score.
2. WHEN the final leaderboard is displayed, THE Ranking_Game SHALL highlight the Player with the highest total Consensus_Score as the winner with a crown animation.
3. IF two or more Players have the same highest total Consensus_Score, THEN THE Ranking_Game SHALL declare all tied Players as co-winners.

### Requirement 10: Rematch Flow

**User Story:** As a Player, I want to automatically join a rematch if I stay after the game ends so that I can keep playing without re-joining.

#### Acceptance Criteria

1. WHEN a game ends, THE Ranking_Game SHALL display a 30-second countdown timer on the end-of-game screen.
2. WHEN the 30-second countdown expires, THE Backend_Server SHALL automatically start a new game with all Players who remain connected, without requiring the Host to click a start button.
3. WHEN a rematch starts, THE Backend_Server SHALL reuse the same lobby code and game page URL (`/game/ranking/:code`).
4. WHEN a rematch starts, THE Backend_Server SHALL designate the current Host as the Host of the rematch.
5. IF the previous game's winner is present in the rematch, THEN THE Ranking_Game SHALL display a Crown on that Player's Avatar.
6. WHEN a Player leaves the end-of-game screen before the countdown expires, THE Backend_Server SHALL exclude that Player from the rematch.
7. WHEN a rematch starts, THE Backend_Server SHALL promote any spectators to active participants for the new game.

### Requirement 11: Real-Time Synchronization

**User Story:** As a Player, I want the game state to update in real time so that all players see the same information simultaneously.

#### Acceptance Criteria

1. THE Backend_Server SHALL use WebSocket connections (not HTTP polling) for all real-time game state synchronization.
2. WHEN a Player connects to a Lobby, THE WebSocket_Service SHALL establish a persistent connection between that Player's browser and the Backend_Server.
3. WHEN the game state changes (player joins, round starts, scores calculated), THE WebSocket_Service SHALL broadcast the updated state to all connected Players within 200ms.
4. IF a Player's WebSocket connection drops, THEN THE Backend_Server SHALL retain the Player's session for 15 seconds to allow reconnection.
5. IF a Player does not reconnect within 15 seconds, THEN THE Backend_Server SHALL remove the Player from the Lobby and notify remaining Players.

### Requirement 12: Host Reassignment

**User Story:** As a Player, I want a new host to be assigned if the current host leaves so that the game can continue without interruption.

#### Acceptance Criteria

1. WHEN the Host leaves the game (disconnects and does not reconnect within the grace period, or leaves voluntarily), THE Backend_Server SHALL assign the host role to the next player in join order.
2. WHEN a new Host is assigned, THE WebSocket_Service SHALL broadcast the updated host assignment to all connected Players.
3. WHEN a new Host is assigned during the lobby phase, THE new Host SHALL have access to the "Start Game" button and settings configuration.
4. WHEN a new Host is assigned during gameplay, THE game SHALL continue without interruption.

### Requirement 13: Backend Technology Constraints

**User Story:** As a developer, I want clear technology constraints so that the backend is built consistently.

#### Acceptance Criteria

1. THE Backend_Server SHALL be implemented using Node.js with TypeScript.
2. THE Backend_Server SHALL use native fetch (or Node.js built-in HTTP modules) for any outbound HTTP requests and SHALL NOT use the Axios library.
3. THE Backend_Server SHALL expose a WebSocket endpoint for real-time communication with Players.
4. THE Backend_Server SHALL expose REST API endpoints for lobby creation and game configuration.

### Requirement 14: Frontend Technology and UX Constraints

**User Story:** As a developer, I want clear frontend technology and design constraints so that the UI is consistent and playful.

#### Acceptance Criteria

1. THE Game_Hub SHALL be implemented as an Angular single-page application.
2. THE Game_Hub SHALL use a playful, colorful visual design inspired by Gartic Phone, with rounded UI elements, bold typography, and vibrant colors.
3. THE Game_Hub SHALL use smooth animations for drag-and-drop reordering, page transitions, and score reveals.
4. THE Game_Hub SHALL be fully functional on both desktop and mobile browsers.
5. THE Game_Hub SHALL use SCSS for all component and global styling.
6. THE Game_Hub SHALL NOT use Tailwind CSS, Bootstrap, or any other CSS framework or UI component library for styling.
7. THE Game_Hub SHALL contain only custom-written SCSS for all visual styling.

### Requirement 15: External Game Links

**User Story:** As a Player, I want the game hub to include links to popular external multiplayer games so that I can discover and access more games from one place.

#### Acceptance Criteria

1. THE Game_Hub SHALL display External_Game_Cards alongside internal game cards on the hub page.
2. THE Game_Hub SHALL include External_Game_Cards for the following games: Gartic Phone, JKLM.fun Bomb Party, Dialed.gg, and JKLM.fun Popsauce.
3. WHEN a Player selects an External_Game_Card, THE Game_Hub SHALL open the external game's URL in a new browser tab.
4. THE Game_Hub SHALL visually distinguish External_Game_Cards from internal game cards with an external link indicator icon.
5. THE Game_Hub SHALL store External_Game_Card data (game title, description, and URL) in a configurable data source so that new external games can be added without code changes.
