export type Participant = { IndexID: string; Name: string; Department: string; Job_role: string };
export type Prize = { id: string; name: string; total: number; kind: 'audio'|'watch'|'bag'|'gift'; imageUrl?: string };
export type Winner = Participant;
export type Round = { id: string; requestId: string; payloadKey: string; prizeId: string; prizeName: string; winners: Winner[]; eligibleCount: number; createdAt: number; revealAt: number; cancelled?: { reason: string; at: number }; operator: string };
export type Settings = { name: string; allowRepeat: boolean; showDepartment: boolean; showRole: boolean; maskNames: boolean };
export type Code = { id: string; salt: string; hash: string; expiresAt: number; revoked: boolean; role: 'admin'|'operator' };
export type Session = { hash: string; codeId: string; expiresAt: number };
export type Audit = { at: number; action: string; detail: string };
export type State = {
  schemaVersion: 1; version: number; demo: boolean; settings: Settings; participants: Participant[]; prizes: Prize[];
  rounds: Round[]; currentPrizeId: string; activeRoundId: string|null; excludedIds: string[];
  codes: Code[]; sessions: Session[]; attempts: Record<string,{ count:number; until:number }>; audit: Audit[];
};
export type PublicRound = { id:string; prizeName:string; count:number; createdAt:number; revealAt:number; winners: Winner[]; cancelled?: {reason:string;at:number} };
export type Snapshot = {
  version:number; serverNow:number; demo:boolean; settings:Settings; eligibleCount:number; participantCount:number;
  prizes:(Prize & {remaining:number})[]; currentPrizeId:string; active:PublicRound|null; history:PublicRound[];
  role:'viewer'|'operator'|'admin'; sessionExpiresAt?:number; phase:'ready'|'drawing'|'revealed'; realtime:boolean;
};
