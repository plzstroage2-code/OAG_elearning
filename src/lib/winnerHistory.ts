import type { DrawLog } from './dataService';

export type HistorySort = 'number' | 'name' | 'department' | 'prize' | 'date' | 'time';
export type HistoryFilters = {
    search: string; department: string; prize: string; from: string; to: string;
};
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const collator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' });

export function historyDay(timestamp: string) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const parts = dayFormatter.formatToParts(date);
    const value = (type: string) => parts.find(p => p.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
}
export function historyDate(timestamp: string) {
    const day = historyDay(timestamp);
    return day ? `${day}-${historyTime(timestamp)}` : '';
}
export function historyTime(timestamp: string) {
    return Number.isNaN(Date.parse(timestamp)) ? '' : timeFormatter.format(new Date(timestamp));
}

export function selectHistory(logs: DrawLog[], filters: HistoryFilters, sort: HistorySort, direction: 'asc' | 'desc') {
    // Assign award order before filtering or sorting the displayed rows.
    const numberedLogs = [...logs].sort((a, b) =>
        (Date.parse(a.drawn_at) || 0) - (Date.parse(b.drawn_at) || 0) || a.id.localeCompare(b.id)
    ).map((log, index) => ({ ...log, awardNumber: index + 1 }));
    const terms = filters.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const rows = numberedLogs.filter(log => {
        const day = historyDay(log.drawn_at);
        const text = [String(log.awardNumber), log.participant?.name, log.participant?.department, log.prize?.name]
            .filter(Boolean).join(' ').toLocaleLowerCase();
        return terms.every(term => text.includes(term))
            && (!filters.department || (log.participant?.department || '') === filters.department)
            && (!filters.prize || log.prize_id === filters.prize)
            && (!filters.from || (!!day && day >= filters.from))
            && (!filters.to || (!!day && day <= filters.to));
    });
    const value = (log: DrawLog & { awardNumber: number }) => {
        switch (sort) {
            case 'number': return String(log.awardNumber);
            case 'name': return log.participant?.name || '';
            case 'department': return log.participant?.department || '';
            case 'prize': return log.prize?.name || '';
            case 'time': return historyTime(log.drawn_at);
            case 'date': return log.drawn_at;
        }
    };
    return rows.sort((a, b) => {
        const comparison = sort === 'date'
            ? (Date.parse(a.drawn_at) || 0) - (Date.parse(b.drawn_at) || 0)
            : collator.compare(value(a), value(b));
        return (direction === 'asc' ? comparison : -comparison) || a.id.localeCompare(b.id);
    });
}
