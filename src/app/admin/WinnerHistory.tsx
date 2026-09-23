'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Search, Trophy } from 'lucide-react';
import { dataService, type DrawLog } from '@/lib/dataService';
import { historyDate, selectHistory, type HistoryFilters, type HistorySort } from '@/lib/winnerHistory';

const emptyFilters: HistoryFilters = { search: '', department: '', prize: '', from: '', to: '' };
const columns: { key: HistorySort; label: string }[] = [
    { key: 'number', label: 'No.' }, { key: 'name', label: 'Name' },
    { key: 'department', label: 'Department' }, { key: 'prize', label: 'Prize' },
    { key: 'date', label: 'Date' },
];
const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function WinnerHistory() {
    const [logs, setLogs] = useState<DrawLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState(emptyFilters);
    const [sort, setSort] = useState<HistorySort>('date');
    const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const requestId = useRef({ value: 0 });
    const refresh = useCallback(async () => {
        const id = ++requestId.current.value;
        try {
            const records = await dataService.getWinnerHistory();
            if (id !== requestId.current.value) return;
            setLogs(records);
            setError('');
        } catch {
            if (id === requestId.current.value) setError('Could not refresh winner history. Please try again. Previously loaded records are still shown.');
        } finally {
            if (id === requestId.current.value) setLoading(false);
        }
    }, []);
    useEffect(() => {
        const requests = requestId.current;
        // State updates in refresh happen after the history request resolves.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void refresh();
        const interval = setInterval(() => { void refresh(); }, 10000);
        return () => { clearInterval(interval); requests.value++; };
    }, [refresh]);

    const updateFilter = (key: keyof HistoryFilters, value: string) => {
        setFilters(current => ({ ...current, [key]: value }));
        setPage(1);
    };
    const invalidRange = Boolean(filters.from && filters.to && filters.from > filters.to);
    const rows = invalidRange ? [] : selectHistory(logs, filters, sort, direction);
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const currentPage = Math.min(page, pages);
    const start = (currentPage - 1) * pageSize;
    const departments = [...new Set(logs.map(log => log.participant?.department).filter((d): d is string => Boolean(d)))].sort((a, b) => a.localeCompare(b, 'th'));
    const prizes = [...new Map(logs.map(log => [log.prize_id, log.prize?.name || 'Deleted prize'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'th'));

    return (
        <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm md:p-6" aria-labelledby="winner-history-title">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 id="winner-history-title" className="flex items-center gap-2 text-xl font-bold text-slate-800"><Trophy size={22} className="text-amber-500" /> Winner History</h2>
                    <p className="mt-1 text-sm text-slate-500">{logs.length} recorded wins · No. is the award order (first winner = 1) · Bangkok time (UTC+7)</p>
                </div>
                <button type="button" onClick={() => { setLoading(true); void refresh(); }} disabled={loading} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh</button>
            </div>

            <div className="mb-5 grid gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
                <label className="text-xs font-semibold text-slate-600 lg:col-span-2">Search winners
                    <div className="relative mt-1"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input type="search" value={filters.search} onChange={e => updateFilter('search', e.target.value)} placeholder="No., name, department, or prize…" className={`${fieldClass} pl-9`} /></div>
                </label>
                <label className="text-xs font-semibold text-slate-600">Department<select className={`${fieldClass} mt-1`} value={filters.department} onChange={e => updateFilter('department', e.target.value)}><option value="">All departments</option>{departments.map(department => <option key={department}>{department}</option>)}</select></label>
                <label className="text-xs font-semibold text-slate-600 lg:col-span-2">Prize<select className={`${fieldClass} mt-1`} value={filters.prize} onChange={e => updateFilter('prize', e.target.value)}><option value="">All prizes</option>{prizes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
                <label className="text-xs font-semibold text-slate-600">From date<input type="date" className={`${fieldClass} mt-1`} value={filters.from} onChange={e => updateFilter('from', e.target.value)} aria-invalid={invalidRange} /></label>
                <label className="text-xs font-semibold text-slate-600">To date<input type="date" className={`${fieldClass} mt-1`} value={filters.to} onChange={e => updateFilter('to', e.target.value)} aria-invalid={invalidRange} /></label>
                <div className="flex items-end"><button type="button" onClick={() => { setFilters(emptyFilters); setPage(1); }} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">Clear filters</button></div>
            </div>
            {invalidRange && <p role="alert" className="mb-4 text-sm text-red-700">From date must be on or before To date.</p>}
            {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[760px] text-left text-sm">
                    <caption className="sr-only">Winner history. Select a column heading to sort.</caption>
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600"><tr>{columns.map(column => <th key={column.key} scope="col" aria-sort={sort === column.key ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
                        <button type="button" className="flex w-full items-center gap-2 whitespace-nowrap px-4 py-4 font-semibold hover:bg-slate-100" onClick={() => { setSort(column.key); setDirection(sort === column.key && direction === 'asc' ? 'desc' : 'asc'); setPage(1); }}>{column.label}{sort === column.key ? direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} /> : <ArrowUpDown size={14} className="text-slate-400" />}</button>
                    </th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.slice(start, start + pageSize).map(log => <tr key={log.id} className="hover:bg-blue-50/40">
                            <td className="px-4 py-4 font-mono text-slate-500">{log.awardNumber}</td>
                            <td className="px-4 py-4 font-medium text-slate-800">{log.participant?.name || 'Deleted participant'}</td>
                            <td className="px-4 py-4 text-slate-600">{log.participant?.department || '—'}</td>
                            <td className="px-4 py-4"><span className="inline-block rounded-md bg-amber-50 px-2.5 py-1 font-medium text-amber-800">{log.prize?.name || 'Deleted prize'}</span></td>
                            <td className="whitespace-nowrap px-4 py-4 text-slate-600">{historyDate(log.drawn_at)}</td>
                        </tr>)}
                        {!rows.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">{loading ? 'Loading winner history…' : error && !logs.length ? 'History is unavailable. Use Refresh to retry.' : !logs.length ? 'No winners recorded yet. Completed draws will appear here.' : 'No winners match these filters.'}</td></tr>}
                    </tbody>
                </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-500">
                <p role="status">Showing {rows.length ? start + 1 : 0}–{Math.min(start + pageSize, rows.length)} of {rows.length} wins</p>
                <div className="flex flex-wrap items-center gap-3">
                    <label>Rows <select className="ml-1 rounded border border-slate-200 p-1.5" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{[25, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label>
                    <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50 disabled:opacity-40">Previous</button>
                    <span>{currentPage} / {pages}</span>
                    <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50 disabled:opacity-40">Next</button>
                </div>
            </div>
        </section>
    );
}
