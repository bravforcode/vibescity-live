import http from "k6/http";
import { check, sleep } from "k6";
import { buildHtmlReport } from "./lib/summary-report.js";

const BASE_URL = (__ENV.K6_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
const API_BASE = `${BASE_URL}/api/v1`;

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m", target: 50 },
    { duration: "2m", target: 100 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

export function setup() {
  const res = http.get(`${API_BASE}/shops`);
  if (res.status === 200) {
    try {
      const data = JSON.parse(res.body);
      const ids = Array.isArray(data)
        ? data.map((item) => item.id).filter((id) => id !== undefined)
        : [];
      return { shopIds: ids.slice(0, 100) };
    } catch (error) {
      return { shopIds: [] };
    }
  }
  return { shopIds: [] };
}

export default function (data) {
  const health = http.get(`${BASE_URL}/health`);
  check(health, {
    "health 200": (r) => r.status === 200,
  });

  const list = http.get(`${API_BASE}/shops`);
  check(list, {
    "shops 200": (r) => r.status === 200,
  });

  const ids = data && data.shopIds ? data.shopIds : [];
  if (ids.length > 0) {
    const randomId = ids[Math.floor(Math.random() * ids.length)];
    const detail = http.get(`${API_BASE}/shops/${randomId}`);
    check(detail, {
      "shop detail 200": (r) => r.status === 200,
    });
  }

  sleep(1);
}

export function handleSummary(data) {
  return {
    "reports/k6/summary.json": JSON.stringify(data, null, 2),
    "reports/k6/report.html": buildHtmlReport(data),
  };
}
