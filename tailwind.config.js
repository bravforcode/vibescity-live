/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
    // ถ้ามีไฟล์ template/อื่น ๆ เพิ่มเติมค่อยเปิด
    // "./src/**/*.{html,md}",
  ],
  theme: {
    extend: {
      colors: {
        dark: "#0b0d11",
        // อย่า override "white" ของ tailwind (เสี่ยงทำให้บาง lib/utility เพี้ยน)
        // ถ้าต้องการ white แบบ custom ให้ตั้งชื่อใหม่
        softWhite: "#f8f8f8ff",
      },
    },
  },
  plugins: [],
};