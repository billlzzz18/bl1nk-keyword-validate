# การวางแผนพัฒนา (Plan) - bl1nk-keyword-validator

เอกสารนี้ระบุแผนการทำงานที่อ้างอิงจาก `SPEC.md` เพื่อพัฒนาต่อยอดให้สมบูรณ์

## Phase 2: Intelligence & Connectivity (การพัฒนาต่อยอดความฉลาด)
1. **Thai Tone-Mark Insensitive Search**:
   - พัฒนาฟังก์ชัน `normalize_thai` ใน `core/src/search.rs`
   - ใช้ Regex ลบสระบน/ล่างและวรรณยุกต์ เพื่อให้การค้นหาครอบคลุมยิ่งขึ้น

2. **Inverted Indexing**:
   - ปรับปรุงการ index เพื่อสนับสนุนการค้นหาที่เร็วขึ้น (เตรียมโครงสร้าง `KeywordIndex` ในหน่วยความจำ)

## Phase 3: Experience & Knowledge Graph (ประสบการณ์การใช้งาน)
1. **Admin Dashboard (Web UI)**:
   - สร้างส่วนแสดงผล (Dashboard) ด้วย **Next.js** และ **Tailwind CSS** (Mobile-first design)
   - ใช้โครงสร้างแอปพลิเคชันเดิมที่อยู่ที่ Root `/` มาเชื่อมต่อหน้า Web UI สำหรับจัดการ Keywords ต่างๆ

## แผนการดำเนินงาน (Steps)
- **Step 1**: ปรับแก้ `normalize_query` ใน `search.rs` ให้รองรับภาษาไทย และเพิ่มการเทส
- **Step 2**: อัปเดต `todo.md` เพื่อบันทึกความคืบหน้า
- **Step 3**: พัฒนาหน้า Admin Dashboard บน Next.js ของโปรเจกต์ Root
