'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, isDemoMode } from '@/lib/supabase';

export default function AccessGate({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const [session, setSession] = useState<Session | null>(null);
    const [ready, setReady] = useState(isDemoMode);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!isSupabaseConfigured) return;
        const { data } = supabase.auth.onAuthStateChange((_event, next) => {
            setSession(next); setReady(true);
        });
        return () => data.subscription.unsubscribe();
    }, []);
    const signIn = async (event: FormEvent) => {
        event.preventDefault(); setBusy(true); setError('');
        try {
            const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
            if (error) throw error;
            setPassword('');
        } catch { setError('เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบอีเมล รหัสผ่าน และการเชื่อมต่อ'); }
        finally { setBusy(false); }
    };
    if (isDemoMode) return <><div className="fixed right-3 bottom-3 z-[300] rounded bg-amber-100 px-3 py-1 text-xs text-amber-900">Local demo · ข้อมูลทดสอบ</div>{children}</>;
    const role = session?.user.app_metadata?.lucky_draw_role;
    const allowed = role === 'admin' || (role === 'display' && !pathname.startsWith('/admin'));
    if (ready && session && allowed) return <>
        {children}
        {pathname.startsWith('/admin') && (
            <button onClick={() => void supabase.auth.signOut()} className="fixed right-3 top-3 z-[300] rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-xs text-slate-600 shadow-sm hover:bg-slate-50 transition-colors">Sign out</button>
        )}
    </>;
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">Lucky Draw</h1>
            {!isSupabaseConfigured ? <p className="mt-4 text-red-700">Production requires Supabase configuration.</p>
                : !ready ? <p className="mt-4">กำลังตรวจสอบบัญชี…</p>
                : session ? <div className="mt-4 space-y-4"><p>บัญชีนี้ไม่มีสิทธิ์เข้าหน้านี้ กรุณาติดต่อผู้ดูแลระบบ</p><Link href="/" className="block text-blue-700">ไปหน้าจอแสดงผล</Link><button onClick={() => void supabase.auth.signOut()} className="text-red-700">ออกจากระบบ</button></div>
                : <form onSubmit={signIn} className="mt-6 space-y-4">
                    <p className="text-sm text-slate-500">เข้าสู่ระบบด้วยบัญชีที่ผู้ดูแลอนุญาต</p>
                    <label className="block text-sm">อีเมล<input required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3" /></label>
                    <label className="block text-sm">รหัสผ่าน<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3" /></label>
                    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                    <button disabled={busy} className="w-full rounded-lg bg-slate-900 p-3 font-semibold text-white disabled:opacity-50">{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
                </form>}
        </div>
    </main>;
}
