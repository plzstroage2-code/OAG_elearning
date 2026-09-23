export type DrawState = {
    phase: 'READY' | 'COUNTDOWN' | 'SHUFFLE' | 'SUSPENSE' | 'WINNER';
    currentPrizeId: string | null;
    winnerId: string | null;
    targetWinnerId: string | null;
    countdownValue: number;
    targetWinnerName?: string;
    currentPrizeName?: string;
    startedAt?: string;
    spinDurationMs?: number;
    poolCount?: number;
    drawId?: string;
    serverNow?: string;
};
export const DEFAULT_STATE: DrawState = { phase: 'READY', currentPrizeId: null, winnerId: null, targetWinnerId: null, countdownValue: 3 };
export const COUNTDOWN_MS = 3600;
export function projectDrawState(state: DrawState, serverTime: number): DrawState {
    if (state.phase !== 'SHUFFLE' || !state.startedAt) return state;
    const elapsed = Math.max(0, serverTime - Date.parse(state.startedAt));
    if (elapsed < COUNTDOWN_MS) return { ...state, phase: 'COUNTDOWN', countdownValue: Math.ceil((COUNTDOWN_MS - elapsed) / 1200) };
    if (elapsed >= COUNTDOWN_MS + (state.spinDurationMs ?? 7000)) return { ...state, phase: 'WINNER' };
    return state;
}
