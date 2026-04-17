# Master Specification & Roadmap: bl1nk-keyword-validator

เอกสารนี้คือ "เข็มทิศ" และ "ความทรงจำถาวร" ของโปรเจกต์ `bl1nk-keyword-validator` โดยรวบรวมรายละเอียดทางเทคนิค ยุทธศาสตร์การเติบโต และขั้นตอนการดำเนินงานทั้งหมด เพื่อให้มั่นใจว่าการพัฒนาจะเป็นไปในทิศทางเดียวกันอย่างต่อเนื่อง

**Architectural Note:** โปรเจกต์นี้ใช้โครงสร้างแบบ **Cargo Workspace** (แยก `core` และ `cli`) เพื่อเพิ่มประสิทธิภาพในการจัดการ Context สำหรับ AI Agent และเตรียมความพร้อมสำหรับการนำส่วน `core` ไปใช้ในรูปแบบ WebAssembly (WASM) ในอนาคต

---

## Phase 1: Data Integrity & Governance (The Solid Core)
*เป้าหมาย: สร้างรากฐานข้อมูลที่เชื่อถือได้ มีมาตรฐาน และตรวจสอบได้โดยอัตโนมัติ*

### 1.1 Broken Link Validation (`relatedIds`)
- **Objective:** ตรวจสอบความถูกต้องของการเชื่อมโยงข้อมูลภายใน (Internal Linking Consistency)
- **Implementation:**
    - รวบรวม `id` ทั้งหมดจากทุกกลุ่มมาเก็บไว้ใน `HashSet` (O(n))
    - วนลูปตรวจสอบฟิลด์ `relatedIds` ของทุก Entry (ถ้ามี)
    - ค่าใน `relatedIds` ต้องตรงกับ ID ที่มีอยู่จริงใน Registry เท่านั้น
    - แจ้ง Error Code: `BROKEN_RELATIONSHIP` พร้อมระบุ ID ต้นทางและปลายทางที่ผิดพลาด

### 1.2 Simple Fuzzy Search (Typo Tolerance)
- **Objective:** ค้นหาเจอแม้ผู้ใช้จะพิมพ์ผิด (Typo tolerance) เพื่อลด Friction ในการใช้งาน
- **Implementation:**
    - เพิ่ม Dependency: `fuzzy-matcher = "0.3"`
    - ปรับปรุง `src/search.rs` ให้ใช้ `SkimMatcherV2` เป็นระบบสำรองเมื่อไม่พบ Exact Match
    - ใน `SearchResult` ต้องมีฟิลด์ `score: i64` เพื่อบอกระดับความแม่นยำของผลลัพธ์

### 1.3 JSON Schema Export & Standards
- **Objective:** สร้างมาตรฐานการเขียน JSON เพื่อให้ Editor (เช่น VS Code) ช่วยเหลือผู้ใช้ได้
- **Implementation:**
    - เพิ่ม Dependency: `schemars = "0.8"`
    - ใช้ Attribute `#[derive(JsonSchema)]` บน Struct หลักใน `src/schema.rs`
    - เพิ่มคำสั่ง CLI: `keyword-registry schema-export` เพื่อ Generate ไฟล์ `keyword-registry.schema.json`
    - ระบุในเอกสารวิธีตั้งค่า `$schema` ในไฟล์ JSON ของผู้ใช้

### 1.4 Auto-Documentation & Schema Evolution (Pillar 1)
- **Objective:** ทำให้เอกสารทันสมัยอยู่เสมอและจัดการการเปลี่ยนแปลงโครงสร้างข้อมูลได้
- **Implementation:**
    - **Docs Generator:** คำสั่ง `docs-gen` เพื่อแปลง Registry เป็น Markdown (Mintlify/Docusaurus format)
    - **Versioning:** ระบบตรวจสอบ `version`ใน JSON; แจ้งเตือนหาก Schema ที่ใช้เก่ากว่าข้อมูล
    - **Git-Native Workflow:** Template สำหรับ GitHub Action เพื่อรัน `validate` ทุกครั้งที่เปิด Pull Request

### 1.5 Group Scoping & Technical Validation (Strategic Pillar 1)
- **Objective:** ป้องกันภาวะ "คีย์เวิร์ดกระจัดกระจาย" และสร้างระบบ Namespace ที่ยืดหยุ่นผ่านกลุ่ม (Groups)
- **Implementation:**
    - **Regex Pattern Validation:** อ่าน `pattern` จาก Schema ของแต่ละกลุ่มมาตรวจสอบจริง (เช่น ID ของกลุ่มนั้น ๆ ต้องเป็นไปตามที่กำหนด) โดยเลิกใช้ค่า Default แบบ Hardcoded
    - **Enum (Values) Validation:** ตรวจสอบค่าในฟิลด์ประเภท Enum (เช่น status, type) ให้ตรงกับค่าที่อนุญาตใน Schema เท่านั้น
    - **Group-Scoped Search Integration:** เตรียมโครงสร้างให้ระบบ Search สามารถเลือกค้นหาเฉพาะกลุ่ม หรือจัดลำดับความสำคัญตามความเกี่ยวข้องของกลุ่มได้
    - **Isolation Logic:** ป้องกันการใช้ ID ซ้ำซ้อนในกลุ่มที่มีวัตถุประสงค์ (Scope) ทับซ้อนกันเพื่อความเป็นระเบียบของ Knowledge Base

---

## Phase 2: Intelligence & Connectivity (The Connected Hub)
*เป้าหมาย: ยกระดับความฉลาดในการค้นหาและการเชื่อมต่อกับ AI Ecosystem (โดยเฉพาะ MCP)*

### 2.1 Thai Tone-Mark Insensitive Search
- **Objective:** ค้นหาภาษาไทยได้ลื่นไหลโดยไม่ต้องกังวลเรื่องการพิมพ์วรรณยุกต์
- **Implementation:**
    - พัฒนาฟังก์ชัน `normalize_thai(q: &str) -> String` ใน `src/search.rs`
    - ใช้ Regex `[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]` เพื่อถอดสระ (บน-ล่าง) และวรรณยุกต์ออกชั่วคราวขณะเปรียบเทียบ (Search-time only)

### 2.2 Inverted Indexing (Performance Scaling)
- **Objective:** รองรับการค้นหาข้อมูลระดับหลักพันถึงหลักหมื่นรายการด้วยความเร็วสูงสุด
- **Implementation:**
    - สร้างโครงสร้าง `KeywordIndex` (In-memory) ระหว่างขั้นตอนโหลด Registry
    - ใช้ `HashMap<String, Vec<String>>` (Mapping: Token -> EntryIDs)
    - ใช้เทคนิค Tokenization (ตัดคำ) ทั้งภาษาอังกฤษและไทย (Simple Tokenizer)

### 2.3 Model Context Protocol (MCP) Server Integration (Pillar 2)
- **Objective:** ทำให้ AI (Gemini/Claude) คุยกับ Registry นี้ได้โดยตรงในฐานะ "ผู้เชี่ยวชาญความรู้"
- **Implementation:**
    - พัฒนา Interface ตามมาตรฐาน MCP (JSON-RPC over Stdio)
    - อนุญาตให้ Agent เรียกใช้เครื่องมือ (Tools) เช่น `search_keywords` หรือ `get_project_details` ผ่าน Registry นี้ได้ทันที

### 2.4 Federated Registry & Standard API Output (Pillar 2)
- **Objective:** รองรับการแชร์ข้อมูลข้ามทีมและส่งต่อข้อมูลให้ระบบ Infrastructure อื่น ๆ
- **Implementation:**
    - **Remote Sync:** ดาวน์โหลดและ Merge ไฟล์ Registry จาก URL ภายนอก พร้อมระบบ Local Caching
    - **API Output:** เพิ่มคำสั่ง `export --format [otel|k8s]` เพื่อแปลง Keyword เป็น Tags สำหรับ OpenTelemetry หรือ Labels สำหรับ Kubernetes

---

## Phase 3: Experience & Knowledge Graph (The Knowledge OS)
*เป้าหมาย: การวิเคราะห์ความสัมพันธ์เชิงลึกและประสบการณ์การใช้งานที่ไร้รอยต่อ*

### 3.1 Interactive TUI (Terminal User Interface)
- **Objective:** หน้าจอค้นหาแบบ Real-time ใน Terminal (ความรู้สึกเหมือน `fzf`)
- **Implementation:**
    - เพิ่ม Dependency: `ratatui = "0.26"`, `crossterm = "0.27"`
    - สร้างหน้าจอ 3 ส่วน: 1. Input Box (Search), 2. Result List, 3. Preview Pane (Details)
    - รองรับ Key Binding สำหรับการ Copy ID หรือเปิด URL ของ Repository

### 3.2 Admin Dashboard (WASM-based Low-code)
- **Objective:** ให้ผู้ใช้ที่ไม่ใช่โปรแกรมเมอร์แก้ไขข้อมูลผ่านหน้าเว็บได้ง่ายและปลอดภัย
- **Implementation:**
    - คอมไพล์ Search & Validation Logic เป็น WebAssembly (WASM)
    - สร้าง JS Wrapper เพื่อให้ Frontend (Next.js/React) เรียกใช้ Logic เดียวกับ CLI ได้ 100%
    - ระบบ Form-based Editing ที่ Validate ข้อมูลทันทีขณะพิมพ์

### 3.3 Relationship Mapping & Visualization (Pillar 3)
- **Objective:** เห็นภาพรวมความเชื่อมโยงของความรู้ทั้งหมด (Knowledge Graph)
- **Implementation:**
    - คำสั่ง `graph-gen` เพื่อ Generate ความสัมพันธ์ระหว่าง Project, Skill และ Keyword
    - รองรับ Format: `Mermaid` (สำหรับ Markdown) และ `DOT` (สำหรับ Graphviz)
    - วิเคราะห์ความหนาแน่นของความสัมพันธ์ (Dependency Analysis)

### 3.4 Intelligence Layer (NLQ & Tag Inference) (Pillar 3)
- **Objective:** ค้นหาด้วยภาษาธรรมชาติและช่วยจัดกลุ่มข้อมูลอัตโนมัติ
- **Implementation:**
    - **Tag Inference:** ระบบแนะนำ Tags จากการวิเคราะห์คำที่พบบ่อยใน Description
    - **Natural Language Query (NLQ):** รองรับ Query พื้นฐานอย่าง "Show me all active libraries using typescript" (ใช้ Simple Parser หรือ Local NLP)
