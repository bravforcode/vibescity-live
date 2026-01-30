import http from 'k6/http';
import { check, sleep } from 'k6';

// ตั้งค่าความโหด (Configuration)
export const options = {
  // Stages: กำหนดลำดับการเพิ่มจำนวนคน (Virtual Users - VUs)
  stages: [
    { duration: '30s', target: 20 },   // Warm up: เริ่มจาก 0 ถึง 20 คน ใน 30 วิ
    { duration: '1m', target: 100 },   // Ramp up: เพิ่มเป็น 100 คน ใน 1 นาที
    { duration: '30s', target: 300 },  // Spike!: กระชากขึ้นเป็น 300 คนทันที (จุดวัดใจ)
    { duration: '1m', target: 300 },   // Sustain: แช่ไว้ที่ 300 คน 1 นาที
    { duration: '30s', target: 0 },    // Cool down: ลดลงเหลือ 0
  ],
  // Thresholds: เกณฑ์ที่จะบอกว่า "สอบตก" (Fail)
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% ของ Request ต้องตอบกลับภายใน 500ms
    http_req_failed: ['rate<0.01'],   // Error rate ต้องน้อยกว่า 1% (ห้ามล่ม!)
  },
};

export default function () {
  // URL เป้าหมาย (เปลี่ยนเป็น URL จริงของ livecity หรือ API Localhost)
  const url = 'http://localhost:3000/api/locations';

  // จำลอง Payload (ถ้าเป็นการ POST)
  // const payload = JSON.stringify({ lat: 13.7563, lng: 100.5018 });
  // const params = { headers: { 'Content-Type': 'application/json' } };

  // ยิง Request
  const res = http.get(url); // หรือ http.post(url, payload, params);

  // ตรวจสอบผลลัพธ์ (Check)
  check(res, {
    'status is 200': (r) => r.status === 200,
    'data is not empty': (r) => r.body.length > 0,
  });

  // พักหายใจ 1 วินาที ก่อนยิงใหม่ (จำลองพฤติกรรมคนจริง)
  sleep(1);
}
