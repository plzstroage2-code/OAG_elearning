// ─── Domain primitives ────────────────────────────────────────────────────────

/** ข้อมูลผู้เข้าร่วมงาน 1 คน */
export type Participant = {
  IndexID:    string;
  Name:       string;
  Department: string;
  Job_role:   string;
};

/** ประเภทภาพประกอบรางวัล */
export type PrizeKind = 'audio' | 'watch' | 'bag' | 'gift';

/** รางวัล 1 ประเภท */
export type Prize = {
  id:        string;
  name:      string;
  total:     number;
  kind:      PrizeKind;
  imageUrl?: string;
};

/** ผู้ชนะ (มีโครงสร้างเดียวกับ Participant) */
export type Winner = Participant;

/** ผลการสุ่ม 1 รอบ (ข้อมูล server-side เต็มรูปแบบ) */
export type Round = {
  id:             string;
  requestId:      string;
  payloadKey:     string;
  prizeId:        string;
  prizeName:      string;
  winners:        Winner[];
  eligibleCount:  number;
  createdAt:      number;
  revealAt:       number;
  cancelled?:     { reason: string; at: number };
  operator:       string;
};

/** ตั้งค่าการแสดงผลของงาน */
export type Settings = {
  name:            string;
  allowRepeat:     boolean;
  showDepartment:  boolean;
  showRole:        boolean;
  maskNames:       boolean;
};

/** โค้ดผู้จัด */
export type Code = {
  id:        string;
  salt:      string;
  hash:      string;
  expiresAt: number;
  revoked:   boolean;
  role:      'admin' | 'operator';
};

/** เซสชันที่กำลัง active */
export type Session = {
  hash:      string;
  codeId:    string;
  expiresAt: number;
};

/** บันทึก audit log */
export type Audit = {
  at:     number;
  action: string;
  detail: string;
};

// ─── Server state ─────────────────────────────────────────────────────────────

/** state ทั้งหมดของระบบ (เก็บใน file / PostgreSQL) */
export type State = {
  schemaVersion:  1;
  version:        number;
  demo:           boolean;
  settings:       Settings;
  participants:   Participant[];
  prizes:         Prize[];
  rounds:         Round[];
  currentPrizeId: string;
  activeRoundId:  string | null;
  excludedIds:    string[];
  codes:          Code[];
  sessions:       Session[];
  attempts:       Record<string, { count: number; until: number }>;
  audit:          Audit[];
};

// ─── Public (client-facing) types ─────────────────────────────────────────────

/** ผลการสุ่ม 1 รอบที่เปิดเผยต่อ client */
export type PublicRound = {
  id:         string;
  prizeName:  string;
  count:      number;
  createdAt:  number;
  revealAt:   number;
  winners:    Winner[];
  cancelled?: { reason: string; at: number };
};

/** Snapshot ที่ API ส่งกลับให้ client ทุกครั้ง */
export type Snapshot = {
  version:           number;
  serverNow:         number;
  demo:              boolean;
  settings:          Settings;
  eligibleCount:     number;
  participantCount:  number;
  prizes:            (Prize & { remaining: number })[];
  currentPrizeId:    string;
  active:            PublicRound | null;
  history:           PublicRound[];
  role:              'viewer' | 'operator' | 'admin';
  sessionExpiresAt?: number;
  phase:             'ready' | 'drawing' | 'revealed';
  realtime:          boolean;
};
