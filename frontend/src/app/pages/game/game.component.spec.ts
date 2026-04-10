import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { GameComponent } from './game.component';
import { WebSocketService } from '../../services/websocket.service';
import { AvatarService } from '../../services/avatar.service';
import { GameStateService } from '../../services/game-state.service';
import { LobbyService } from '../../services/lobby.service';
import { ToastService } from '../../services/toast.service';
import { Subject } from 'rxjs';

function createMockWs() {
  const subjects = new Map<string, Subject<any>>();
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
    on: vi.fn().mockImplementation((type: string) => {
      if (!subjects.has(type)) subjects.set(type, new Subject());
      return subjects.get(type)!.asObservable();
    }),
    _emit(type: string, payload: any) {
      if (subjects.has(type)) subjects.get(type)!.next(payload);
    },
    _subjects: subjects,
  };
}

function createMockGameState(overrides: Partial<Record<string, any>> = {}) {
  return {
    phase: vi.fn().mockReturnValue(overrides['phase'] ?? 'waiting'),
    players: vi.fn().mockReturnValue(overrides['players'] ?? []),
    hostId: vi.fn().mockReturnValue(overrides['hostId'] ?? null),
    config: vi.fn().mockReturnValue(overrides['config'] ?? { rounds: 5, timerSeconds: 15, mode: 'category' }),
    isHost: vi.fn().mockReturnValue(overrides['isHost'] ?? false),
    isSpectator: vi.fn().mockReturnValue(overrides['isSpectator'] ?? false),
    currentRound: vi.fn().mockReturnValue(overrides['currentRound'] ?? 0),
    totalRounds: vi.fn().mockReturnValue(overrides['totalRounds'] ?? 5),
    rematchCountdown: vi.fn().mockReturnValue(overrides['rematchCountdown'] ?? 0),
    items: vi.fn().mockReturnValue(overrides['items'] ?? []),
    timerSeconds: vi.fn().mockReturnValue(overrides['timerSeconds'] ?? 30),
    lobbyCode: vi.fn().mockReturnValue(overrides['lobbyCode'] ?? 'TEST01'),
    rankings: vi.fn().mockReturnValue(overrides['rankings'] ?? []),
    leaderboard: vi.fn().mockReturnValue(overrides['leaderboard'] ?? []),
    isTie: vi.fn().mockReturnValue(overrides['isTie'] ?? false),
    winnerId: vi.fn().mockReturnValue(overrides['winnerId'] ?? null),
    roundScores: vi.fn().mockReturnValue(overrides['roundScores'] ?? []),
    averageRanking: vi.fn().mockReturnValue(overrides['averageRanking'] ?? []),
    init: vi.fn(),
    reset: vi.fn(),
    setCurrentPlayer: vi.fn(),
    updateRankings: vi.fn(),
  };
}

describe('GameComponent', () => {
  let mockWs: ReturnType<typeof createMockWs>;
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };
  let mockAvatarService: { init: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn>; getAvatar: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockWs = createMockWs();
    mockRouter = { navigate: vi.fn() };
    mockAvatarService = {
      init: vi.fn(),
      destroy: vi.fn(),
      getAvatar: vi.fn().mockReturnValue(undefined),
    };
  });

  function setup(options: { code?: string; gameStateOverrides?: Record<string, any> } = {}) {
    const code = options.code ?? 'ABC123';
    const mockGameState = createMockGameState(options.gameStateOverrides ?? {});
    const mockLobbyService = { createLobby: vi.fn(), getLobbyStatus: vi.fn().mockResolvedValue({ exists: true, state: 'waiting', playerCount: 0, config: {} }) };
    const mockToastService = { show: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn(), toasts: vi.fn().mockReturnValue([]) };

    TestBed.configureTestingModule({
      imports: [GameComponent],
      providers: [
        provideTranslateService({ defaultLanguage: 'en' }),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => code } } } },
        { provide: Router, useValue: mockRouter },
        { provide: WebSocketService, useValue: mockWs },
        { provide: GameStateService, useValue: mockGameState },
        { provide: AvatarService, useValue: mockAvatarService },
        { provide: LobbyService, useValue: mockLobbyService },
        { provide: ToastService, useValue: mockToastService },
      ],
    });

    const fixture = TestBed.createComponent(GameComponent);
    fixture.detectChanges();
    return { fixture, mockGameState, mockLobbyService, mockToastService };
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('Task 12.1: Phase-based view switching', () => {
    it('should show username prompt when not joined', () => {
      const { fixture } = setup();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.join-overlay')).not.toBeNull();
      expect(el.querySelector('.join-card__input')).not.toBeNull();
    });

    it('should redirect to hub if no lobby code', () => {
      TestBed.resetTestingModule();
      const mockGameState = createMockGameState();
      const mockLobbyService = { createLobby: vi.fn(), getLobbyStatus: vi.fn().mockResolvedValue({ exists: true, state: 'waiting', playerCount: 0, config: {} }) };
      const mockToastService = { show: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn(), toasts: vi.fn().mockReturnValue([]) };
      TestBed.configureTestingModule({
        imports: [GameComponent],
        providers: [
          provideTranslateService({ defaultLanguage: 'en' }),
          { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: (_key: string) => null } } } },
          { provide: Router, useValue: mockRouter },
          { provide: WebSocketService, useValue: mockWs },
          { provide: GameStateService, useValue: mockGameState },
          { provide: AvatarService, useValue: mockAvatarService },
          { provide: LobbyService, useValue: mockLobbyService },
          { provide: ToastService, useValue: mockToastService },
        ],
      });
      const fixture = TestBed.createComponent(GameComponent);
      fixture.detectChanges();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
      fixture.destroy();
    });

    it('should show lobby view when phase is waiting and joined', () => {
      const { fixture } = setup({ gameStateOverrides: { phase: 'waiting' } });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.lobby')).not.toBeNull();
      expect(el.querySelector('.join-overlay')).toBeNull();
    });

    it('should show gameplay view when phase is playing', () => {
      const { fixture } = setup({ gameStateOverrides: { phase: 'playing', currentRound: 2 } });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.gameplay')).not.toBeNull();
    });

    it('should show round results view when phase is round_results', () => {
      const { fixture } = setup({ gameStateOverrides: { phase: 'round_results', leaderboard: [], roundScores: [], averageRanking: [] } });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.results')).not.toBeNull();
      expect(el.querySelector('.results__title')!.textContent).toContain('results.title');
    });

    it('should show end-game view when phase is results', () => {
      const { fixture } = setup({ gameStateOverrides: { phase: 'results', leaderboard: [] } });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.end-game')).not.toBeNull();
      expect(el.querySelector('.end-game__title')).not.toBeNull();
    });

    it('should show end-game view with rematch countdown when phase is rematch_countdown', () => {
      const { fixture } = setup({ gameStateOverrides: { phase: 'rematch_countdown', rematchCountdown: 25, leaderboard: [] } });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.end-game')).not.toBeNull();
      expect(el.querySelector('.end-game__rematch')).not.toBeNull();
      expect(el.querySelector('.end-game__rematch-timer')!.textContent).toContain('25');
    });
  });

  describe('Task 12.2: Lobby phase view', () => {
    const mockPlayers = [
      { id: 'p1', username: 'Alice', isHost: true, isSpectator: false, isConnected: true, hasCrown: false, avatarHeadUrl: '', avatarAccessoryUrl: null, socketId: '', joinOrder: 0 },
      { id: 'p2', username: 'Bob', isHost: false, isSpectator: false, isConnected: true, hasCrown: false, avatarHeadUrl: '', avatarAccessoryUrl: null, socketId: '', joinOrder: 1 },
      { id: 'p3', username: 'Charlie', isHost: false, isSpectator: true, isConnected: true, hasCrown: true, avatarHeadUrl: '', avatarAccessoryUrl: null, socketId: '', joinOrder: 2 },
    ];

    it('should show settings panel for host', () => {
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: true, players: mockPlayers, hostId: 'p1' },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('#rounds-slider')).not.toBeNull();
      expect(el.querySelector('#timer-slider')).not.toBeNull();
      expect(el.querySelector('.setting__toggle')).not.toBeNull();
      expect(el.querySelector('app-lobby .btn--success')).not.toBeNull();
    });

    it('should NOT show settings panel for non-host', () => {
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: false, players: mockPlayers, hostId: 'p1' },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('#rounds-slider')).toBeNull();
      expect(el.querySelector('app-lobby .btn--success')).toBeNull();
    });

    it('should show waiting message for non-host', () => {
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: false, players: mockPlayers, hostId: 'p1' },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.lobby__waiting-msg')).not.toBeNull();
      expect(el.querySelector('.lobby__waiting-msg')!.textContent).toContain('lobby.waitingForHost');
    });

    it('should render player list with all players', () => {
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: false, players: mockPlayers, hostId: 'p1' },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const items = el.querySelectorAll('.player-list__item');
      expect(items.length).toBe(3);
    });

    it('should show host badge on host player', () => {
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: false, players: mockPlayers, hostId: 'p1' },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const hostBadges = el.querySelectorAll('.player-list__badge--host');
      expect(hostBadges.length).toBe(1);
      // The host badge should be in Alice's row
      const firstItem = el.querySelectorAll('.player-list__item')[0];
      expect(firstItem.querySelector('.player-list__badge--host')).not.toBeNull();
    });

    it('should show spectator badge on spectator player', () => {
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: false, players: mockPlayers, hostId: 'p1' },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const spectatorBadges = el.querySelectorAll('.player-list__badge--spectator');
      expect(spectatorBadges.length).toBe(1);
    });

    it('should show crown on player with hasCrown', () => {
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: false, players: mockPlayers, hostId: 'p1' },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const crowns = el.querySelectorAll('.crown');
      expect(crowns.length).toBe(1);
    });

    it('should show shareable link with copy button', () => {
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: false, players: mockPlayers, hostId: 'p1' },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.lobby__share-input')).not.toBeNull();
      expect(el.querySelector('.lobby__share-row app-button')).not.toBeNull();
      const input = el.querySelector('.lobby__share-input') as HTMLInputElement;
      expect(input.value).toContain('TEST01');
    });

    it('should show player count in section title', () => {
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: false, players: mockPlayers, hostId: 'p1' },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const titles = el.querySelectorAll('.card__title');
      // The players card title should contain the player count
      const playerTitle = Array.from(titles).find(t => t.textContent?.includes('3'));
      expect(playerTitle).not.toBeNull();
    });

    it('should disable start button when fewer than 2 players', () => {
      const singlePlayer = [mockPlayers[0]];
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: true, players: singlePlayer, hostId: 'p1' },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const startBtn = el.querySelector('app-lobby .btn--success') as HTMLButtonElement;
      expect(startBtn.disabled).toBe(true);
      expect(el.querySelector('.lobby__start-hint')).not.toBeNull();
    });

    it('should enable start button when 2+ players', () => {
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: true, players: mockPlayers, hostId: 'p1' },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const startBtn = el.querySelector('app-lobby .btn--success') as HTMLButtonElement;
      expect(startBtn.disabled).toBe(false);
    });

    it('should send START_GAME when start button clicked', () => {
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: true, players: mockPlayers, hostId: 'p1' },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const startBtn = el.querySelector('app-lobby .btn--success') as HTMLButtonElement;
      startBtn.click();

      expect(mockWs.send).toHaveBeenCalledWith({
        type: 'START_GAME',
        payload: { lobbyCode: 'TEST01' },
      });
    });

    it('should send UPDATE_CONFIG when mode toggle clicked', () => {
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: true, players: mockPlayers, hostId: 'p1', config: { rounds: 5, timerSeconds: 15, mode: 'category' } },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const randomBtn = el.querySelectorAll('.setting__toggle-btn')[1] as HTMLButtonElement;
      randomBtn.click();

      expect(mockWs.send).toHaveBeenCalledWith({
        type: 'UPDATE_CONFIG',
        payload: { lobbyCode: 'TEST01', config: { mode: 'random' } },
      });
    });

    it('should use grid layout for host view', () => {
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: true, players: mockPlayers, hostId: 'p1' },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const content = el.querySelector('.lobby__content');
      expect(content!.classList.contains('lobby__content--host')).toBe(true);
    });

    it('should NOT use grid layout for non-host view', () => {
      const { fixture } = setup({
        gameStateOverrides: { phase: 'waiting', isHost: false, players: mockPlayers, hostId: 'p1' },
      });
      const component = fixture.componentInstance;
      (component as any).joined.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const content = el.querySelector('.lobby__content');
      expect(content!.classList.contains('lobby__content--host')).toBe(false);
    });
  });
});

import * as fc from 'fast-check';

/**
 * Property 15: Game page renders correct view for lobby state
 * **Validates: Requirements 2.2**
 * Tag: Feature: multiplayer-game-hub, Property 15: Game page view
 */
describe('Property 15: Game page renders correct view for lobby state', () => {
  let mockWs: ReturnType<typeof createMockWs>;
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };
  let mockAvatarService: { init: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn>; getAvatar: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockWs = createMockWs();
    mockRouter = { navigate: vi.fn() };
    mockAvatarService = {
      init: vi.fn(),
      destroy: vi.fn(),
      getAvatar: vi.fn().mockReturnValue(undefined),
    };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function setupForPhase(phase: string) {
    const mockGameState = createMockGameState({
      phase,
      currentRound: 2,
      rematchCountdown: 15,
      leaderboard: [],
      players: [
        { id: 'p1', username: 'Alice', isHost: true, isSpectator: false, isConnected: true, hasCrown: false, avatarHeadUrl: '', avatarAccessoryUrl: null, socketId: '', joinOrder: 0 },
        { id: 'p2', username: 'Bob', isHost: false, isSpectator: false, isConnected: true, hasCrown: false, avatarHeadUrl: '', avatarAccessoryUrl: null, socketId: '', joinOrder: 1 },
      ],
      hostId: 'p1',
      isHost: false,
    });
    const mockLobbyService = { createLobby: vi.fn(), getLobbyStatus: vi.fn().mockResolvedValue({ exists: true, state: 'waiting', playerCount: 0, config: {} }) };
    const mockToastService = { show: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn(), toasts: vi.fn().mockReturnValue([]) };

    TestBed.configureTestingModule({
      imports: [GameComponent],
      providers: [
        provideTranslateService({ defaultLanguage: 'en' }),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'TEST01' } } } },
        { provide: Router, useValue: mockRouter },
        { provide: WebSocketService, useValue: mockWs },
        { provide: GameStateService, useValue: mockGameState },
        { provide: AvatarService, useValue: mockAvatarService },
        { provide: LobbyService, useValue: mockLobbyService },
        { provide: ToastService, useValue: mockToastService },
      ],
    });

    const fixture = TestBed.createComponent(GameComponent);
    // Set joined to true so the phase view is shown
    (fixture.componentInstance as any).joined.set(true);
    fixture.detectChanges();
    return { fixture, mockGameState };
  }

  /**
   * Returns a unique identifying signature for the rendered view of a given phase.
   * Each phase must produce a distinct signature.
   */
  function getViewSignature(el: HTMLElement): string {
    if (el.querySelector('.lobby')) return 'lobby-view';
    if (el.querySelector('app-gameplay') || el.querySelector('.gameplay')) return 'gameplay-view';
    // end-game component used for results and rematch_countdown
    const endGame = el.querySelector('.end-game');
    if (endGame) {
      const rematch = el.querySelector('.end-game__rematch');
      if (rematch) return 'rematch-view';
      return 'final-results-view';
    }
    // round_results uses .results with round-specific title
    const results = el.querySelector('.results');
    if (results) {
      const title = results.querySelector('.results__title');
      if (title && title.textContent?.includes('results.title')) return 'round-results-view';
    }
    return 'unknown';
  }

  const expectedSignatures: Record<string, string> = {
    waiting: 'lobby-view',
    playing: 'gameplay-view',
    round_results: 'round-results-view',
    results: 'final-results-view',
    rematch_countdown: 'rematch-view',
  };

  it('each lobby state maps to its expected distinct view (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('waiting', 'playing', 'round_results', 'results', 'rematch_countdown'),
        (phase) => {
          TestBed.resetTestingModule();
          const { fixture } = setupForPhase(phase);
          const el: HTMLElement = fixture.nativeElement;

          const signature = getViewSignature(el);

          // Each state renders its expected view
          expect(signature).toBe(expectedSignatures[phase]);

          // The signature is unique — no other state should produce this same signature
          const otherPhases = Object.keys(expectedSignatures).filter((p) => p !== phase);
          for (const other of otherPhases) {
            expect(expectedSignatures[other]).not.toBe(signature);
          }

          fixture.destroy();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('waiting state renders .lobby element', () => {
    const { fixture } = setupForPhase('waiting');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.lobby')).not.toBeNull();
    expect(el.querySelector('.phase-placeholder')).toBeNull();
    fixture.destroy();
  });

  it('playing state renders .gameplay element', () => {
    const { fixture } = setupForPhase('playing');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.lobby')).toBeNull();
    expect(el.querySelector('.gameplay')).not.toBeNull();
    fixture.destroy();
  });

  it('round_results state renders .results element with Round title', () => {
    const { fixture } = setupForPhase('round_results');
    const el: HTMLElement = fixture.nativeElement;
    const results = el.querySelector('.results');
    expect(results).not.toBeNull();
    expect(results!.querySelector('.results__title')!.textContent).toContain('results.title');
    fixture.destroy();
  });

  it('results state renders .end-game element with Game Over title', () => {
    const { fixture } = setupForPhase('results');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.end-game')).not.toBeNull();
    expect(el.querySelector('.end-game__title')!.textContent).toContain('endGame.title');
    expect(el.querySelector('.end-game__rematch')).toBeNull();
    fixture.destroy();
  });

  it('rematch_countdown state renders .end-game element with rematch countdown', () => {
    const { fixture } = setupForPhase('rematch_countdown');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.end-game')).not.toBeNull();
    expect(el.querySelector('.end-game__rematch')).not.toBeNull();
    fixture.destroy();
  });

  it('all 5 states produce 5 distinct view signatures', () => {
    const allPhases = ['waiting', 'playing', 'round_results', 'results', 'rematch_countdown'] as const;
    const signatures = new Set<string>();

    for (const phase of allPhases) {
      TestBed.resetTestingModule();
      mockWs = createMockWs();
      mockRouter = { navigate: vi.fn() };
      mockAvatarService = { init: vi.fn(), destroy: vi.fn(), getAvatar: vi.fn().mockReturnValue(undefined) };

      const { fixture } = setupForPhase(phase);
      const el: HTMLElement = fixture.nativeElement;
      signatures.add(getViewSignature(el));
      fixture.destroy();
    }

    // All 5 phases must produce 5 distinct signatures
    expect(signatures.size).toBe(5);
  });
});
