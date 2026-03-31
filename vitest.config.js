import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,

    // ✅ ให้ Vitest หาเทสของคุณ
    include: ["tests/unit/**/*.spec.{js,ts}"],

    // ✅ Coverage สำหรับ CI/SonarCloud
    coverage: {
      provider: "v8",

      // ✅ SonarCloud ใช้ lcov.info เป็นหลัก
      reporter: ["text", "lcov", "html"],

      // ✅ โฟลเดอร์ผลลัพธ์
      reportsDirectory: "coverage",

      // ✅ สำคัญ: นับไฟล์ src ทั้งหมด แม้ยังไม่โดน import ในเทส
      all: true,

      // ✅ ระบุให้ชัดว่า coverage ครอบอะไร
      include: ["src/**/*.{js,ts,vue}"],

      // ✅ ตัดของที่ไม่ควรถูกนับ
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/public/**",
        "**/coverage/**",
        "**/tests/**",
        "**/*.d.ts",
        "src/main.{js,ts}",
        "src/**/router/**",
        "src/**/i18n/**",
      ],

      // ✅ ช่วยให้ CI อ่านง่าย (optional)
      reportOnFailure: true,

      // ✅ Coverage thresholds — regression gates based on measured baseline (2026-03-26)
      // Calibrated to actual all:true averages; raise these as coverage improves
      thresholds: {
        "src/store/**": { statements: 25, functions: 24 },
        "src/utils/**": { statements: 14, functions: 13 },
        "src/services/**": { statements: 5, functions: 4 },
        "src/composables/**": { statements: 1, functions: 1 },
      },
    },
  },
});
