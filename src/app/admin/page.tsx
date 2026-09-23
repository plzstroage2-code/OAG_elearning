'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import { Play, RotateCcw, MonitorPlay, Users, Gift, Trash2, Trophy, ArrowRightCircle, PlusCircle } from 'lucide-react';
import { useDrawState } from '@/lib/useDrawState';
import { dataService, Participant, Prize } from '@/lib/dataService';
import { DRAW_CONFIG } from '@/lib/drawConfig';
import { isSupabaseConfigured } from '@/lib/supabase';
import WinnerHistory from './WinnerHistory';

export default function AdminDashboard() {
    const { drawState, updateState, beginDraw, connectionError } = useDrawState();
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [prizes, setPrizes] = useState<Prize[]>([]);
    const [activeTab, setActiveTab] = useState<'CONTROL' | 'PARTICIPANTS' | 'PRIZES' | 'HISTORY'>('CONTROL');

    const [actionError, setActionError] = useState('');
    const [starting, setStarting] = useState(false);
    const startLock = useRef(false);
    const showError = (error: unknown) => setActionError(error instanceof Error ? error.message : 'Operation failed. Please retry.');
    const runAction = async (action: () => Promise<unknown>) => {
        setActionError('');
        try { await action(); } catch (error) { showError(error); }
    };

    // Stats
    const activeCount = participants.filter(p => p.status === 'Active').length;
    const winnerCount = participants.filter(p => p.status === 'Winner').length;

    const loadData = useCallback(async () => {
        try {
            const [p, pr] = await Promise.all([dataService.getParticipants(), dataService.getPrizes()]);
            setParticipants(p); setPrizes(pr);
        } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not load event data.'); }
    }, []);

    useEffect(() => {
        // loadData applies state only after the asynchronous database request.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadData();
        const poll = setInterval(loadData, 5000);
        return () => clearInterval(poll);
    }, [activeTab, loadData]);

    // Fix the lag: We just rely on local select state for immediate feedback
    const handlePrizeSelect = (prizeId: string) => {
        void runAction(() => updateState({ currentPrizeId: prizeId || null, phase: 'READY', winnerId: null }));
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            Papa.parse<Record<string, string>>(file, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (header) => header.toLowerCase().trim(),
                complete: async (results) => {
                    const data = results.data
                        .filter((row) => row.id && row.name)
                        .map((row) => ({
                            id: row.id,
                            name: row.name,
                            department: row.department || '',
                        }));
                    if (data.length > 0) {
                        try {
                            alert("กำลังส่งรายชื่อขึ้นระบบ...");
                            await dataService.importParticipants(data);
                            alert(`✅ นำเข้ารายชื่อสำเร็จ ${data.length} คน!`);
                            await loadData();
                        } catch (err: unknown) {
                            alert("Crash! " + (err instanceof Error ? err.message : 'Operation failed'));
                        }
                    } else {
                        alert('⚠️ ไม่พบข้อมูลที่ถูกต้อง หรือลืมใส่หัวตาราง id, name');
                    }
                }
            });
        }
        // Reset file input so they can upload the exact same file again if they want
        e.target.value = '';
    };

    const startDrawSequence = async () => {
        if (startLock.current || drawState.phase !== 'READY') return;
        if (isSupabaseConfigured) {
            if (!drawState.currentPrizeId) return;
            startLock.current = true; setStarting(true); setActionError('');
            try { await beginDraw(drawState.currentPrizeId); await loadData(); }
            catch (error) { showError(error); }
            finally { startLock.current = false; setStarting(false); }
            return;
        }
        if (!drawState.currentPrizeId) {
            alert("Please select a prize to draw.");
            return;
        }

        const active = participants.filter(p => p.status === 'Active');
        if (active.length === 0) {
            alert("No active participants left.");
            return;
        }

        const winner = active[Math.floor(Math.random() * active.length)];

        updateState({ phase: 'COUNTDOWN', countdownValue: 3, winnerId: null });

        let cnt = 3;
        const countInterval = setInterval(() => {
            cnt--;
            if (cnt > 0) {
                updateState({ countdownValue: cnt });
            } else {
                clearInterval(countInterval);

                updateState({ phase: 'SHUFFLE', targetWinnerId: winner.id });

                setTimeout(async () => {
                    // Record win
                    await dataService.recordWinner(winner.id, drawState.currentPrizeId!);
                    updateState({ phase: 'WINNER', winnerId: winner.id });
                    loadData();
                }, DRAW_CONFIG.totalDurationMs);
            }
        }, 1200);
    };

    const currentPrize = prizes.find(p => p.id === drawState.currentPrizeId);
    const remainingInPrize = currentPrize ? (currentPrize.total_amount - currentPrize.drawn_amount) : 0;

    // New Prize state
    const [newPrize, setNewPrize] = useState({ name: '', description: '', total_amount: 1 });

    return (
        <div id="admin-dashboard" className="space-y-6">
            {(actionError || connectionError) && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{actionError || connectionError}</p>}
            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border border-blue-100 shadow-sm rounded-xl p-4 flex flex-col justify-center">
                    <div className="text-slate-500 font-medium text-sm mb-1 flex items-center gap-2"><Users size={16} /> Total Participants</div>
                    <div className="text-3xl font-bold text-text-main">{participants.length}</div>
                </div>
                <div className="bg-white border border-blue-100 shadow-sm rounded-xl p-4 flex flex-col justify-center">
                    <div className="text-slate-500 font-medium text-sm mb-1 flex items-center gap-2"><Users size={16} /> Active Pool</div>
                    <div className="text-3xl font-bold text-success">{activeCount}</div>
                </div>
                <div className="bg-white border border-blue-100 shadow-sm rounded-xl p-4 flex flex-col justify-center">
                    <div className="text-slate-500 font-medium text-sm mb-1 flex items-center gap-2"><Trophy size={16} /> Prize Pool</div>
                    <div className="text-3xl font-bold text-text-main">{prizes.reduce((a, b) => a + b.total_amount, 0)}</div>
                </div>
                <div className="bg-white border border-blue-100 shadow-sm rounded-xl p-4 flex flex-col justify-center">
                    <div className="text-slate-500 font-medium text-sm mb-1 flex items-center gap-2"><Trophy size={16} /> Winners</div>
                    <div className="text-3xl font-bold text-accent">{winnerCount}</div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-4 border-b border-slate-200 pb-4">
                <button
                    onClick={() => setActiveTab('CONTROL')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-colors font-medium border ${activeTab === 'CONTROL' ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                ><MonitorPlay size={18} /> Live Control</button>
                <button
                    onClick={() => setActiveTab('PARTICIPANTS')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-colors font-medium border ${activeTab === 'PARTICIPANTS' ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                ><Users size={18} /> Participants</button>
                <button
                    onClick={() => setActiveTab('PRIZES')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-colors font-medium border ${activeTab === 'PRIZES' ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                ><Gift size={18} /> Prizes</button>
                <button
                    onClick={() => setActiveTab('HISTORY')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-colors font-medium border ${activeTab === 'HISTORY' ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                ><Trophy size={18} /> Winner History</button>
            </div>

            {activeTab === 'HISTORY' && <WinnerHistory />}

            {activeTab === 'CONTROL' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">

                        <div className="bg-white border border-blue-100 shadow-sm rounded-xl p-6 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1.5 bg-primary h-full"></div>
                            <h2 className="text-xl font-bold mb-6 text-slate-800">Current Prize Queue</h2>
                            <select
                                className="w-full bg-slate-50 border-2 border-primary/20 rounded-xl p-4 text-xl mb-4 text-slate-800 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                                value={drawState.currentPrizeId || ''}
                                onChange={(e) => handlePrizeSelect(e.target.value)}
                            >
                                <option value="">-- Select Prize to Draw --</option>
                                {prizes.filter(p => p.status === 'Ready').map(p => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.drawn_amount}/{p.total_amount} drawn)</option>
                                ))}
                            </select>

                            {currentPrize ? (
                                <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100 flex justify-between items-center mb-6">
                                    <div>
                                        <h3 className="text-2xl font-bold text-primary mb-1">{currentPrize.name}</h3>
                                        <p className="text-slate-600 font-medium">{currentPrize.description}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm text-slate-500 font-bold mb-1">REMAINING</div>
                                        <div className="text-4xl font-black text-slate-800">{remainingInPrize}</div>
                                    </div>
                                </div>
                            ) : null}

                            <button
                                disabled={starting || !!connectionError || !currentPrize || remainingInPrize <= 0 || drawState.phase !== 'READY'}
                                onClick={startDrawSequence}
                                className="w-full bg-gradient-to-r from-primary via-secondary to-accent hover:opacity-90 text-white font-black text-3xl py-6 rounded-2xl flex items-center justify-center gap-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl hover:shadow-[0_0_30px_rgba(255,85,0,0.5)] transform hover:-translate-y-1 active:translate-y-0"
                            >
                                <Play fill="white" size={32} />
                                START DRAW
                            </button>

                            <div className="flex gap-4 mt-6">
                                <button
                                    onClick={() => void runAction(() => updateState({ phase: 'READY', winnerId: null }))}
                                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors border border-slate-200"
                                >
                                    <RotateCcw size={16} /> Reset Screen
                                </button>
                            </div>
                        </div>

                    </div>

                    <div className="space-y-6">
                        <div className="bg-white border border-blue-100 shadow-sm rounded-xl p-6 h-full">
                            <h2 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2"><Trophy className="text-accent" /> Last Winners</h2>
                            <div className="space-y-4">
                                {participants.filter(p => p.status === 'Winner').reverse().slice(0, 5).map((w, idx) => (
                                    <div key={idx} className="bg-slate-50 p-4 rounded-xl flex items-center justify-between border border-slate-100 shadow-sm">
                                        <div>
                                            <div className="font-bold text-slate-800">{w.name}</div>
                                            <div className="text-sm font-medium text-slate-500">{w.department || 'No department'}</div>
                                        </div>
                                        <div className="text-accent text-sm bg-yellow-100 p-2 rounded-full"><Trophy size={16} /></div>
                                    </div>
                                ))}
                                {winnerCount === 0 && (
                                    <div className="text-slate-400 text-center py-8 font-medium">No winners yet.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'PARTICIPANTS' && (
                <div className="bg-white border border-blue-100 shadow-sm rounded-xl p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-slate-800">Manage Participants</h2>
                        <div className="flex gap-4">
                            <button
                                onClick={() => {
                                    const csvContent = "data:text/csv;charset=utf-8,\uFEFFid,name,department\n001,John Doe,IT\n002,Jane Smith,HR";
                                    const encodedUri = encodeURI(csvContent);
                                    const link = document.createElement("a");
                                    link.setAttribute("href", encodedUri);
                                    link.setAttribute("download", "participants_template.csv");
                                    document.body.appendChild(link);
                                    link.click();
                                    link.remove();
                                }}
                                className="bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors border border-slate-200"
                            >
                                <ArrowRightCircle size={16} className="rotate-90" /> Template
                            </button>
                            <label className="cursor-pointer bg-primary/10 text-primary hover:bg-primary/20 font-semibold px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors border border-primary/20">
                                <ArrowRightCircle size={16} /> Upload CSV
                                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                            </label>
                            <button
                                onClick={async () => {
                                    if (confirm("DANGER: This will delete all draw history and reset everyone to Active. Type YES to confirm.")) {
                                        const val = prompt('Type YES:');
                                        if (val === 'YES') {
                                            try { await dataService.resetDraw(); } catch (error) { showError(error); return; }
                                            loadData();
                                            alert("Event Reset successfully.");
                                        }
                                    }
                                }}
                                className="bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 font-semibold px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors"
                            >
                                <Trash2 size={16} /> Reset Event
                            </button>
                            <button
                                onClick={async () => {
                                    if (confirm("DANGER: This will delete ALL participants from the system. Type YES to confirm.")) {
                                        const val = prompt('Type YES:');
                                        if (val === 'YES') {
                                            try { await dataService.clearAllParticipants(); } catch (error) { showError(error); return; }
                                            loadData();
                                            alert("All Participants deleted successfully.");
                                        }
                                    }
                                }}
                                className="bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 font-semibold px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors"
                            >
                                <Trash2 size={16} /> Clear All
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-600 text-sm border-b border-slate-200">
                                <tr>
                                    <th className="py-4 px-4 font-bold">ID</th>
                                    <th className="py-4 px-4 font-bold">Name</th>
                                    <th className="py-4 px-4 font-bold">Department</th>
                                    <th className="py-4 px-4 font-bold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {participants.map(p => (
                                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="py-3 px-4 text-slate-500 font-mono text-xs">{p.id}</td>
                                        <td className="py-3 px-4 text-slate-800 font-medium">{p.name}</td>
                                        <td className="py-3 px-4 text-slate-500 font-medium">{p.department}</td>
                                        <td className="py-3 px-4">
                                            {p.status === 'Winner' ? (
                                                <span className="bg-secondary/10 text-secondary font-bold px-3 py-1 rounded-full text-xs box-border">Winner</span>
                                            ) : (
                                                <span className="bg-success/10 text-success font-bold px-3 py-1 rounded-full text-xs">Active</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'PRIZES' && (
                <div className="bg-white border border-blue-100 shadow-sm rounded-xl p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-slate-800">Manage Prizes</h2>
                        <button
                            onClick={async () => {
                                if (confirm("Delete all prizes?")) {
                                    try { await dataService.clearAllPrizes(); } catch (error) { showError(error); return; }
                                    loadData();
                                }
                            }}
                            className="bg-danger/10 text-danger hover:bg-danger/20 font-semibold px-4 py-2 rounded-lg text-sm"
                        >
                            Clear All Prizes
                        </button>
                    </div>

                    {/* Add Form */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Prize Name</label>
                            <input type="text" className="w-full bg-white border border-slate-300 rounded-lg p-2 focus:border-primary focus:outline-none"
                                value={newPrize.name} onChange={e => setNewPrize({ ...newPrize, name: e.target.value })} placeholder="e.g. iPad Pro" />
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Description (Optional)</label>
                            <input type="text" className="w-full bg-white border border-slate-300 rounded-lg p-2 focus:border-primary focus:outline-none"
                                value={newPrize.description} onChange={e => setNewPrize({ ...newPrize, description: e.target.value })} placeholder="e.g. 256GB" />
                        </div>
                        <div className="w-32">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Amount</label>
                            <input type="number" min="1" className="w-full bg-white border border-slate-300 rounded-lg p-2 focus:border-primary focus:outline-none"
                                value={newPrize.total_amount} onChange={e => setNewPrize({ ...newPrize, total_amount: parseInt(e.target.value) || 1 })} />
                        </div>
                        <button
                            onClick={async (e) => {
                                e.preventDefault();
                                if (!newPrize.name) {
                                    alert("Prize Name is required!");
                                    return;
                                }
                                try {
                                    await dataService.addPrize(newPrize);
                                    setNewPrize({ name: '', description: '', total_amount: 1 });
                                    await loadData();
                                } catch (err: unknown) {
                                    alert("❌ เกิดข้อผิดพลาดร้ายแรง (Crash) ระหว่างเพิ่มข้อมูล: " + (err instanceof Error ? err.message : 'Operation failed'));
                                }
                            }}
                            className="bg-primary hover:bg-primary/90 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 border border-primary"
                        >
                            <PlusCircle size={18} /> Add
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {prizes.map((p, idx) => (
                            <div key={p.id} className="bg-white border-2 border-slate-100 rounded-xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 hover:border-blue-100 transition-colors shadow-sm">
                                <div className="flex-1 flex gap-4 items-center">
                                    <div className="bg-blue-50 text-primary font-black text-xl w-12 h-12 flex items-center justify-center rounded-lg border border-blue-100">
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <h3 className="text-slate-800 font-bold text-lg leading-tight">{p.name}</h3>
                                        <p className="text-slate-500 text-sm font-medium">{p.description}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="flex flex-col items-center">
                                        <span className="text-xs font-bold text-slate-400 mb-1">Drawn / Total</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-bold text-success">{p.drawn_amount}</span>
                                            <span className="text-slate-300">/</span>
                                            <input
                                                type="number"
                                                className="w-16 text-center border-2 border-slate-200 rounded-lg font-bold bg-slate-50 focus:bg-white focus:border-primary outline-none py-1"
                                                value={p.total_amount}
                                                onChange={async (e) => {
                                                    const val = parseInt(e.target.value) || 0;
                                                    try { await dataService.updatePrizeAmount(p.id, val); } catch (error) { showError(error); return; }
                                                    loadData();
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                void runAction(() => updateState({ currentPrizeId: p.id, phase: 'READY' }));
                                                setActiveTab('CONTROL');
                                            }}
                                            disabled={p.status === 'Completed'}
                                            className="bg-primary/10 hover:bg-primary/20 text-primary font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Set as Current
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (confirm('Delete this prize?')) {
                                                    try { await dataService.deletePrize(p.id); } catch (error) { showError(error); return; }
                                                    loadData();
                                                }
                                            }}
                                            className="text-danger/60 hover:text-danger bg-danger/5 hover:bg-danger/10 p-2 rounded-lg transition-colors"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {prizes.length === 0 && (
                            <div className="text-center text-slate-400 py-10 font-bold bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                ไม่มีรางวัลในระบบ (No prizes added yet)
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}
