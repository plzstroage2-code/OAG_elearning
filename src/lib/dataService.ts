import { supabase, isSupabaseConfigured, isDemoMode } from './supabase';

export type Participant = {
    id: string;
    name: string;
    department?: string;
    category?: string;
    status: 'Active' | 'Winner';
};

export type Prize = {
    id: string;
    name: string;
    description: string;
    total_amount: number;
    drawn_amount: number;
    draw_order: number;
    status: 'Ready' | 'Completed';
};

export type DrawLog = {
    id: string;
    prize_id: string;
    participant_id: string;
    prize?: Prize;
    participant?: Participant;
    drawn_at: string;
    participant_name?: string;
    participant_department?: string;
    prize_name?: string;
};

// In-memory fallback if Supabase is not configured
let mockParticipants: Participant[] = [
    { id: '1', name: 'สมชาย ใจดี', department: 'IT', status: 'Active' },
    { id: '2', name: 'สมหญิง รักดี', department: 'HR', status: 'Active' },
    { id: '3', name: 'วิชัย ทองดี', department: 'Finance', status: 'Active' },
    { id: '4', name: 'สุภาวดี สีสด', department: 'Marketing', status: 'Active' },
    { id: '5', name: 'กิตติพงษ์ มั่นคง', department: 'Sales', status: 'Active' },
    { id: '6', name: 'ประเสริฐ เลิศสกุล', department: 'Admin', status: 'Active' },
    { id: '7', name: 'อนงค์ วงศ์ษา', department: 'IT', status: 'Active' },
];

let mockPrizes: Prize[] = [
    { id: 'p1', name: 'รางวัลที่ 1: MacBook Pro', description: 'M2 Chip, 16GB RAM', total_amount: 1, drawn_amount: 0, draw_order: 1, status: 'Ready' },
    { id: 'p2', name: 'รางวัลที่ 2: iPad Pro', description: '11 inch, 256GB', total_amount: 3, drawn_amount: 0, draw_order: 2, status: 'Ready' },
];

let mockDrawLogs: DrawLog[] = [];


function requireDemo() {
    if (!isDemoMode) throw new Error('Supabase is required outside local development.');
}
async function command(action: string, payload: object = {}) {
    const { error } = await supabase.rpc('manage_event', { action, payload });
    if (error) throw new Error(error.code === '23503' ? 'This item has winner history. Export your records before using Reset Event.' : error.message);
}
async function readAll<T>(table: string, select = '*', order = 'id'): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from(table).select(select).order(order).order('id').range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data || []) as T[]);
        if (!data || data.length < 500) return rows;
    }
}
export const dataService = {
    getWinnerHistory: async (): Promise<DrawLog[]> => {
        if (isSupabaseConfigured) {
            const logs = await readAll<DrawLog>('draw_logs', '*, participant:participants(*), prize:prizes(*)', 'drawn_at');
            return logs.map(log => ({ ...log,
                participant: log.participant ? { ...log.participant, name: log.participant_name ?? log.participant.name, department: log.participant_department ?? log.participant.department } : undefined,
                prize: log.prize ? { ...log.prize, name: log.prize_name ?? log.prize.name } : undefined,
            }));
        }
        requireDemo();
        return mockDrawLogs.map(log => ({ ...log, participant: mockParticipants.find(p => p.id === log.participant_id), prize: mockPrizes.find(p => p.id === log.prize_id) }));
    },
    getParticipants: async (): Promise<Participant[]> => {
        if (isSupabaseConfigured) return readAll<Participant>('participants');
        requireDemo(); return [...mockParticipants];
    },
    getPrizes: async (): Promise<Prize[]> => {
        if (isSupabaseConfigured) return readAll<Prize>('prizes', '*', 'draw_order');
        requireDemo(); return [...mockPrizes];
    },
    getActiveParticipants: async (): Promise<Participant[]> => {
        return (await dataService.getParticipants()).filter(p => p.status === 'Active');
    },
    recordWinner: async (participantId: string, prizeId: string): Promise<void> => {
        requireDemo(); // Production selection and recording are one database transaction.
        const p = mockParticipants.find(p => p.id === participantId);
        const pr = mockPrizes.find(p => p.id === prizeId);
        if (!p || p.status !== 'Active' || !pr || pr.drawn_amount >= pr.total_amount) throw new Error('Draw unavailable');
        p.status = 'Winner'; pr.drawn_amount++;
        if (pr.drawn_amount >= pr.total_amount) pr.status = 'Completed';
        mockDrawLogs.push({ id: crypto.randomUUID(), prize_id: prizeId, participant_id: participantId, drawn_at: new Date().toISOString() });
    },
    importParticipants: async (rows: Pick<Participant, 'id' | 'name' | 'department'>[]) => {
        if (isSupabaseConfigured) return command('import_participants', { rows });
        requireDemo();
        for (const row of rows) {
            const existing = mockParticipants.find(p => p.id === row.id);
            if (existing) Object.assign(existing, row);
            else mockParticipants.push({ ...row, status: 'Active' });
        }
    },
    resetDraw: async () => {
        if (isSupabaseConfigured) return command('reset_event');
        requireDemo(); mockParticipants.forEach(p => p.status = 'Active');
        mockPrizes.forEach(p => { p.drawn_amount = 0; p.status = 'Ready'; }); mockDrawLogs = [];
    },
    clearAllParticipants: async () => {
        if (isSupabaseConfigured) return command('clear_participants');
        requireDemo(); mockParticipants = []; mockDrawLogs = [];
    },
    addPrize: async (prize: Omit<Prize, 'id' | 'drawn_amount' | 'status' | 'draw_order'>) => {
        if (!prize.name.trim() || !Number.isInteger(prize.total_amount) || prize.total_amount < 1) throw new Error('Enter a prize name and positive whole number.');
        if (isSupabaseConfigured) return command('add_prize', prize);
        requireDemo(); mockPrizes.push({ ...prize, id: crypto.randomUUID(), drawn_amount: 0, status: 'Ready', draw_order: mockPrizes.length + 1 });
    },
    updatePrizeAmount: async (id: string, amount: number) => {
        if (!Number.isInteger(amount) || amount < 1) throw new Error('Amount must be a positive whole number.');
        if (isSupabaseConfigured) return command('prize_amount', { id, amount });
        requireDemo(); const p = mockPrizes.find(p => p.id === id);
        if (p) { if (amount < p.drawn_amount) throw new Error('Amount is below the number already drawn.'); p.total_amount = amount; p.status = p.drawn_amount >= amount ? 'Completed' : 'Ready'; }
    },
    deletePrize: async (id: string) => {
        if (isSupabaseConfigured) return command('delete_prize', { id });
        requireDemo(); mockPrizes = mockPrizes.filter(p => p.id !== id);
    },
    clearAllPrizes: async () => {
        if (isSupabaseConfigured) return command('clear_prizes');
        requireDemo(); mockPrizes = [];
    },
};
