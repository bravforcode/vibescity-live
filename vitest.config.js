import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
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
        "**/tests/**", // ไม่เอา tests ไปนับ coverage
        "**/*.d.ts",
        "src/main.{js,ts}", // (ถ้าไม่อยากนับ entry)
        "src/**/router/**", // (ถ้ามี)
        "src/**/i18n/**",   // (ถ้ามี)
      ],

      // ✅ ช่วยให้ CI อ่านง่าย (optional)
      reportOnFailure: true,
    },
  },
});
