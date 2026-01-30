import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { check, group, sleep } from 'k6';
import http from 'k6/http';

// ==============================================================================
// 1. CONFIGURATION: ความโหดระดับนรก (Hell Configuration)
// ==============================================================================
export const options = {
  // ปิดการตรวจสอบ SSL (เผื่อ Localhost ใบรับรองไม่ผ่าน)
  insecureSkipTLSVerify: true,

  // กำหนด Scenario หลายรูปแบบให้ทำงานพร้อมกัน (Mixed Workload)
  scenarios: {
    // 1.1 The Tsunami: กระชากคนใช้งานจาก 0 เป็น 200 ใน 10 วินาที (ทดสอบ Auto-scale)
    spike_attack: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 200 }, // กระชากขึ้นเร็วมาก!
        { duration: '1m', target: 200 },  // แช่แข็งไว้
        { duration: '10s', target: 0 },   // ลงเร็ว
      ],
      gracefulStop: '0s', // ไม่มีการปรานี หยุดคือหยุด
    },

    // 1.2 The Hammer: ยิงรัวๆ แบบคงที่ เพื่อกดดัน Database Connection Pool
    stress_constant: {
      executor: 'constant-vus',
      vus: 50,
      duration: '1m30s',
      startTime: '30s', // เริ่มหลังจาก Tsunami เริ่มไปแป๊บนึง
    },
  },

  // เกณฑ์การผ่าน (ถ้าแย่กว่านี้ถือว่าระบบล่ม)
  thresholds: {
    http_req_failed: ['rate<0.05'],    // Error ห้ามเกิน 5% (โหดมากสำหรับ Chaos)
    http_req_duration: ['p(95)<2000'], // 95% ของ request ต้องเสร็จใน 2 วิ (แม้ยามศึกหนัก)
  },
};

// ==============================================================================
// 2. DATA GENERATOR: คลังแสงขยะ (Nasty Payloads)
// ==============================================================================
// ข้อมูลที่จะใช้ Fuzzing เพื่อพยายามพัง Logic หรือ Database
const NASTY_PAYLOADS = [
  "' OR '1'='1",              // SQL Injection Classic
  "<script>alert(1)</script>", // XSS Injection
  "A".repeat(10000),           // Buffer Overflow / Large String
  "😂".repeat(500),            // Emoji Bomb (Test Encoding)
  null,                        // Null Value
  undefined,                   // Undefined
  -1,                          // Negative Number
  999999999999999,             // Integer Overflow
  "DROP TABLE users;",         // Destructive SQL
  "{{7*7}}",                   // Template Injection
];

const BASE_URL = 'http://127.0.0.1:8001'; // ✅ VibeCity Backend (Port 8001)

// ==============================================================================
// 3. TEST LOGIC: เริ่มปฏิบัติการ
// ==============================================================================
export default function () {

  // สุ่มเลือกพฤติกรรม (User Behavior)
  const behavior = randomIntBetween(1, 10);

  // --------------------------------------------------------------------------
  // Scenario A: GET Request ถล่ม Read (70% ของ Traffic)
  // --------------------------------------------------------------------------
  if (behavior <= 7) {
    group('API Read Storm', () => {
      // ใช้ http.batch เพื่อจำลอง Browser ที่ยิงหลาย Request พร้อมกัน (Parallel Requests)
      const responses = http.batch([
        ['GET', `${BASE_URL}/api/v1/owner/stats/1`], // Admin Dashboard
        ['GET', `${BASE_URL}/api/v1/shops`],         // Main Map Data
      ]);

      check(responses[0], {
        'GET Owner Stats 200': (r) => r.status === 200,
        'GET Owner Stats fast': (r) => r.timings.duration < 1000,
      });

      check(responses[1], {
        'GET Shops 200': (r) => r.status === 200,
      });
    });
  }

  // --------------------------------------------------------------------------
  // Scenario B: POST Request ถล่ม Write & Logic (30% ของ Traffic)
  // --------------------------------------------------------------------------
  else {
    group('API Write Chaos', () => {
      // Test Ride Estimate (Heavy Logic + Rate Limit)
      const payload = JSON.stringify({
        start_lat: 18.7883 + (Math.random() * 0.01),
        start_lng: 98.9853 + (Math.random() * 0.01),
        end_lat: 18.7983 + (Math.random() * 0.01),
        end_lng: 98.9953 + (Math.random() * 0.01)
      });

      const params = {
        headers: {
          'Content-Type': 'application/json',
        },
      };

      // ยิง POST
      const res = http.post(`${BASE_URL}/api/v1/rides/estimate`, payload, params);

      check(res, {
        'POST Ride Estimate 200 or 429 (Rate Limit)': (r) => r.status === 200 || r.status === 429,
        'Server survived crash': (r) => r.status !== 500 && r.status !== 502,
      });
    });
  }

  // Random Sleep: พักบ้างไม่พักบ้าง ให้กราฟมันแกว่งแบบคาดเดาไม่ได้
  sleep(randomIntBetween(0.1, 1.5));
}
