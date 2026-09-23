# คู่มือ Production — OAGTH Lucky Award

โปรเจกต์ที่ใช้:
- Supabase: https://supabase.com/dashboard/project/jiotnrkzacgdbblplksz
- GitHub: https://github.com/plzstroage2-code/OAG_elearning
- Vercel: https://vercel.com/oag4/oagth-newgen-lucky

GitHub เก็บโค้ดและประวัติ, Vercel build/ให้บริการเว็บ, Supabase เก็บข้อมูล บัญชี และผลจับรางวัล
ไฟล์ใน repository เตรียมพร้อมแล้ว แต่ต้องทำขั้นตอนบัญชีและฐานข้อมูลด้านล่างก่อนใช้งานจริง

## 1. เตรียม Supabase

สำรองข้อมูลเดิมก่อนเปลี่ยน schema และควรซ้อม migration ในโปรเจกต์ทดสอบก่อนงานจริง

1. เปิด SQL Editor ในโปรเจกต์ข้างต้น
2. ถ้าเป็นฐานข้อมูลใหม่ ให้รัน `supabase/migrations/000000_init.sql` หนึ่งครั้ง (มีรางวัลตัวอย่าง 3 รายการ ให้จัดการใน Admin ก่อนงานจริง)
3. ถ้ามี participants, prizes และ draw_logs จากเวอร์ชันเดิมอยู่แล้ว **ไม่ต้องรัน 000000 ซ้ำ** เพราะจะเพิ่มรางวัลตัวอย่างซ้ำ
4. รัน `supabase/migrations/000001_production.sql` หนึ่งครั้งทั้งไฟล์ มี BEGIN/COMMIT ถ้าล้มเหลวจะ rollback
5. ถ้าใช้ Supabase CLI ให้จัดการ baseline/migration history ให้ตรงกับฐานข้อมูลเดิมก่อน `supabase db push` อย่ารันไฟล์เดียวซ้ำทั้ง SQL Editor และ CLI
6. ตรวจ Security Advisor และตรวจว่า RLS เปิดใน participants, prizes, draw_logs, event_state

Migration เพิ่มสิทธิ์การอ่านตามบทบาทและให้เขียนผ่าน `manage_event` เท่านั้น ไม่ให้ browser เขียนตารางโดยตรง
ข้อมูลเก่าจะยังอยู่ และชื่อผู้ชนะ/แผนก/รางวัลถูกเก็บเป็น snapshot ในประวัติ
หาก schema เดิมถูกแก้นอกเหนือจาก migration ของโปรเจกต์นี้ ให้ตรวจ constraint/policy ก่อนนำ migration ไปใช้

## 2. สร้างบัญชีผู้ใช้งาน

ใน Authentication → Users สร้างบัญชีแบบ email/password และยืนยันอีเมลตาม workflow ขององค์กร
ปิดการสมัครสมาชิกสาธารณะใน Auth settings ระบบนี้ไม่มีหน้าสมัครสมาชิก

สร้างอย่างน้อย 2 บัญชี: ผู้ควบคุม (`admin`) และเครื่องฉาย (`display`)
หลังสร้างผู้ใช้ ให้เจ้าของโปรเจกต์รัน SQL นี้โดยแทนอีเมลให้ถูกต้อง:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || '{"lucky_draw_role":"admin"}'::jsonb
where email = 'YOUR_ADMIN_EMAIL';

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || '{"lucky_draw_role":"display"}'::jsonb
where email = 'YOUR_DISPLAY_EMAIL';
```

ตรวจจำนวนแถวที่อัปเดตต้องเป็น 1 ต่อบัญชี แล้วออกจากระบบ/เข้าสู่ระบบใหม่เพื่อรับ JWT ที่มี role ใหม่
อย่าเก็บ role ใน user_metadata เพราะผู้ใช้แก้เองได้
บัญชี display เปิด `/` อ่านรายชื่อและรางวัลเพื่อแสดง reel ได้ แต่ดูประวัติทั้งหมดและแก้ข้อมูลไม่ได้
บัญชี admin เปิด `/admin` ได้ ระบบไม่ใช้ service_role key ในเว็บ
หากเปลี่ยนสิทธิ์ระหว่างงาน ควร revoke session เดิมด้วย เพราะ JWT เก่าอาจยังใช้ได้จนหมดอายุ

## 3. Environment variables

ใน Supabase Project Settings → API คัดลอก Project URL และ **Publishable key** (หรือ legacy anon key)

```env
NEXT_PUBLIC_LUCKYDRAW_SUPABASE_URL=https://jiotnrkzacgdbblplksz.supabase.co
NEXT_PUBLIC_LUCKYDRAW_SUPABASE_KEY=sb_publishable_ค่าจริงจากโปรเจกต์
```

สำหรับเครื่องพัฒนา ให้คัดลอก `.env.example` เป็น `.env.local` แล้วกรอกสองค่า ไม่ commit `.env.local`
ห้ามใช้ `sb_secret_`, service_role key, database password หรือรหัสผ่านผู้ใช้ในตัวแปร NEXT_PUBLIC
ชื่อ environment ต้องตรงนี้ ไม่ใช่ชื่อ NEXT_PUBLIC_SUPABASE_URL ที่ README รุ่นเก่าเคยระบุ
Production build จะหยุดเมื่อไม่มี configuration; demo เปิดได้เฉพาะ local development ที่ยังไม่เชื่อม Supabase

## 4. Git / GitHub

Production repository: https://github.com/plzstroage2-code/OAG_elearning
Local branch: `production-readiness`. The local history is preserved from the previous repository.
The origin URL now points to the new repository. This change does not push commits or replace its main branch.
Inspect the new remote history before merging or pushing; do not force-push over existing work.

```powershell
git remote -v
git fetch origin
git ls-remote --symref origin HEAD
npm ci
npm run check
# Set the new Supabase public environment values before building.
npm run build
```

After reviewing the destination branch/history, push a review branch and open a PR.
Apply the migrations, create authorized users, and configure Vercel before merging into the production branch.
The CI build uses public placeholders for compilation only. Vercel must rebuild with the real environment values.
Data and Auth users are not automatically migrated between Supabase projects.

## 5. Vercel

1. เปิดโปรเจกต์ `oag4/oagth-newgen-lucky`
2. Settings → Git: ตรวจว่าเชื่อม `plzstroage2-code/OAG_elearning` และ Production Branch ถูกต้อง
3. Framework Preset: Next.js; Root Directory: โฟลเดอร์ที่มี package.json; Node.js: 22.x
4. Install command: `npm ci`; Build command: `npm run build`; Output Directory ใช้ค่า default ของ Next.js
5. Settings → Environment Variables: เพิ่มสองค่าตามข้อ 3 ใน Production
6. Preview ควรใช้ Supabase คนละโปรเจกต์กับงานจริง เพื่อไม่ให้การซ้อมจับรางวัลเปลี่ยนผลจริง
7. รัน migration และสร้างบัญชีให้เสร็จก่อน deploy โค้ดรุ่นนี้ จากนั้น merge/deploy commit ที่ตรวจแล้ว
8. ถ้าเปลี่ยน NEXT_PUBLIC environment ต้อง Redeploy เพราะค่าถูกฝังตอน build
9. ตั้ง Supabase Auth Site URL เป็นโดเมนจริงจาก Vercel และกำหนด Redirect URLs เท่าที่ใช้งาน (อย่าคาดเดาโดเมนจากชื่อโปรเจกต์)

## 6. ซ้อมก่อนวันงาน

- เปิดหน้าจอ `/` ด้วยบัญชี display และ `/admin` ด้วยบัญชี admin บนคนละเครื่อง
- ผู้ไม่ล็อกอินและผู้ไม่มี role ต้องอ่าน/แก้ข้อมูลไม่ได้; display ต้องเริ่มจับรางวัลไม่ได้
- เพิ่มรางวัลทดสอบและผู้เข้าร่วม 2–3 คน แล้วตรวจการเลือก prize, countdown, reel, ชื่อผู้ชนะ และ history
- **ผลถูกสุ่มและบันทึกใน transaction ตอนกดเริ่ม** แอนิเมชันเป็นการแสดงผล ไม่ได้สุ่มใหม่เมื่อจบ
- ปิด/รีเฟรชหน้าควบคุมระหว่างหมุน แล้วเปิดใหม่ ต้องได้ผลเดิมและไม่มีประวัติซ้ำ
- ลองกดเริ่มจาก admin สองแท็บพร้อมกัน ต้องได้ผลเดียว
- จอที่เปิดช้าหรือเน็ตกลับมาต้องแสดงผลที่บันทึกไว้ ไม่สุ่มใหม่
- การซิงก์อ่านสถานะจาก Supabase ทุก 1 วินาที ไม่ต้องเปิด Realtime publication; อาจช้าตามเครือข่าย
- จอที่เปิดจากเครื่องฉายอาจต้องคลิกหน้าเว็บหนึ่งครั้งเพื่ออนุญาตเสียงตามนโยบาย browser
- ตรวจตัวกรองวันที่ Bangkok (UTC+7), ลำดับผู้ได้รับรางวัล และข้อมูลรางวัลครบ
- ทดสอบบนเครือข่าย/จอจริงและโหลดรายชื่อจริงก่อนเริ่มงาน

## ข้อควรรู้ในการปฏิบัติงาน

- Reset Screen ใช้เตรียมรอบถัดไปหลังประกาศผล ไม่ยกเลิกผลที่บันทึกแล้ว และใช้ไม่ได้ระหว่าง draw กำลังทำงาน
- Reset Event ลบประวัติทั้งหมดและคืนผู้เข้าร่วมเป็น Active ต้องสำรองข้อมูลก่อนใช้
- การลบผู้เข้าร่วมหรือรางวัลที่มีประวัติจะถูกปฏิเสธ เพื่อไม่ให้ประวัติหายตาม foreign key
- การนำเข้ารายชื่อเดิมอัปเดตชื่อ/แผนกแต่ไม่คืนผู้ชนะเป็น Active
- หนึ่ง Supabase project รองรับหนึ่งงานที่กำลังจับรางวัลในเวอร์ชันนี้
- ระบบนี้ใช้การสุ่มของ PostgreSQL สำหรับงานจับรางวัลภายใน ไม่ใช่ระบบรับรองการสุ่มสำหรับธุรกรรมการพนัน
- สำรองฐานข้อมูลก่อนงานและหลังงาน และเลือก backup/availability plan ที่เหมาะกับงานจริง
- ทดสอบ SQL ด้วย PGlite (Postgres ในหน่วยความจำ) แล้ว แต่ยังต้องทดสอบ Supabase Auth/API และสิทธิ์จริงหลังเชื่อมบัญชี

เอกสารทางการ:
- https://supabase.com/docs/guides/deployment/going-into-prod
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions
- https://vercel.com/docs/git
- https://vercel.com/docs/environment-variables
