// Limit: reads source text only. It catches a deletion like a4b0b75 (ISSUE-UI-1), and does not prove the condition around a phrase still renders it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const required: Record<string, string[]> = {
  'pages/Behavior.tsx': [
    'วันที่ไม่มีรายการไม่ได้ยืนยันว่าไม่มีการใช้จ่ายจริง เกณฑ์ 30 รายการและระยะ 30 วันไม่ยืนยันข้อมูลครบหรือมีนัยสำคัญทางสถิติ',
    'เป็นหลักฐานในช่วงที่เลือก ไม่ยืนยันว่าเกิดซ้ำต่อเนื่องจนถึงปัจจุบันหรือเป็นบิลเดียวกัน',
    'คำแนะนำอ้างข้อมูลที่พบ ไม่ได้พิสูจน์สาเหตุหรือแรงจูงใจ',
  ],
  'pages/Goals.tsx': ['เงินที่เก็บเข้าเป้าหมายเป็นการกันเงินไว้ ไม่เปลี่ยนรายรับ รายจ่าย หรืองบประมาณ และไม่ใช่ยอดเงินสดคงเหลือ'],
  'components/GoalFeasibility.tsx': ['ไม่รับประกันรายได้ในอนาคต', 'ไม่ถือว่าเงินสุทธิทั้งหมดต้องนำมาออม'],
  'pages/Overview.tsx': ['เดือนนี้ยังไม่สิ้นสุด', 'อัตราการออมคำนวณจากรายการที่บันทึก ไม่ใช่ยอดที่เก็บเข้าเป้าหมาย หรือข้อกำหนดให้ต้องออมเงินทั้งหมด'],
  'pages/Forecast.tsx': ['ไม่รับประกันว่าจะเพียงพอต่อภาระจ่ายที่ยังไม่ได้บันทึก', 'ไม่ใช่การรับประกันว่าจะอยู่ในงบ'],
};

for (const [file, phrases] of Object.entries(required)) {
  test('warnings stay in ' + file, () => {
    const source = fs.readFileSync(path.join(__dirname, '../../frontend/src', file), 'utf8').replace(/\s+/g, ' ');
    for (const phrase of phrases) assert.ok(source.includes(phrase), 'missing: ' + phrase);
  });
}
