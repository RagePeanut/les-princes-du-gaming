import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { EndGameComponent } from './end-game.component';
import { GameStateService } from '../../../../services/game-state.service';
import { AvatarService } from '../../../../services/avatar.service';
import type { LeaderboardEntry } from '@shared/ws-messages';

function createMockGameState(overrides: Partial<Record<string, any>> = {}) {
  return {
    phase: vi.fn().mockReturnValue(overrides['phase'] ?? 'results'),
    leaderboard: vi.fn().mockReturnValue(overrides['leaderboard'] ?? []),
    isTie: vi.fn().mockReturnValue(overrides['isTie'] ?? false),
    winnerId: vi.fn().mockReturnValue(overrides['winnerId'] ?? null),
    rematchCountdown: vi.fn().mockReturnValue(overrides['rematchCountdown'] ?? 0),
    players: vi.fn().mockReturnValue(overrides['players'] ?? []),
    hostId: vi.fn().mockReturnValue(overrides['hostId'] ?? null),
    isHost: vi.fn().mockReturnValue(overrides['isHost'] ?? false),
    isSpectator: vi.fn().mockReturnValue(overrides['isSpectator'] ?? false),
    currentRound: vi.fn().mockReturnValue(overrides['currentRound'] ?? 0),
    totalRounds: vi.fn().mockReturnValue(overrides['totalRounds'] ?? 5),
    items: vi.fn().mockReturnValue(overrides['items'] ?? []),
    timerSeconds: vi.fn().mockReturnValue(overrides['timerSeconds'] ?? 0),
    lobbyCode: vi.fn().mockReturnValue(overrides['lobbyCode'] ?? 'TEST01'),
    rankings: vi.fn().mockReturnValue(overrides['rankings'] ?? []),
    config: vi.fn().mockReturnValue(overrides['config'] ?? null),
    roundScores: vi.fn().mockReturnValue(overrides['roundScores'] ?? []),
    averageRanking: vi.fn().mockReturnValue(overrides['averageRanking'] ?? []),
    init: vi.fn(),
    reset: vi.fn(),
    setCurrentPlayer: vi.fn(),
    updateRankings: vi.fn(),
  };
}

const sampleLeaderboard: LeaderboardEntry[] = [
  { playerId: 'p1', username: 'Alice', avatarHeadUrl: '', avatarAccessoryUrl: null, totalScore: 50, rank: 1 },
  { playerId: 'p2', username: 'Bob', avatarHeadUrl: '', avatarAccessoryUrl: null, totalScore: 40, rank: 2 },
  { playerId: 'p3', username: 'Charlie', avatarHeadUrl: '', avatarAccessoryUrl: null, totalScore: 30, rank: 3 },
];

describe('EndGameComponent', () => {
  let mockAvatarService: { getAvatar: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockAvatarService = { getAvatar: vi.fn().mockReturnValue(undefined) };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function setup(gameStateOverrides: Record<string, any> = {}) {
    const mockGameState = createMockGameState(gameStateOverrides);

    TestBed.configureTestingModule({
      imports: [EndGameComponent],
      providers: [
        provideTranslateService({ defaultLanguage: 'en' }),
        { provide: GameStateService, useValue: mockGameState },
        { provide: AvatarService, useValue: mockAvatarService },
      ],
    });

    const fixture = TestBed.createComponent(EndGameComponent);
    fixture.detectChanges();
    return { fixture, mockGameState };
  }

  describe('Final leaderboard display', () => {
    it('should render the Game Over title', () => {
      const { fixture } = setup({ leaderboard: sampleLeaderboard });
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.end-game__title')!.textContent).toContain('endGame.title');
    });

    it('should render all leaderboard entries', () => {
      const { fixture } = setup({ leaderboard: sampleLeaderboard });
      const el: HTMLElement = fixture.nativeElement;
      const items = el.querySelectorAll('.end-game__lb-item');
      expect(items.length).toBe(3);
    });

    it('should display leaderboard sorted by totalScore descending', () => {
      const unsorted: LeaderboardEntry[] = [
        { playerId: 'p3', username: 'Charlie', avatarHeadUrl: '', avatarAccessoryUrl: null, totalScore: 30, rank: 3 },
        { playerId: 'p1', username: 'Alice', avatarHeadUrl: '', avatarAccessoryUrl: null, totalScore: 50, rank: 1 },
        { playerId: 'p2', username: 'Bob', avatarHeadUrl: '', avatarAccessoryUrl: null, totalScore: 40, rank: 2 },
      ];
      const { fixture } = setup({ leaderboard: unsorted });
      const el: HTMLElement = fixture.nativeElement;
      const usernames = Array.from(el.querySelectorAll('.end-game__lb-username')).map(
        (e) => e.textContent?.trim()
      );
      expect(usernames).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('should display scores for each entry', () => {
      const { fixture } = setup({ leaderboard: sampleLeaderboard });
      const el: HTMLElement = fixture.nativeElement;
      const scores = Array.from(el.querySelectorAll('.end-game__lb-score')).map(
        (e) => e.textContent?.trim()
      );
      expect(scores).toEqual(['50', '40', '30']);
    });
  });

  describe('Winner highlight with crown animation', () => {
    it('should highlight rank 1 entries as winners', () => {
      const { fixture } = setup({ leaderboard: sampleLeaderboard });
      const el: HTMLElement = fixture.nativeElement;
      const winnerItems = el.querySelectorAll('.end-game__lb-item--winner');
      expect(winnerItems.length).toBe(1);
    });

    it('should show crown emoji for rank 1 entries', () => {
      const { fixture } = setup({ leaderboard: sampleLeaderboard });
      const el: HTMLElement = fixture.nativeElement;
      const crowns = el.querySelectorAll('.end-game__crown');
      expect(crowns.length).toBe(1);
      expect(crowns[0].textContent).toContain('👑');
    });

    it('should show rank number for non-winner entries', () => {
      const { fixture } = setup({ leaderboard: sampleLeaderboard });
      const el: HTMLElement = fixture.nativeElement;
      const ranks = Array.from(el.querySelectorAll('.end-game__lb-rank'));
      // First rank has crown, second and third have numbers
      expect(ranks[1].textContent?.trim()).toBe('2');
      expect(ranks[2].textContent?.trim()).toBe('3');
    });
  });

  describe('Tie handling (co-winners)', () => {
    it('should show co-winners message when isTie is true', () => {
      const { fixture } = setup({ leaderboard: sampleLeaderboard, isTie: true });
      const el: HTMLElement = fixture.nativeElement;
      const tieMsg = el.querySelector('.end-game__tie-msg');
      expect(tieMsg).not.toBeNull();
      expect(tieMsg!.textContent).toContain('endGame.tieMsg');
    });

    it('should NOT show co-winners message when isTie is false', () => {
      const { fixture } = setup({ leaderboard: sampleLeaderboard, isTie: false });
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.end-game__tie-msg')).toBeNull();
    });

    it('should highlight multiple winners when tied', () => {
      const tiedLeaderboard: LeaderboardEntry[] = [
        { playerId: 'p1', username: 'Alice', avatarHeadUrl: '', avatarAccessoryUrl: null, totalScore: 50, rank: 1 },
        { playerId: 'p2', username: 'Bob', avatarHeadUrl: '', avatarAccessoryUrl: null, totalScore: 50, rank: 1 },
        { playerId: 'p3', username: 'Charlie', avatarHeadUrl: '', avatarAccessoryUrl: null, totalScore: 30, rank: 3 },
      ];
      const { fixture } = setup({ leaderboard: tiedLeaderboard, isTie: true });
      const el: HTMLElement = fixture.nativeElement;
      const winnerItems = el.querySelectorAll('.end-game__lb-item--winner');
      expect(winnerItems.length).toBe(2);
      const crowns = el.querySelectorAll('.end-game__crown');
      expect(crowns.length).toBe(2);
    });
  });

  describe('Rematch countdown', () => {
    it('should NOT show rematch countdown when phase is results', () => {
      const { fixture } = setup({ phase: 'results', leaderboard: sampleLeaderboard });
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.end-game__rematch')).toBeNull();
    });

    it('should show rematch countdown when phase is rematch_countdown', () => {
      const { fixture } = setup({
        phase: 'rematch_countdown',
        leaderboard: sampleLeaderboard,
        rematchCountdown: 25,
      });
      const el: HTMLElement = fixture.nativeElement;
      const rematch = el.querySelector('.end-game__rematch');
      expect(rematch).not.toBeNull();
      expect(el.querySelector('.end-game__rematch-timer')!.textContent).toContain('25');
    });

    it('should display "Rematch in" text', () => {
      const { fixture } = setup({
        phase: 'rematch_countdown',
        leaderboard: sampleLeaderboard,
        rematchCountdown: 10,
      });
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.end-game__rematch-text')!.textContent).toContain('endGame.rematchIn');
    });
  });

  describe('Avatar display', () => {
    it('should show avatar placeholder with first letter when no avatar available', () => {
      const { fixture } = setup({ leaderboard: sampleLeaderboard });
      const el: HTMLElement = fixture.nativeElement;
      const placeholders = el.querySelectorAll('.avatar-placeholder');
      expect(placeholders.length).toBe(3);
      expect(placeholders[0].textContent?.trim()).toBe('A');
      expect(placeholders[1].textContent?.trim()).toBe('B');
      expect(placeholders[2].textContent?.trim()).toBe('C');
    });

    it('should show avatar image when avatar is available', () => {
      mockAvatarService.getAvatar.mockReturnValue('data:image/svg+xml;base64,test');
      const { fixture } = setup({ leaderboard: [sampleLeaderboard[0]] });
      const el: HTMLElement = fixture.nativeElement;
      const img = el.querySelector('.avatar') as HTMLImageElement;
      expect(img).not.toBeNull();
      expect(img.src).toContain('data:image/svg+xml;base64,test');
    });
  });
});
