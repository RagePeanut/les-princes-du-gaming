// TimerManager — manages per-round countdown timers with tick callbacks

interface ActiveTimer {
  intervalId: ReturnType<typeof setInterval>;
  secondsRemaining: number;
  onTick: (secondsRemaining: number) => void;
  onExpiry: () => void;
}

const activeTimers = new Map<string, ActiveTimer>();

/**
 * Start a countdown timer for a lobby.
 * Calls onTick every second with the remaining seconds.
 * Calls onExpiry when the timer reaches zero and cleans up.
 * If a timer already exists for this lobby, it is stopped first.
 */
function startTimer(
  lobbyCode: string,
  durationSeconds: number,
  onTick: (secondsRemaining: number) => void,
  onExpiry: () => void
): void {
  // Stop any existing timer for this lobby
  stopTimer(lobbyCode);

  const timer: ActiveTimer = {
    intervalId: null as unknown as ReturnType<typeof setInterval>,
    secondsRemaining: durationSeconds,
    onTick,
    onExpiry,
  };

  timer.intervalId = setInterval(() => {
    timer.secondsRemaining -= 1;

    if (timer.secondsRemaining <= 0) {
      // Clean up before calling expiry callback
      clearInterval(timer.intervalId);
      activeTimers.delete(lobbyCode);
      timer.onExpiry();
    } else {
      timer.onTick(timer.secondsRemaining);
    }
  }, 1000);

  activeTimers.set(lobbyCode, timer);
}

/**
 * Stop and clean up the timer for a lobby.
 * No-op if no timer is active for the given lobby code.
 */
function stopTimer(lobbyCode: string): void {
  const timer = activeTimers.get(lobbyCode);
  if (timer) {
    clearInterval(timer.intervalId);
    activeTimers.delete(lobbyCode);
  }
}

/**
 * Get the remaining seconds for a lobby's active timer.
 * Returns 0 if no timer is active.
 */
function getRemaining(lobbyCode: string): number {
  const timer = activeTimers.get(lobbyCode);
  return timer ? timer.secondsRemaining : 0;
}

export { startTimer, stopTimer, getRemaining };
