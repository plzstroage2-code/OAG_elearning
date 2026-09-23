import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};

export default function config(phase: string) {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const url = process.env.NEXT_PUBLIC_LUCKYDRAW_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_LUCKYDRAW_SUPABASE_KEY;
    if (!url || !key || url.includes('mock.supabase.co') || key === 'mock-key' || key.includes('REPLACE_ME') || url.includes('YOUR_PROJECT')) {
      throw new Error('Production build requires NEXT_PUBLIC_LUCKYDRAW_SUPABASE_URL and NEXT_PUBLIC_LUCKYDRAW_SUPABASE_KEY. See DEPLOYMENT.md.');
    }
    if (!url.startsWith('https://')) throw new Error('Production Supabase URL must use HTTPS.');
    if (key.startsWith('sb_secret_')) throw new Error('Use a publishable key, never a Supabase secret key.');
    if (key.startsWith('eyJ')) {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      if (payload.role !== 'anon') throw new Error('Only the public anon key is allowed in NEXT_PUBLIC variables.');
    } else if (!key.startsWith('sb_publishable_')) throw new Error('Use a Supabase publishable key or legacy anon key.');
  }
  return nextConfig;
}
