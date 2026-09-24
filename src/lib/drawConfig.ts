/**
 * Central Configuration for Lucky Draw
 * Single Source of Truth
 */
export const DRAW_CONFIG = {
    // ⏱️ ระยะเวลาในการหมุน (หน่วย: วินาที)
    durationSeconds: 7,

    // 🚀 ความเร็วสูงสุดของการหมุน (px/ms) — ปรับสมดุลระหว่างความเร็วสายตาและ physics
    peakVelocityPxPerMs: 13,

    // 📐 ขนาดของแถบรายชื่อ
    itemHeight: 96,
    itemGap: 12,

    // --- ระบบคำนวณอัตโนมัติ ---
    get totalDurationMs() {
        return this.durationSeconds * 1000;
    },
    get itemFullHeight() {
        return this.itemHeight + this.itemGap; // 108px
    },

    /**
     * 🎯 จำนวน item ที่ล้อต้องวิ่งผ่านก่อนหยุด
     * คำนวณจาก: distance ≈ ½ × v_peak × t_total (deceleration phase)
     * เผื่อ buffer +12 item เพื่อให้มี card เหลือหลัง winner
     */
    get winnerIndex() {
        // จำนวน item ที่หมุนผ่าน ≈ ระยะทางรวม / itemFullHeight
        // ระยะทางรวม ≈ (peakVelocity × duration) × 0.5  (เพราะ decelerate ตลอด)
        const totalDistancePx = this.peakVelocityPxPerMs * this.totalDurationMs * 0.42;
        return Math.round(totalDistancePx / this.itemFullHeight);
    },
    get totalItems() {
        return this.winnerIndex + 15;
    },

    /**
     * 🎲 สุ่ม sub-pixel landing offset ของ winner card (CS:GO authentic method)
     *
     * หลักการ: กำหนดจุดหยุดจริงในหน่วย "pixel offset จากกึ่งกลางการ์ด"
     * - ช่วง [-safeHalf, +safeHalf] ครอบคลุมพื้นที่ card โดยไม่หลุดไปการ์ดข้างๆ
     * - ทุกจุดมีโอกาสเท่ากัน (Uniform distribution)
     * - ค่านี้จะถูก bake เข้าไปใน totalDistance ไม่ใช่ offset หลังคำนวณ
     */
    calculateLandingOffset(): number {
        const safeHalf = (this.itemHeight / 2) - 5; // 31px
        return (Math.random() * 2 - 1) * safeHalf; // ไม่ต้อง round เพื่อให้ได้ sub-pixel จริง
    }
};
