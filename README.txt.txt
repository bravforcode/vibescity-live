VibesCity.live - Real-time Web Map
Web Map Application สำหรับแสดงข้อมูลร้านค้าและบรรยากาศในกรุงเทพฯ แบบ Real-time เชื่อมต่อข้อมูลผ่าน Google Sheets

🛠 Tech Stack
Framework: Vue 3 (Composition API)
Build Tool: Vite
Styling: Tailwind CSS
Map Library: Leaflet.js / Vue-Leaflet
Data Source: Google Sheets (CSV Pub)

⚙️ Configuration
การเชื่อมต่อ Google Sheets
ข้อมูลทั้งหมดถูกดึงมาจาก Google Sheets
หากต้องการเปลี่ยน Sheet ให้เข้าไปแก้ URL ในไฟล์: src/App.vue
const SHEET_CSV_URL = "วาง_URL_CSV_ใหม่ที่นี่";
Note: Google Sheet ต้องเปิด Share เป็น Public และเลือก Publish to Web เป็น format CSV

📁 Project Structure
src/
├── components/     # Vue Components แยกตามส่วนงาน (Map, Modal, Sidebar)
├── composables/    # Logic & State Management (useLocation, useShopFilters)
├── services/       # API Service เชื่อมต่อ Google Sheets
├── utils/          # Business Logic (คำนวณเวลา, Golden Time, Status)
public/  	# เก็บไฟล์รูปภาพ
