'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { DEFAULT_STATE, projectDrawState, type DrawState } from './drawStateModel';
export type { DrawState } from './drawStateModel';

export function useDrawState() {
    const [drawState, setDrawState] = useState<DrawState>(DEFAULT_STATE);
    const [connectionError, setConnectionError] = useState('');
    const snapshot = useRef(DEFAULT_STATE);
    const syncTime = useRef({ server: 0, local: 0 });
    const accept = useCallback((state: DrawState) => {
        if (state.serverNow && Date.parse(state.serverNow) < syncTime.current.server) return;
        snapshot.current = { ...DEFAULT_STATE, ...state };
        syncTime.current = { server: state.serverNow ? Date.parse(state.serverNow) : Date.now(), local: Date.now() };
        setDrawState(projectDrawState(snapshot.current, syncTime.current.server));
        setConnectionError('');
    }, []);
    useEffect(() => {
        let stopped = false;
        let pending = false;
        const load = async () => {
            if (pending) return;
            pending = true;
            try {
                if (isSupabaseConfigured) {
                    const { data, error } = await supabase.rpc('get_event_state');
                    if (error || !data) throw error || new Error('Missing event state');
                    if (!stopped) accept(data as DrawState);
                } else {
                    const stored = localStorage.getItem('drawState');
                    if (!stopped && stored) accept(JSON.parse(stored));
                }
            } catch { if (!stopped) setConnectionError('Cannot sync draw state. Reconnecting...'); }
            finally { pending = false; }
        };
        void load();
        const poll = setInterval(load, 1000);
        const clock = setInterval(() => {
            const now = syncTime.current.server + Date.now() - syncTime.current.local;
            const next = projectDrawState(snapshot.current, now);
            setDrawState(previous => previous.phase === next.phase && previous.countdownValue === next.countdownValue ? previous : next);
        }, 100);
        const storage = (event: StorageEvent) => { if (!isSupabaseConfigured && event.key === 'drawState') void load(); };
        window.addEventListener('storage', storage);
        return () => { stopped = true; clearInterval(poll); clearInterval(clock); window.removeEventListener('storage', storage); };
    }, [accept]);
    const updateState = useCallback(async (patch: Partial<DrawState>) => {
        if (isSupabaseConfigured) {
            if (patch.phase !== 'READY' && patch.phase !== undefined) throw new Error('Production draws must be started through the database.');
            const { data, error } = await supabase.rpc('manage_event', { action: 'ready', payload: patch.currentPrizeId === undefined ? {} : { prizeId: patch.currentPrizeId } });
            if (error) throw error;
            accept(data as DrawState);
        } else {
            const next = { ...snapshot.current, ...patch };
            localStorage.setItem('drawState', JSON.stringify(next));
            accept(next);
        }
    }, [accept]);
    const beginDraw = useCallback(async (prizeId: string) => {
        const { data, error } = await supabase.rpc('manage_event', { action: 'begin_draw', payload: { prizeId } });
        if (error) throw error;
        accept(data as DrawState);
    }, [accept]);
    return { drawState, updateState, beginDraw, connectionError };
}
