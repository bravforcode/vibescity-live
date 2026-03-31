<template>
  <div class="admin-view p-4 md:p-6 bg-gray-900 min-h-screen text-white">
    <div class="max-w-4xl mx-auto pt-12">
      <div class="text-center mb-12">
        <h1 class="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400 mb-4">
          Admin Control Center
        </h1>
        <p class="text-gray-400 text-lg">
          ระบบ Admin Dashboard เดิมถูกยกเลิกใช้งานแล้ว โปรดใช้ Google Sheets เป็นระบบหลักแทน
        </p>
      </div>

      <div class="grid gap-6">
        <!-- Google Sheets Card -->
        <div class="p-8 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-xl hover:border-violet-500/50 transition-all group">
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div class="space-y-4">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-2xl bg-violet-600/20 flex items-center justify-center">
                  <svg class="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 class="text-2xl font-bold text-white">Google Sheets Dashboard</h2>
              </div>
              <p class="text-gray-400 leading-relaxed max-w-xl">
                จัดการข้อมูลร้านค้า (Venues), ตรวจสอบสลิปการชำระเงิน (Slips), จัดการผู้ใช้งาน (Users) และดูสถิติ Analytics ทั้งหมดได้ที่นี่ ข้อมูลจะถูกซิงก์กับระบบหลักโดยอัตโนมัติทุก 30 นาที
              </p>
              <div class="flex flex-wrap gap-4 text-sm text-violet-300/70">
                <span class="flex items-center gap-1.5">
                  <div class="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"></div>
                  Auto-sync active (30m)
                </span>
                <span class="flex items-center gap-1.5">
                  <div class="w-1.5 h-1.5 rounded-full bg-violet-400"></div>
                  Bi-directional support
                </span>
              </div>
            </div>
            <a
              href="https://docs.google.com/spreadsheets/d/1X_yUe1mD-zK0Fz9k_G5m9G-p9z8mG-m9G-m9G-m9G"
              target="_blank"
              class="w-full md:w-auto px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-violet-600/20 active:scale-95 text-center flex items-center justify-center gap-2 group-hover:translate-x-1"
            >
              เปิด Google Sheets
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          </div>
        </div>

        <!-- Support Info -->
        <div class="mt-12 p-6 rounded-2xl border border-white/5 bg-white/2 text-center">
          <p class="text-sm text-gray-500">
            หากพบปัญหาการซิงก์ข้อมูลหรือต้องการความช่วยเหลือ โปรดติดต่อทีม Engineering ผ่าน Slack #vibecity-ops
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useHead } from "@unhead/vue";

useHead(() => ({
	title: "Admin Dashboard - VibeCity",
	meta: [{ name: "robots", content: "noindex,nofollow" }],
}));
</script>

<style scoped>
.admin-view {
  background-image: radial-gradient(circle at 50% 0%, rgba(139, 92, 246, 0.05) 0%, transparent 50%);
}
</style>
