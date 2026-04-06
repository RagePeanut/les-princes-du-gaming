import { startTimer, stopTimer, getRemaining } from './timer-manager';

describe('TimerManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    // Clean up any active timers between tests
    stopTimer('test-lobby');
    stopTimer('lobby-a');
    stopTimer('lobby-b');
    jest.useRealTimers();
  });

  describe('startTimer', () => {
    it('calls onTick each second with remaining seconds', () => {
      const onTick = jest.fn();
      const onExpiry = jest.fn();

      startTimer('test-lobby', 5, onTick, onExpiry);

      jest.advanceTimersByTime(1000);
      expect(onTick).toHaveBeenCalledWith(4);

      jest.advanceTimersByTime(1000);
      expect(onTick).toHaveBeenCalledWith(3);

      jest.advanceTimersByTime(1000);
      expect(onTick).toHaveBeenCalledWith(2);

      expect(onTick).toHaveBeenCalledTimes(3);
      expect(onExpiry).not.toHaveBeenCalled();
    });

    it('calls onExpiry when timer reaches zero', () => {
      const onTick = jest.fn();
      const onExpiry = jest.fn();

      startTimer('test-lobby', 3, onTick, onExpiry);

      jest.advanceTimersByTime(3000);

      // onTick called at seconds 2 and 1 (not at 0)
      expect(onTick).toHaveBeenCalledTimes(2);
      expect(onTick).toHaveBeenCalledWith(2);
      expect(onTick).toHaveBeenCalledWith(1);
      expect(onExpiry).toHaveBeenCalledTimes(1);
    });

    it('cleans up timer on expiry', () => {
      const onTick = jest.fn();
      const onExpiry = jest.fn();

      startTimer('test-lobby', 2, onTick, onExpiry);

      jest.advanceTimersByTime(2000);
      expect(onExpiry).toHaveBeenCalledTimes(1);
      expect(getRemaining('test-lobby')).toBe(0);

      // No further ticks after expiry
      jest.advanceTimersByTime(5000);
      expect(onTick).toHaveBeenCalledTimes(1); // only the tick at second 1
      expect(onExpiry).toHaveBeenCalledTimes(1);
    });

    it('stops existing timer before starting a new one for the same lobby', () => {
      const onTick1 = jest.fn();
      const onExpiry1 = jest.fn();
      const onTick2 = jest.fn();
      const onExpiry2 = jest.fn();

      startTimer('test-lobby', 10, onTick1, onExpiry1);
      jest.advanceTimersByTime(2000);
      expect(onTick1).toHaveBeenCalledTimes(2);

      // Start a new timer for the same lobby
      startTimer('test-lobby', 5, onTick2, onExpiry2);

      jest.advanceTimersByTime(1000);
      // Old timer should not fire anymore
      expect(onTick1).toHaveBeenCalledTimes(2);
      // New timer should fire
      expect(onTick2).toHaveBeenCalledWith(4);
    });

    it('handles a 1-second timer (expires immediately on first tick)', () => {
      const onTick = jest.fn();
      const onExpiry = jest.fn();

      startTimer('test-lobby', 1, onTick, onExpiry);

      jest.advanceTimersByTime(1000);

      expect(onTick).not.toHaveBeenCalled();
      expect(onExpiry).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopTimer', () => {
    it('stops an active timer and prevents further callbacks', () => {
      const onTick = jest.fn();
      const onExpiry = jest.fn();

      startTimer('test-lobby', 10, onTick, onExpiry);
      jest.advanceTimersByTime(2000);
      expect(onTick).toHaveBeenCalledTimes(2);

      stopTimer('test-lobby');

      jest.advanceTimersByTime(10000);
      expect(onTick).toHaveBeenCalledTimes(2); // no more calls
      expect(onExpiry).not.toHaveBeenCalled();
    });

    it('is a no-op for a non-existent lobby', () => {
      expect(() => stopTimer('nonexistent')).not.toThrow();
    });

    it('sets remaining to 0 after stopping', () => {
      startTimer('test-lobby', 10, jest.fn(), jest.fn());
      jest.advanceTimersByTime(3000);
      expect(getRemaining('test-lobby')).toBe(7);

      stopTimer('test-lobby');
      expect(getRemaining('test-lobby')).toBe(0);
    });
  });

  describe('getRemaining', () => {
    it('returns 0 for a lobby with no active timer', () => {
      expect(getRemaining('nonexistent')).toBe(0);
    });

    it('returns the correct remaining seconds', () => {
      startTimer('test-lobby', 10, jest.fn(), jest.fn());

      expect(getRemaining('test-lobby')).toBe(10);

      jest.advanceTimersByTime(3000);
      expect(getRemaining('test-lobby')).toBe(7);

      jest.advanceTimersByTime(4000);
      expect(getRemaining('test-lobby')).toBe(3);
    });

    it('returns 0 after timer expires', () => {
      startTimer('test-lobby', 3, jest.fn(), jest.fn());

      jest.advanceTimersByTime(3000);
      expect(getRemaining('test-lobby')).toBe(0);
    });
  });

  describe('multiple lobbies', () => {
    it('manages independent timers for different lobbies', () => {
      const onTickA = jest.fn();
      const onTickB = jest.fn();

      startTimer('lobby-a', 5, onTickA, jest.fn());
      startTimer('lobby-b', 10, onTickB, jest.fn());

      jest.advanceTimersByTime(3000);

      expect(getRemaining('lobby-a')).toBe(2);
      expect(getRemaining('lobby-b')).toBe(7);
    });

    it('stopping one lobby does not affect another', () => {
      const onTickA = jest.fn();
      const onTickB = jest.fn();

      startTimer('lobby-a', 10, onTickA, jest.fn());
      startTimer('lobby-b', 10, onTickB, jest.fn());

      jest.advanceTimersByTime(2000);
      stopTimer('lobby-a');

      jest.advanceTimersByTime(3000);

      // lobby-a stopped at 2 ticks
      expect(onTickA).toHaveBeenCalledTimes(2);
      // lobby-b continued for 5 total ticks
      expect(onTickB).toHaveBeenCalledTimes(5);
      expect(getRemaining('lobby-b')).toBe(5);
    });
  });
});
