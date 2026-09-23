'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
    return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-slate-800">
        <h1 className="text-xl font-bold">ไม่สามารถแสดงหน้านี้ได้</h1>
        <p>กรุณาตรวจสอบการเชื่อมต่อ แล้วลองอีกครั้ง</p>
        <button onClick={reset} className="rounded-lg bg-slate-900 px-5 py-3 text-white">ลองอีกครั้ง</button>
    </main>;
}
