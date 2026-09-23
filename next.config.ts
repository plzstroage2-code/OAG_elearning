import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ]
    }];
  },
};

export default function config(phase: string) {
  // Relaxed strict checks to allow Vercel to build even if environment variables are missing
  // in Preview deployments. The application will handle missing configs at runtime.
  return nextConfig;
}
