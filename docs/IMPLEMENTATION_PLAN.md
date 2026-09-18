# แผนพัฒนา

## ข้อกำหนดที่ตกลงแล้ว
เว็บภาษาไทยหน้าเดียว ส้ม/ขาว ICTC e-Learning; คนทั่วไปดูอย่างเดียว; ปุ่มผู้จัดเล็ก เปิด dialog กรอก code; หลังยืนยันจึงมีปุ่มสุ่มบนเวที; fullscreen คงปุ่มสุ่ม; responsive; ริบบิ้นเปิดผลราว 2.6 วินาที; เคารพ reduced motion.

## 6 ระยะ
1. โครงหน้าเว็บ responsive, สถานะ, modal, drawer, docs/checkpoint.
2. ข้อมูล server, code hash, HttpOnly sessions, validation/import, prizes.
3. สุ่มด้วย crypto.randomInt, request ID, transaction, ประวัติ, replay, recovery.
4. public status version/revealAt, Supabase signal, snapshot/poll fallback, no early winner leak.
5. Motion/CSS stage, sound opt-in, quality controls, Thai long names/mobile.
6. tests/typecheck/build/browser QA, deployment guide, handoff.

## ตรวจรับสำคัญ
API กันผู้ไม่มีสิทธิ์; กดซ้ำ/หลายเครื่องไม่สุ่มเกิน; rollback; timeout recover same request; ผลก่อน revealAt ห้ามออกทุก endpoint; reconnect ใช้ snapshot; import CSV atomic; history/replay ไม่กินรางวัล; production fail closed without database/secrets.

## ขอบเขตการส่งมอบรอบนี้
เว็บและ server รันในเครื่องได้จริง; local demo มีป้าย; code/SQL/docs สำหรับ live; ไม่อ้าง deploy ก่อนมีบัญชีและ credentials. 3D เต็มรูปแบบเป็น optional ใช้ CSS stage ก่อน. ห้ามเรียก AI ตอนสุ่ม.
