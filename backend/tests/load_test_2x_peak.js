import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * VibeCity Enterprise Load Test
 * Goal: Verify 2x Peak (1,000 concurrent users)
 * Target: Response time < 200ms for p95
 */

export const options = {
  stages: [
    { duration: '2m', target: 500 },  // Ramp up to 500 users
    { duration: '5m', target: 1000 }, // Stay at 1,000 users (2x Peak)
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests must be below 200ms
    http_req_failed: ['rate<0.01'],   // Error rate < 1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.vibecity.live/api/v1';

export default function () {
  // 1. Browsing venues (High frequency)
  const geodataRes = http.get(`${BASE_URL}/geodata/tiles?z=14&x=13107&y=7345`);
  check(geodataRes, {
    'geodata status is 200': (r) => r.status === 200,
  });

  sleep(1);

  // 2. Searching (Medium frequency)
  const searchRes = http.get(`${BASE_URL}/shops/search?q=cafe`);
  check(searchRes, {
    'search status is 200': (r) => r.status === 200,
  });

  sleep(2);

  // 3. Getting shop detail (Low frequency)
  const shopId = '7b9e1d2c-3f4a-4b5c-8d9e-0f1a2b3c4d5e'; // Mock ID
  const detailRes = http.get(`${BASE_URL}/shops/${shopId}`);
  check(detailRes, {
    'detail status is 200 or 404': (r) => r.status === 200 || r.status === 404,
  });

  sleep(3);
}
