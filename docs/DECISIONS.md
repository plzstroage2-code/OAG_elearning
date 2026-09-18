# Decisions

- Next.js routes on Node + pg connects to Supabase pooler. One code path for domain logic across file demo and PostgreSQL live.
- Demo JSON is serialized in-process and atomically renamed, with a last-known backup. Demo is single process / loopback only. Live rejects file mode.
- PostgreSQL holds private event JSON document locked FOR UPDATE per command, plus read-only public stage signal for Realtime. Appropriate to bounded event size (initial max 5,000 participants), not a multi-tenant SaaS claim.
- Draw records store revealAt and server timestamp. Public GET gates results using server time. No background timer needed for durable reveal.
- HttpOnly opaque sessions stored as hashes; code hashed with scrypt; durable rate limit; same-origin mutations. Never localStorage auth.
- Realtime sends revision signal only. Client fetches public snapshot; polling fallback and reveal deadline read cover loss/reconnect. Viewer database access cannot read private document.
- Every round has request ID + canonical payload. Duplicate returns existing round, conflicting payload fails.
- Save source checkpoints excluding credentials, runtime data, dependencies and build output. Quota exhaustion cannot be prevented; durable handoff is the mitigation.
