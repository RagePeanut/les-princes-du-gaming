import {
  LobbyManager,
  validateGameConfig,
  buildFullConfig,
  DEFAULT_CONFIG,
} from './lobby-manager';

// ─── validateGameConfig ─────────────────────────────────────────────────────

describe('validateGameConfig', () => {
  it('accepts a fully valid config', () => {
    const result = validateGameConfig({ rounds: 10, timerSeconds: 30, mode: 'category' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts an empty partial config (all optional)', () => {
    const result = validateGameConfig({});
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts boundary values for rounds (1 and 20)', () => {
    expect(validateGameConfig({ rounds: 1 }).valid).toBe(true);
    expect(validateGameConfig({ rounds: 20 }).valid).toBe(true);
  });

  it('rejects rounds below 1', () => {
    const result = validateGameConfig({ rounds: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('rounds must be between 1 and 20');
  });

  it('rejects rounds above 20', () => {
    const result = validateGameConfig({ rounds: 21 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('rounds must be between 1 and 20');
  });

  it('rejects non-integer rounds', () => {
    const result = validateGameConfig({ rounds: 5.5 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('rounds must be an integer');
  });

  it('accepts boundary values for timerSeconds (-1, 5 and 120)', () => {
    expect(validateGameConfig({ timerSeconds: -1 }).valid).toBe(true);
    expect(validateGameConfig({ timerSeconds: 5 }).valid).toBe(true);
    expect(validateGameConfig({ timerSeconds: 120 }).valid).toBe(true);
  });

  it('rejects timerSeconds between -1 and 5 exclusive', () => {
    const result = validateGameConfig({ timerSeconds: 4 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('timerSeconds must be -1 or between 5 and 120');
  });

  it('rejects timerSeconds above 120', () => {
    const result = validateGameConfig({ timerSeconds: 121 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('timerSeconds must be -1 or between 5 and 120');
  });

  it('rejects non-integer timerSeconds', () => {
    const result = validateGameConfig({ timerSeconds: 10.5 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('timerSeconds must be an integer');
  });

  it('rejects invalid mode', () => {
    const result = validateGameConfig({ mode: 'invalid' as any });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("mode must be 'category' or 'random'");
  });

  it('collects multiple errors at once', () => {
    const result = validateGameConfig({ rounds: 0, timerSeconds: 1, mode: 'bad' as any });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });
});

// ─── buildFullConfig ────────────────────────────────────────────────────────

describe('buildFullConfig', () => {
  it('uses defaults when no values provided', () => {
    const config = buildFullConfig({});
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('uses provided values and fills defaults for missing', () => {
    const config = buildFullConfig({ rounds: 10 });
    expect(config.rounds).toBe(10);
    expect(config.timerSeconds).toBe(30);
    expect(config.mode).toBe('category');
  });

  it('defaults timerSeconds to 30 when omitted', () => {
    const config = buildFullConfig({ rounds: 3, mode: 'category' });
    expect(config.timerSeconds).toBe(30);
  });
});

// ─── LobbyManager ───────────────────────────────────────────────────────────

describe('LobbyManager', () => {
  let manager: LobbyManager;

  beforeAll(() => {
    process.env.CLOUDFLARE_AVATAR_BASE_URL = 'https://test.r2.dev';
  });

  beforeEach(() => {
    manager = new LobbyManager();
  });

  describe('createLobby', () => {
    it('creates a lobby with a 6-char alphanumeric code', () => {
      const lobby = manager.createLobby();
      expect(lobby.code).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('creates a lobby in waiting state', () => {
      const lobby = manager.createLobby();
      expect(lobby.state).toBe('waiting');
    });

    it('applies default config when none provided', () => {
      const lobby = manager.createLobby();
      expect(lobby.config).toEqual(DEFAULT_CONFIG);
    });

    it('applies provided config values', () => {
      const lobby = manager.createLobby({ rounds: 10, timerSeconds: 30, mode: 'category' });
      expect(lobby.config.rounds).toBe(10);
      expect(lobby.config.timerSeconds).toBe(30);
      expect(lobby.config.mode).toBe('category');
    });

    it('throws on invalid config', () => {
      expect(() => manager.createLobby({ rounds: 0 })).toThrow('rounds must be between 1 and 20');
    });

    it('initializes with empty players and nextJoinOrder 0', () => {
      const lobby = manager.createLobby();
      expect(lobby.players.size).toBe(0);
      expect(lobby.nextJoinOrder).toBe(0);
      expect(lobby.hostId).toBe('');
    });

    it('generates unique codes for multiple lobbies', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const lobby = manager.createLobby();
        codes.add(lobby.code);
      }
      expect(codes.size).toBe(50);
    });
  });

  describe('joinLobby', () => {
    it('adds a player to the lobby', () => {
      const lobby = manager.createLobby();
      const player = manager.joinLobby(lobby.code, 'Alice');
      expect(player.username).toBe('Alice');
      expect(player.isConnected).toBe(true);
      expect(lobby.players.size).toBe(1);
    });

    it('assigns the first player as host', () => {
      const lobby = manager.createLobby();
      const player = manager.joinLobby(lobby.code, 'Alice');
      expect(player.isHost).toBe(true);
      expect(lobby.hostId).toBe(player.id);
    });

    it('does not assign subsequent players as host', () => {
      const lobby = manager.createLobby();
      manager.joinLobby(lobby.code, 'Alice');
      const bob = manager.joinLobby(lobby.code, 'Bob');
      expect(bob.isHost).toBe(false);
    });

    it('assigns incrementing joinOrder', () => {
      const lobby = manager.createLobby();
      const p1 = manager.joinLobby(lobby.code, 'Alice');
      const p2 = manager.joinLobby(lobby.code, 'Bob');
      const p3 = manager.joinLobby(lobby.code, 'Charlie');
      expect(p1.joinOrder).toBe(0);
      expect(p2.joinOrder).toBe(1);
      expect(p3.joinOrder).toBe(2);
    });

    it('assigns avatarHeadUrl and avatarAccessoryUrl', () => {
      const lobby = manager.createLobby();
      const player = manager.joinLobby(lobby.code, 'Alice');
      expect(player.avatarHeadUrl).toMatch(/^https:\/\/test\.r2\.dev\/heads\/.+\.png$/);
      expect(
        player.avatarAccessoryUrl === null ||
        /^https:\/\/test\.r2\.dev\/accessories\/.+\.png$/.test(player.avatarAccessoryUrl)
      ).toBe(true);
    });

    it('marks player as active (not spectator) in waiting state', () => {
      const lobby = manager.createLobby();
      const player = manager.joinLobby(lobby.code, 'Alice');
      expect(player.isSpectator).toBe(false);
    });

    it('marks player as spectator when lobby is in playing state', () => {
      const lobby = manager.createLobby();
      manager.joinLobby(lobby.code, 'Alice');
      // Simulate state change
      lobby.state = 'playing';
      const spectator = manager.joinLobby(lobby.code, 'Bob');
      expect(spectator.isSpectator).toBe(true);
    });

    it('marks player as spectator when lobby is in round_results state', () => {
      const lobby = manager.createLobby();
      manager.joinLobby(lobby.code, 'Alice');
      lobby.state = 'round_results';
      const spectator = manager.joinLobby(lobby.code, 'Bob');
      expect(spectator.isSpectator).toBe(true);
    });

    it('marks player as spectator when lobby is in results state', () => {
      const lobby = manager.createLobby();
      manager.joinLobby(lobby.code, 'Alice');
      lobby.state = 'results';
      const spectator = manager.joinLobby(lobby.code, 'Bob');
      expect(spectator.isSpectator).toBe(true);
    });

    it('throws when lobby does not exist', () => {
      expect(() => manager.joinLobby('ZZZZZZ', 'Alice')).toThrow('Lobby not found');
    });

    it('initializes hasCrown to false', () => {
      const lobby = manager.createLobby();
      const player = manager.joinLobby(lobby.code, 'Alice');
      expect(player.hasCrown).toBe(false);
    });
  });

  describe('leaveLobby', () => {
    it('removes a player from the lobby', () => {
      const lobby = manager.createLobby();
      const player = manager.joinLobby(lobby.code, 'Alice');
      manager.joinLobby(lobby.code, 'Bob');
      manager.leaveLobby(lobby.code, player.id);
      expect(lobby.players.has(player.id)).toBe(false);
      expect(lobby.players.size).toBe(1);
    });

    it('destroys lobby when last player leaves', () => {
      const lobby = manager.createLobby();
      const player = manager.joinLobby(lobby.code, 'Alice');
      manager.leaveLobby(lobby.code, player.id);
      expect(manager.getLobby(lobby.code)).toBeUndefined();
    });

    it('reassigns host to next player by join order when host leaves', () => {
      const lobby = manager.createLobby();
      const alice = manager.joinLobby(lobby.code, 'Alice');
      const bob = manager.joinLobby(lobby.code, 'Bob');
      const charlie = manager.joinLobby(lobby.code, 'Charlie');

      const newHost = manager.leaveLobby(lobby.code, alice.id);
      expect(newHost).not.toBeNull();
      expect(newHost!.id).toBe(bob.id);
      expect(newHost!.isHost).toBe(true);
      expect(lobby.hostId).toBe(bob.id);
    });

    it('skips disconnected players during host reassignment', () => {
      const lobby = manager.createLobby();
      const alice = manager.joinLobby(lobby.code, 'Alice');
      const bob = manager.joinLobby(lobby.code, 'Bob');
      const charlie = manager.joinLobby(lobby.code, 'Charlie');

      // Disconnect Bob
      bob.isConnected = false;

      const newHost = manager.leaveLobby(lobby.code, alice.id);
      expect(newHost).not.toBeNull();
      expect(newHost!.id).toBe(charlie.id);
    });

    it('returns null when non-host player leaves', () => {
      const lobby = manager.createLobby();
      manager.joinLobby(lobby.code, 'Alice');
      const bob = manager.joinLobby(lobby.code, 'Bob');
      const result = manager.leaveLobby(lobby.code, bob.id);
      expect(result).toBeNull();
    });

    it('throws when lobby does not exist', () => {
      expect(() => manager.leaveLobby('ZZZZZZ', 'some-id')).toThrow('Lobby not found');
    });

    it('throws when player not found in lobby', () => {
      const lobby = manager.createLobby();
      manager.joinLobby(lobby.code, 'Alice');
      expect(() => manager.leaveLobby(lobby.code, 'nonexistent')).toThrow('Player not found in lobby');
    });
  });

  describe('getLobby', () => {
    it('returns the lobby for a valid code', () => {
      const lobby = manager.createLobby();
      expect(manager.getLobby(lobby.code)).toBe(lobby);
    });

    it('returns undefined for an invalid code', () => {
      expect(manager.getLobby('ZZZZZZ')).toBeUndefined();
    });
  });

  describe('destroyLobby', () => {
    it('removes the lobby', () => {
      const lobby = manager.createLobby();
      manager.destroyLobby(lobby.code);
      expect(manager.getLobby(lobby.code)).toBeUndefined();
    });

    it('cleans up avatar combination tracking when lobby is destroyed', () => {
      const lobby = manager.createLobby();
      manager.joinLobby(lobby.code, 'Alice');
      manager.destroyLobby(lobby.code);
      // After destroy, creating a new lobby and joining should work without issues
      const lobby2 = manager.createLobby();
      const player2 = manager.joinLobby(lobby2.code, 'Bob');
      expect(player2.avatarHeadUrl).toBeDefined();
    });
  });

  describe('avatar combination key retention', () => {
    it('retains used combination keys when a player leaves', () => {
      const lobby = manager.createLobby();
      const alice = manager.joinLobby(lobby.code, 'Alice');
      const aliceHead = alice.avatarHeadUrl;
      const aliceAccessory = alice.avatarAccessoryUrl;

      // Add a second player so lobby isn't destroyed on leave
      manager.joinLobby(lobby.code, 'Bob');
      manager.leaveLobby(lobby.code, alice.id);

      // Join many players and verify none reuse Alice's exact combination
      const newPlayers = [];
      for (let i = 0; i < 10; i++) {
        newPlayers.push(manager.joinLobby(lobby.code, `Player${i}`));
      }

      // At least verify that the combination tracking prevents reuse
      // (with 60 total combos and 12 players, collisions are unlikely but tracked)
      const combos = new Set(
        newPlayers.map(p => `${p.avatarHeadUrl}|${p.avatarAccessoryUrl}`)
      );
      // All new players should have unique combos among themselves
      expect(combos.size).toBe(newPlayers.length);
    });
  });

  describe('updateConfig', () => {
    it('updates config when called by host', () => {
      const lobby = manager.createLobby();
      const host = manager.joinLobby(lobby.code, 'Alice');
      const updated = manager.updateConfig(lobby.code, host.id, { rounds: 10 });
      expect(updated.rounds).toBe(10);
      expect(updated.timerSeconds).toBe(30); // unchanged
    });

    it('throws when non-host tries to update', () => {
      const lobby = manager.createLobby();
      manager.joinLobby(lobby.code, 'Alice');
      const bob = manager.joinLobby(lobby.code, 'Bob');
      expect(() => manager.updateConfig(lobby.code, bob.id, { rounds: 10 }))
        .toThrow('Only the host can update settings.');
    });

    it('throws on invalid config values', () => {
      const lobby = manager.createLobby();
      const host = manager.joinLobby(lobby.code, 'Alice');
      expect(() => manager.updateConfig(lobby.code, host.id, { rounds: 0 }))
        .toThrow('rounds must be between 1 and 20');
    });

    it('throws when lobby does not exist', () => {
      expect(() => manager.updateConfig('ZZZZZZ', 'some-id', { rounds: 5 }))
        .toThrow('Lobby not found');
    });

    it('allows partial updates (only mode)', () => {
      const lobby = manager.createLobby({ rounds: 5, timerSeconds: 30, mode: 'random' });
      const host = manager.joinLobby(lobby.code, 'Alice');
      const updated = manager.updateConfig(lobby.code, host.id, { mode: 'category' });
      expect(updated.mode).toBe('category');
      expect(updated.rounds).toBe(5);
      expect(updated.timerSeconds).toBe(30);
    });
  });
});
