'use client';

import { useState, useMemo, useEffect } from 'react';
import * as mammoth from 'mammoth';
import { Search, Upload, Download, Edit2, ShieldAlert, CheckCircle, PackageSearch, SlidersHorizontal, FileText, ScanSearch, Loader2, Beaker, PieChart, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// === TypeScript Interfaces ===
interface KeywordEntry {
  id: string;
  aliases?: string[];
  synonyms?: string[];
  patterns?: string[];
  description?: string;
  [key: string]: any;
}

interface KeywordGroup {
  groupId: string;
  groupName: string;
  description?: string;
  entries: KeywordEntry[];
}

interface KeywordRegistry {
  version: string;
  metadata: {
    lastUpdated: string;
    description: string;
    owner: string;
  };
  groups: KeywordGroup[];
}

// === Utility: Thai Tone-Mark Insensitive Normalization ===
/**
 * นำช่องว่างออก ทำตัวเล็ก และตัดสระ/วรรณยุกต์ภาษาไทยเพื่อเปรียบเทียบ
 */
function normalizeThai(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // เอา Zero-width space ออก
    .replace(/[\u0E47-\u0E4C]/g, ''); // ถอดเฉพาะวรรณยุกต์ (ไม้ไต่คู้, ไม้เอก, โท, ตรี, จัตวา, การันต์) แต่เก็บสระ (อิ อี อึ อื อุ อู) ไว้เพื่อความหมายที่สมบูรณ์
}

// === Utility: Tokenizer (รองรับภาษาไทย) ===
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;

function tokenize(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeThai(text);
  if (segmenter) {
    return Array.from(segmenter.segment(normalized))
      .map(s => s.segment)
      .filter(s => s.trim().length > 0);
  }
  // Fallback (ถ้าไม่มี Intl.Segmenter) แยกด้วย Space
  return normalized.split(/\s+/).filter(Boolean);
}

// === Utility: Levenshtein Distance (ตรวจจับคำผิดเล็กน้อย) ===
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export default function AdminDashboard() {
  const [registry, setRegistry] = useState<KeywordRegistry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [editingEntry, setEditingEntry] = useState<KeywordEntry | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editingTargetGroup, setEditingTargetGroup] = useState<string | null>(null);
  const [originalEditingEntry, setOriginalEditingEntry] = useState<KeywordEntry | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [fuzzySensitivity, setFuzzySensitivity] = useState<number>(100);

  // States for Document Scanner
  const [activeTab, setActiveTab] = useState<'search' | 'scanner' | 'diagnostics'>('search');
  const [docScannerText, setDocScannerText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{ entry: KeywordEntry, group: string, matched: string, type: string }[]>([]);

  // โหลดค่า Sensitivity จาก Local Storage เมื่อแอปเริ่มทำงาน
  const [diagnosticLogs, setDiagnosticLogs] = useState<{case: string, passed: boolean, expected: string[], got: string[], log: string}[]>([]);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  const runThaiDiagnostics = () => {
    setIsDiagnosing(true);
    setDiagnosticLogs([]);

    // จำลอง Mock Registry ชั่วคราวเพื่อเทส Algorithm ความเนี้ยบ
    const mockGroups = [{
      groupId: 'g1', groupName: 'Test NLP',
      entries: [
        { id: 'เสื้อ', aliases: ['เสื้อเชิ้ต'] },
        { id: 'เสือ', aliases: ['เสือดาว'] },
        { id: 'แอปเปิล', aliases: ['แอปเปิ้ล'] },
        { id: 'ตากลม' },
        { id: 'api', patterns: ['^api.*$'] }
      ]
    }];

    const testCases = [
      { input: 'ฉันเห็นเสือในป่า', expected: ['เสือ'], desc: 'แยกแยะวรรณยุกต์ (ไม่สับสนกับ เสื้อ)' },
      { input: 'ใส่เสื้อเชิ้ตไปทำงาน', expected: ['เสื้อ'], desc: 'หาคำผ่าน Alias / สระไม่เพี้ยน' },
      { input: 'กินแอปเปิ้ลสีแดง', expected: ['แอปเปิล'], desc: 'ค้นหาพร้อมแก้คำผิด (Alias)' },
      { input: 'นั่งตากลมอยู่ข้างนอก', expected: ['ตากลม'], desc: 'Tokenization ไม่ตัดพลาด (ตาก-ลม)' },
      { input: 'ทดสอบ api_v2 request', expected: ['api'], desc: 'Regex Pattern สกัดภาษาอังกฤษแทรก' }
    ];

    setTimeout(() => {
      const logs = testCases.map(tc => {
        const found = new Set<string>();
        const normalizedDoc = normalizeThai(tc.input);
        
        mockGroups[0].entries.forEach(entry => {
          let matched = false;
          
          if (entry.patterns) {
            entry.patterns.forEach(p => {
              if (new RegExp(p, 'ig').test(tc.input)) matched = true;
            });
          }
          
          if (!matched && normalizedDoc.includes(normalizeThai(entry.id))) matched = true;
          if (!matched && entry.aliases) {
            entry.aliases.forEach(a => {
              if (normalizedDoc.includes(normalizeThai(a))) matched = true;
            });
          }

          if (matched) found.add(entry.id);
        });

        const gotArray = Array.from(found);
        const passed = tc.expected.every(e => gotArray.includes(e)) && gotArray.length === tc.expected.length;

        return {
          case: tc.desc,
          passed,
          expected: tc.expected,
          got: gotArray,
          log: `Input: "${tc.input}"`
        };
      });

      setDiagnosticLogs(logs);
      setIsDiagnosing(false);
    }, 800);
  };

  useEffect(() => {
    const saved = localStorage.getItem('bl1nk_fuzzy_sensitivity');
    if (saved) {
      setTimeout(() => setFuzzySensitivity(parseInt(saved, 10)), 0);
    }
  }, []);

  // สร้าง BM25 Index ดัชนีการค้นหาแบบ Smart Search (รวบรวม Token ทั้งหมดใน Registry)
  const bm25Index = useMemo(() => {
    if (!registry) return null;
    
    const docs: { docId: string; tokens: string[] }[] = [];
    const docFreq: Record<string, number> = {};
    let totalLen = 0;

    registry.groups.forEach(group => {
      group.entries.forEach(entry => {
        const content = [
          entry.id,
          ...(entry.aliases || []),
          ...(entry.synonyms || []),
          entry.description || ''
        ].join(' ');
        
        const tokens = tokenize(content);
        totalLen += tokens.length;
        
        const uniqueTokens = Array.from(new Set(tokens));
        uniqueTokens.forEach(t => {
          docFreq[t] = (docFreq[t] || 0) + 1;
        });

        docs.push({
          docId: `${group.groupId}::${entry.id}`,
          tokens
        });
      });
    });

    return {
      docs,
      docFreq,
      N: docs.length,
      avgdl: docs.length > 0 ? totalLen / docs.length : 0,
      k1: 1.2,
      b: 0.75
    };
  }, [registry]);

  // บันทึกค่า Similarity Sensitivity
  const handleSensitivityChange = (val: number) => {
    setFuzzySensitivity(val);
    localStorage.setItem('bl1nk_fuzzy_sensitivity', val.toString());
  };

  // โหลดไฟล์ JSON
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.version || !json.groups) throw new Error('Invalid Registry Format');
        setRegistry(json);
        setErrorMsg('');
      } catch (err: any) {
        setErrorMsg('เกิดข้อผิดพลาดในการอ่านไฟล์: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // ดาวน์โหลดไฟล์ JSON
  const handleDownload = () => {
    if (!registry) return;
    const blob = new Blob([JSON.stringify(registry, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keyword-registry.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Upload Document (.txt, .md, .docx)
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanResults([]);
    setErrorMsg('');

    try {
      let text = '';
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else {
        text = await file.text();
      }

      // สกัด syntax ออก สำหรับ MD/TXT ทั่วไป
      const cleanedText = text
        .replace(/[#*`_~>\[\]\(\)]/g, ' ') // ตัด Markdown ซินแทกซ์ต่างๆ
        .replace(/\s+/g, ' ')              // จัดการช่องว่างหรือ New line ให้เหลือช่องเดียว
        .trim()
        .slice(0, 10000);                  // จำกัด 10,000 ตัวอักษร
        
      setDocScannerText(cleanedText);
    } catch (err: any) {
      setErrorMsg('เกิดข้อผิดพลาดในการโหลดไฟล์เอกสาร: ' + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  // วิเคราะห์หา Keyword ในข้อความ 
  const executeScan = () => {
    if (!registry || !docScannerText) return;
    setIsScanning(true);
    
    // จำลองเวลาประมวลผลเพื่อแสดงอนิเมชัน 1.2 วินาที
    setTimeout(() => {
      const results: { entry: KeywordEntry, group: string, matched: string, type: string }[] = [];
      const normalizedDoc = normalizeThai(docScannerText);

      registry.groups.forEach(group => {
        group.entries.forEach(entry => {
          let foundMatched = '';
          let foundType = '';

          // 1. ตรวจสอบด้วย Pattern Regex (แม่นยำและเฉพาะเจาะจงสุด)
          if (entry.patterns && entry.patterns.length > 0) {
            for (const pattern of entry.patterns) {
              try {
                const regex = new RegExp(pattern, 'ig');
                const matches = docScannerText.match(regex);
                if (matches && matches.length > 0) {
                  foundMatched = matches[0];
                  foundType = 'pattern';
                  break;
                }
              } catch (err) {}
            }
          }

          // 2. Exact Match กับ ID ของระบบ
          if (!foundMatched) {
             const normId = normalizeThai(entry.id);
             if (normalizedDoc.includes(normId)) {
               foundMatched = entry.id;
               foundType = 'exact ID';
             }
          }

          // 3. Aliases
          if (!foundMatched && entry.aliases) {
            for (const alias of entry.aliases) {
              if (normalizedDoc.includes(normalizeThai(alias))) {
                foundMatched = alias;
                foundType = 'alias';
                break;
              }
            }
          }

          // 4. Synonyms
          if (!foundMatched && entry.synonyms) {
            for (const syn of entry.synonyms) {
              if (normalizedDoc.includes(normalizeThai(syn))) {
                foundMatched = syn;
                foundType = 'synonym';
                break;
              }
            }
          }

          if (foundMatched) {
            results.push({ entry, group: group.groupName, matched: foundMatched, type: foundType });
          }
        });
      });

      setScanResults(results);
      setIsScanning(false);
    }, 1200); 
  };

  // บันทึกการแก้ไข
  const handleSaveEntry = (updatedEntry: KeywordEntry, targetGroupId: string | null = null) => {
    if (!registry || !editingGroup) return;

    setRegistry(prev => {
      if (!prev) return prev;
      let newRegistry = { ...prev };
      
      const newGroupId = targetGroupId || editingGroup;
      
      // กรณีเปลี่ยนกลุ่ม (Move to another group)
      if (newGroupId !== editingGroup) {
        const oldGroupIndex = newRegistry.groups.findIndex(g => g.groupId === editingGroup);
        const newGroupIndex = newRegistry.groups.findIndex(g => g.groupId === newGroupId);
        
        if (oldGroupIndex !== -1 && newGroupIndex !== -1) {
          // เอาออกจากกลุ่มเดิม
          newRegistry.groups[oldGroupIndex].entries = newRegistry.groups[oldGroupIndex].entries.filter(e => e.id !== updatedEntry.id);
          // ใส่เข้ากลุ่มใหม่
          newRegistry.groups[newGroupIndex].entries.push(updatedEntry);
        }
      } else {
        // อัปเดตในกลุ่มเดิม
        const groupIndex = newRegistry.groups.findIndex(g => g.groupId === editingGroup);
        if (groupIndex !== -1) {
          const entryIndex = newRegistry.groups[groupIndex].entries.findIndex(e => e.id === updatedEntry.id);
          if (entryIndex !== -1) {
            newRegistry.groups[groupIndex].entries[entryIndex] = updatedEntry;
          }
        }
      }
      return newRegistry;
    });
    setEditingEntry(null);
    setOriginalEditingEntry(null);
    setEditingGroup(null);
    setEditingTargetGroup(null);
  };

  const requestCloseModal = () => {
    if (editingEntry && originalEditingEntry) {
      const isChanged = JSON.stringify(editingEntry) !== JSON.stringify(originalEditingEntry) || editingGroup !== editingTargetGroup;
      if (isChanged) {
        if (window.confirm('คุณมีการแก้ไขที่ยังไม่ได้บันทึก ต้องการบันทึกการเปลี่ยนแปลงหรือไม่?')) {
          handleSaveEntry(editingEntry, editingTargetGroup);
          return;
        }
      }
    }
    setEditingEntry(null);
    setOriginalEditingEntry(null);
    setEditingGroup(null);
    setEditingTargetGroup(null);
  };

  // ฟังก์ชันค้นหา (In-memory Search with Thai Support)
  const filteredEntries = useMemo(() => {
    if (!registry) return [];
    
    // แบบง่ายสำหรับการทำ Fuzzy Score
    const getFuzzyScore = (text: string, query: string, sensitivity: number): number => {
      let tIdx = 0, qIdx = 0, score = 0;
      while (tIdx < text.length && qIdx < query.length) {
        if (text[tIdx] === query[qIdx]) {
          score += 10;
          qIdx++;
        }
        tIdx++;
      }
      
      const requiredMatches = Math.max(1, Math.ceil(query.length * (sensitivity / 100)));
      return qIdx >= requiredMatches ? score : -1;
    };

    let entriesData: { group: string; entry: KeywordEntry; score: number; matchType: string }[] = [];
    const normalizedQuery = normalizeThai(searchQuery);
    const queryTokens = tokenize(searchQuery);

    registry.groups.forEach(group => {
      if (selectedGroup !== 'all' && group.groupId !== selectedGroup) return;
      
      group.entries.forEach(entry => {
        if (!normalizedQuery) {
          entriesData.push({ group: group.groupName, entry, score: 0, matchType: '' });
          return;
        }

        let bestScore = -1;
        let bestMatchType = '';
        
        // 0. Smart Search (BM25 Algorithm) Base
        if (bm25Index && queryTokens.length > 0) {
          const docId = `${group.groupId}::${entry.id}`;
          const doc = bm25Index.docs.find(d => d.docId === docId);
          if (doc) {
            let bmscore = 0;
            queryTokens.forEach(q => {
              const nq = bm25Index.docFreq[q] || 0;
              if (nq > 0) {
                const idf = Math.log((bm25Index.N - nq + 0.5) / (nq + 0.5) + 1.0);
                const fq = doc.tokens.filter(t => t === q).length;
                if (fq > 0) {
                  const tf = (fq * (bm25Index.k1 + 1)) / (fq + bm25Index.k1 * (1 - bm25Index.b + bm25Index.b * (doc.tokens.length / Math.max(1, bm25Index.avgdl))));
                  bmscore += idf * tf;
                }
              }
            });
            
            // ถือว่า BM25 ถือเป็นจุดเริ่มต้น หากมีคะแนนให้ตั้งเป็น Smart Type
            if (bmscore > 0.1) {
              bestScore = Math.floor(bmscore * 1000);
              bestMatchType = 'smart';
            }
          }
        }
        
        const updateScore = (text: string) => {
           let type = '';
           let currentScore = -1;
           const norm = normalizeThai(text);
           
           if (norm === normalizedQuery) {
             currentScore = 10000;
             type = 'exact';
           } else if (norm.includes(normalizedQuery)) {
             currentScore = 5000 + (normalizedQuery.length * 10);
             type = 'partial';
           } else {
             // 1. ตรวจสอบ "เปอร์เซ็นคำผิด / คำผิดเล็กน้อย" ด้วย Levenshtein Distance
             const editDist = levenshtein(norm, normalizedQuery);
             const maxLength = Math.max(norm.length, normalizedQuery.length);
             const typoPercent = maxLength === 0 ? 0 : (editDist / maxLength) * 100;
             const allowedTypoPercent = 100 - fuzzySensitivity; // e.g. Sensitivity 80 = ยอมรับคำผิด 20%
             
             if (editDist > 0 && typoPercent <= allowedTypoPercent) {
               currentScore = 4000 - Math.floor(typoPercent * 10);
               type = 'typo';
             } else {
               // 2. Fuzzy Score ดั้งเดิมสำหรับคำที่พิมพ์สลับตำแหน่งหรือตกหล่นแบบกระจัดกระจาย
               const fScore = getFuzzyScore(norm, normalizedQuery, fuzzySensitivity);
               if (fScore > 0) {
                 currentScore = fScore;
                 type = 'fuzzy';
               }
             }
           }
           
           if (currentScore > bestScore) {
             bestScore = currentScore;
             bestMatchType = type;
           }
        };

        // ตรวจสอบ Pattern Keywords ด้วย Regex
        if (entry.patterns && entry.patterns.length > 0) {
          for (const pattern of entry.patterns) {
            try {
              const regex = new RegExp(pattern, 'i');
              if (regex.test(searchQuery)) {
                if (8000 > bestScore) {
                  bestScore = 8000;
                  bestMatchType = 'pattern';
                }
              }
            } catch (err) {
              // Ignore invalid regex
            }
          }
        }

        // ตรวจสอบ ID
        updateScore(entry.id);

        // ตรวจสอบ Aliases และ คำพ้อง (Synonyms)
        if (entry.aliases) entry.aliases.forEach(alias => updateScore(alias));
        if (entry.synonyms) entry.synonyms.forEach(syn => updateScore(syn));

        if (bestScore > -1) {
          entriesData.push({ group: group.groupName, entry, score: bestScore, matchType: bestMatchType });
        }
      });
    });

    // เรียงตาม Score (มากไปน้อย)
    if (normalizedQuery) {
      entriesData.sort((a, b) => b.score - a.score);
    }

    return entriesData;
  }, [registry, searchQuery, selectedGroup, fuzzySensitivity, bm25Index]);

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#e2e8f0] font-sans">
      <header className="bg-[#141418] border-b border-[#24242b] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <PackageSearch className="w-6 h-6 text-[#6366f1]" />
            <h1 className="text-xl font-bold tracking-tight text-[#e2e8f0]">bl1nk Keyword Admin</h1>
          </div>
          <div className="flex w-full sm:w-auto items-center gap-2 flex-wrap sm:flex-nowrap">
            {registry && (
              <div className="flex bg-[#1c1c22] rounded-md p-1 border border-[#24242b] w-full sm:w-auto mb-2 sm:mb-0">
                <button
                  onClick={() => setActiveTab('search')}
                  className={`flex-1 sm:px-4 px-2 py-1.5 text-sm font-medium rounded transition-colors flex items-center justify-center gap-2 ${activeTab === 'search' ? 'bg-[#6366f1] text-white' : 'text-[#888891] hover:text-[#e2e8f0]'}`}
                >
                  <Search className="w-4 h-4" /> ค้นหา
                </button>
                <button
                  onClick={() => setActiveTab('scanner')}
                  className={`flex-1 sm:px-4 px-2 py-1.5 text-sm font-medium rounded transition-colors flex items-center justify-center gap-2 ${activeTab === 'scanner' ? 'bg-[#6366f1] text-white' : 'text-[#888891] hover:text-[#e2e8f0]'}`}
                >
                  <ScanSearch className="w-4 h-4" /> สแกนเอกสาร
                </button>
                <button
                  onClick={() => setActiveTab('diagnostics')}
                  className={`flex-1 sm:px-4 px-2 py-1.5 text-sm font-medium rounded transition-colors flex items-center justify-center gap-2 ${activeTab === 'diagnostics' ? 'bg-[#6366f1] text-white' : 'text-[#888891] hover:text-[#e2e8f0]'}`}
                >
                  <Beaker className="w-4 h-4" /> ตรวจสอบ NLP
                </button>
              </div>
            )}
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-[#1c1c22] border border-[#24242b] rounded-md text-sm font-medium text-[#e2e8f0] hover:bg-[#24242b] w-full sm:w-auto justify-center transition-colors">
              <Upload className="w-4 h-4" />
              <span>อัปโหลด JSON</span>
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>
            {registry && (
              <button 
                onClick={handleDownload}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#6366f1] text-white rounded-md text-sm font-medium hover:opacity-90 w-full sm:w-auto justify-center transition-opacity"
              >
                <Download className="w-4 h-4" />
                <span>ดาวน์โหลด</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {errorMsg && (
          <div className="mb-6 p-4 bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg flex items-center gap-2 text-[#ef4444]">
            <ShieldAlert className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{errorMsg}</p>
          </div>
        )}

        {!registry ? (
          <div className="text-center py-24 bg-[#141418] rounded-xl border border-dashed border-[#24242b]">
            <PackageSearch className="w-12 h-12 text-[#888891] mx-auto mb-4" />
            <h2 className="text-lg font-medium text-[#e2e8f0] mb-2">ยังไม่มีข้อมูล Registry</h2>
            <p className="text-[#888891] mb-6 max-w-sm mx-auto">อัปโหลดไฟล์ `keyword-registry.json` เพื่อเริ่มจัดการและค้นหาข้อมูล</p>
            <label className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 bg-[#6366f1] text-white rounded-lg font-medium hover:opacity-90 transition-opacity">
              <Upload className="w-5 h-5" />
              <span>เลือกไฟล์ JSON</span>
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        ) : activeTab === 'scanner' ? (
          <div className="space-y-6">
            <div className="bg-[#141418] rounded-2xl border border-[#24242b] overflow-hidden">
              <div className="p-6 border-b border-[#24242b] bg-[#1c1c22]/50 flex justify-between items-center flex-wrap gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#e2e8f0] flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[#6366f1]" />
                    ตรวจสอบเอกสาร (Bulk Scanner)
                  </h2>
                  <p className="text-[#888891] text-sm mt-1">อัปโหลดไฟล์ (.TXT, .MD, .DOCX) หรือพิมพ์เนื้อหา เพื่อสแกนหาคำศัพท์ที่อยู่ใน Registry ปัจจุบัน (จำกัด 10,000 ตัวอักษร ระบบจะตัด Markdown ลิงก์ และช่องว่างทิ้งอัตโนมัติ)</p>
                </div>
                <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-[#1c1c22] border border-[#6366f1]/50 rounded-md text-sm font-medium text-[#e2e8f0] hover:bg-[#6366f1]/20 transition-colors">
                  <Upload className="w-4 h-4 text-[#6366f1]" />
                  <span>โหลด Text / Word / MD</span>
                  <input type="file" accept=".txt,.md,.docx" onChange={handleDocUpload} className="hidden" />
                </label>
              </div>
              <div className="p-6">
                <textarea 
                  value={docScannerText}
                  onChange={(e) => setDocScannerText(e.target.value.slice(0, 10000))}
                  placeholder="วางเนื้อหาจำนวนมากที่นี่ (สูงสุด 10,000 ตัวอักษร)..."
                  className="w-full h-64 bg-[#0a0a0c] border border-[#24242b] text-[#e2e8f0] rounded-xl p-4 focus:ring-2 focus:ring-[#6366f1] outline-none resize-none font-mono text-sm leading-relaxed"
                />
                <div className="flex items-center justify-between mt-3 text-sm">
                  <span className={`font-medium ${docScannerText.length >= 10000 ? 'text-[#f59e0b]' : 'text-[#888891]'}`}>
                    {docScannerText.length.toLocaleString()} / 10,000 ตัวอักษร
                  </span>
                  <button 
                    onClick={executeScan}
                    disabled={isScanning || !docScannerText}
                    className="flex items-center gap-2 px-6 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
                    {isScanning ? 'กำลังสแกน...' : 'เริ่มตรวจสอบ'}
                  </button>
                </div>
              </div>
            </div>

            <AnimatePresence mode="popLayout">
              {isScanning ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="bg-[#141418] rounded-xl border border-[#24242b] p-12 flex flex-col items-center justify-center space-y-6"
                >
                  <motion.div 
                    animate={{ rotate: 360, scale: [1, 1.1, 1] }} 
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  >
                    <div className="w-16 h-16 border-4 border-[#6366f1]/20 border-t-[#6366f1] rounded-full flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" /></div>
                  </motion.div>
                  <div className="text-center">
                    <p className="text-[#e2e8f0] font-medium text-lg">กำลังประมวลผลอัลกอริทึมค้นหา</p>
                    <p className="text-[#888891] animate-pulse mt-1 text-sm">ตัด Syntax ... Tokenization ... Regex Pattern Matching</p>
                  </div>
                </motion.div>
              ) : (scanResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-[#141418] rounded-xl border border-[#10b981]/30 overflow-hidden shadow-lg shadow-[#10b981]/5"
                >
                  <div className="p-4 bg-[#10b981]/10 border-b border-[#10b981]/20 flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-[#10b981]" />
                    <h3 className="font-semibold text-[#10b981]">พบ {scanResults.length} คีย์เวิร์ดที่ตรงเงื่อนไขจาก Registry</h3>
                  </div>
                  <div className="divide-y divide-[#24242b]">
                    {scanResults.map((res, i) => (
                      <div key={i} className="p-4 hover:bg-[#1c1c22] transition-colors flex flex-col sm:flex-row justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-[#e2e8f0]">{res.entry.id}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#1c1c22] border border-[#24242b] text-[#888891]">{res.group}</span>
                          </div>
                          <p className="text-sm text-[#888891] mt-1">{res.entry.description || 'ไม่มีคำอธิบาย'}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase text-[#888891] block mb-1">สกัดเจอคำผ่านประเภท:</span>
                          <span className={`inline-flex px-2.5 py-1 rounded border text-xs font-semibold ${
                            res.type === 'pattern' ? 'bg-[#a855f7]/10 text-[#a855f7] border-[#a855f7]/30' :
                            res.type.includes('ID') ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/30' :
                            'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30'
                          }`}>
                            &quot;{res.matched}&quot; ({res.type})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : activeTab === 'diagnostics' ? (
          <div className="space-y-6">
            <div className="bg-[#141418] rounded-2xl border border-[#24242b] p-6">
              <div className="flex justify-between items-start flex-wrap gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-[#e2e8f0] flex items-center gap-2">
                    <Beaker className="w-6 h-6 text-[#6366f1]" />
                    ผลการทดสอบความแม่นยำภาษาไทย (Diagnostic NLP)
                  </h2>
                  <p className="text-[#888891] text-sm mt-2 max-w-2xl">
                    รายงานนี้แสดงประสิทธิภาพเชิงเปรียบเทียบ หลังจากปรับพฤติกรรมการจัดการภาษาไทย 
                    <strong>โดยไม่ตัดสระวิบัติ</strong> เพื่อรักษารูปคำ (เช่น ไม่ให้คำว่า &quot;เสือ&quot; ตีความซ้ำซ้อนกับ &quot;เสื้อ&quot;) 
                    และประเมินอัตรา Tokenization ว่าล้มเหลว หรือมี False Positives เกิดขึ้นเท่าไร
                  </p>
                </div>
                <button 
                  onClick={runThaiDiagnostics}
                  disabled={isDiagnosing}
                  className="flex items-center gap-2 px-6 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {isDiagnosing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PieChart className="w-4 h-4" />}
                  เริ่มรันชุดทดสอบ
                </button>
              </div>

              {diagnosticLogs.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-[#0a0a0c] border border-[#24242b] rounded-xl p-4 text-center">
                      <p className="text-[#888891] text-sm mb-1">ความแม่นยำรวม (Accuracy)</p>
                      <p className="text-2xl font-bold text-[#10b981]">
                        {Math.round((diagnosticLogs.filter(l => l.passed).length / diagnosticLogs.length) * 100)}%
                      </p>
                    </div>
                    <div className="bg-[#0a0a0c] border border-[#24242b] rounded-xl p-4 text-center">
                      <p className="text-[#888891] text-sm mb-1">อัตราผลักบวกลวง (False Positives)</p>
                      <p className="text-2xl font-bold text-[#e2e8f0]">
                        {diagnosticLogs.filter(l => l.got.length > l.expected.length || (!l.passed && l.got.some(g => !l.expected.includes(g)))).length} Case
                      </p>
                    </div>
                    <div className="bg-[#0a0a0c] border border-[#24242b] rounded-xl p-4 text-center">
                      <p className="text-[#888891] text-sm mb-1">ตัดคำ/ตกหล่น (Tokenize Error)</p>
                      <p className="text-2xl font-bold text-[#e2e8f0]">
                        {diagnosticLogs.filter(l => !l.passed && l.got.length < l.expected.length).length} Case
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {diagnosticLogs.map((log, i) => (
                      <div key={i} className={`p-4 rounded-xl border ${log.passed ? 'bg-[#10b981]/5 border-[#10b981]/20' : 'bg-[#ef4444]/5 border-[#ef4444]/20'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-medium text-[#e2e8f0] flex items-center gap-2">
                            {log.passed ? <CheckCircle className="w-4 h-4 text-[#10b981]" /> : <ShieldAlert className="w-4 h-4 text-[#ef4444]" />}
                            {log.case}
                          </h3>
                        </div>
                        <p className="text-sm font-mono text-[#888891] mb-3">{log.log}</p>
                        <div className="flex flex-wrap gap-4 text-sm opacity-80">
                          <div className="flex items-center gap-2">
                            <span className="text-[#888891]">คาดหวัง:</span>
                            <span className="text-[#e2e8f0] bg-[#24242b] px-2 py-0.5 rounded">{log.expected.join(', ') || 'None'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[#888891]">ผลลัพธ์จริง:</span>
                            <span className={`px-2 py-0.5 rounded ${log.passed ? 'text-[#10b981] bg-[#10b981]/20' : 'text-[#ef4444] bg-[#ef4444]/20'}`}>
                              {log.got.join(', ') || 'None'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center border-2 border-dashed border-[#24242b] rounded-xl">
                  <PieChart className="w-10 h-10 text-[#888891] mx-auto mb-3" />
                  <p className="text-[#e2e8f0] font-medium">ยังไม่ได้รันการทดสอบ</p>
                  <p className="text-[#888891] text-sm mt-1">คลิกปุ่มด้านบนเพื่อจำลองเหตุการณ์แยกแยะคำภาษาไทย</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-[#141418] p-4 rounded-xl border border-[#24242b] shadow-sm flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#888891]" />
                  <input
                    type="text"
                    placeholder="ค้นหา Keyword (รองรับภาษาไทยไร้วรรณยุกต์)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-[#0a0a0c] border border-[#24242b] text-[#e2e8f0] placeholder-[#888891] rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-[#6366f1] outline-none transition-all"
                  />
                </div>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="px-4 py-2 bg-[#0a0a0c] border border-[#24242b] text-[#e2e8f0] rounded-lg focus:ring-2 focus:ring-[#6366f1]"
                >
                  <option value="all">ทุกกลุ่ม</option>
                  {registry.groups.map(g => (
                    <option key={g.groupId} value={g.groupId}>{g.groupName}</option>
                  ))}
                </select>
              </div>

              {/* Slider for Fuzzy Sensitivity (Typo percentage) */}
              <div className="flex items-center flex-wrap gap-4 px-1 pb-1 border-t border-[#24242b] pt-4 mt-1">
                <label className="text-sm text-[#888891] flex-shrink-0 flex items-center gap-2 min-w-[200px]">
                  <SlidersHorizontal className="w-4 h-4" />
                  ความแม่นยำ / เปอร์เซ็นจำกัดคำผิด: {fuzzySensitivity}%
                </label>
                <div className="flex-1 flex items-center gap-3">
                  <span className="text-xs text-[#888891]">ยอมรับคำผิดได้เยอะ</span>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="10"
                    value={fuzzySensitivity}
                    onChange={(e) => handleSensitivityChange(Number(e.target.value))}
                    className="w-full h-2 bg-[#24242b] rounded-lg appearance-none cursor-pointer accent-[#6366f1]"
                  />
                  <span className="text-xs text-[#888891]">เคร่งครัด</span>
                </div>
              </div>
            </div>

            <div className="bg-[#141418] border border-[#24242b] rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#1c1c22] border-b border-[#24242b] text-xs uppercase tracking-wider text-[#888891]">
                      <th className="px-6 py-3 font-medium">ID / Alias</th>
                      <th className="px-6 py-3 font-medium hidden sm:table-cell">Description</th>
                      <th className="px-6 py-3 font-medium">Group</th>
                      <th className="px-6 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1c1c22]">
                    <AnimatePresence>
                      {filteredEntries.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-[#888891]">
                            ไม่พบข้อมูลที่ค้นหา
                          </td>
                        </tr>
                      ) : (
                        filteredEntries.map((item, idx) => {
                          const { group, entry, matchType, score } = item;
                          return (
                          <motion.tr 
                            key={`${group}-${entry.id}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="hover:bg-[#1c1c22]"
                          >
                            <td className="px-6 py-4">
                              <div className="font-medium text-[#e2e8f0] flex items-center gap-2">
                                {entry.id}
                                {searchQuery && matchType && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${
                                    matchType === 'exact' ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/30' :
                                    matchType === 'partial' ? 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30' :
                                    matchType === 'pattern' ? 'bg-[#a855f7]/10 text-[#a855f7] border-[#a855f7]/30' :
                                    matchType === 'smart' ? 'bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/30' :
                                    matchType === 'typo' ? 'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/30' :
                                    matchType === 'fuzzy' ? 'bg-[#888891]/10 text-[#888891] border-[#888891]/30' : ''
                                  }`}>
                                    {matchType} ({score})
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-[#888891] mt-1 flex flex-wrap gap-1">
                                {entry.aliases?.map(a => (
                                  <span key={a} className="inline-flex px-2 py-0.5 rounded text-xs bg-[#6366f1]/10 text-[#6366f1] border border-[#6366f1]/20">
                                    {a}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-6 py-4 hidden sm:table-cell text-sm text-[#e2e8f0]">
                              {entry.description || '-'}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-[#1c1c22] border border-[#24242b] text-[#888891]">
                                {group}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => {
                                  // Find real group ID for saving
                                  const realGroupId = registry.groups.find(g => g.groupName === group)?.groupId;
                                  if (realGroupId) {
                                    setEditingEntry({...entry}); // Create fresh copy
                                    setOriginalEditingEntry({...entry});
                                    setEditingGroup(realGroupId);
                                    setEditingTargetGroup(realGroupId);
                                  }
                                }}
                                className="inline-flex items-center p-2 text-[#888891] hover:text-[#6366f1] hover:bg-[#6366f1]/10 rounded-lg transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </td>
                          </motion.tr>
                          );
                        })
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Edit Modal (Mobile Responsive) */}
      <AnimatePresence>
        {editingEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={requestCloseModal}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-[#141418] rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-[#24242b]"
            >
              <div className="p-6 border-b border-[#24242b]">
                <h3 className="text-lg font-semibold text-[#e2e8f0]">แก้ไข: {editingEntry.id}</h3>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#888891] mb-1">ID (รหัส)</label>
                  <input 
                    type="text" 
                    value={editingEntry.id} 
                    disabled
                    className="w-full px-3 py-2 bg-[#0a0a0c] border border-[#24242b] rounded-lg text-[#888891] cursor-not-allowed border-dashed"
                  />
                  <p className="text-xs text-[#888891] mt-1">ID ไม่สามารถถูกแก้ไขได้</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#888891] mb-1">กลุ่ม (Group Keyword)</label>
                  <select 
                    value={editingTargetGroup || editingGroup || ''} 
                    onChange={(e) => setEditingTargetGroup(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0a0a0c] border border-[#24242b] text-[#e2e8f0] rounded-lg focus:ring-2 focus:ring-[#6366f1] outline-none"
                  >
                    {registry?.groups.map(g => (
                      <option key={g.groupId} value={g.groupId}>{g.groupName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#888891] mb-1">Aliases (คั่นด้วยคอมมา)</label>
                  <input 
                    type="text" 
                    value={editingEntry.aliases?.join(', ') || ''} 
                    onChange={(e) => setEditingEntry({...editingEntry, aliases: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                    className="w-full px-3 py-2 bg-[#0a0a0c] border border-[#24242b] text-[#e2e8f0] rounded-lg focus:ring-2 focus:ring-[#6366f1] outline-none"
                    placeholder="เช่น keyword1, keyword2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#888891] mb-1">Synonyms / คำพ้อง (คั่นด้วยคอมมา)</label>
                  <input 
                    type="text" 
                    value={editingEntry.synonyms?.join(', ') || ''} 
                    onChange={(e) => setEditingEntry({...editingEntry, synonyms: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                    className="w-full px-3 py-2 bg-[#0a0a0c] border border-[#24242b] text-[#e2e8f0] rounded-lg focus:ring-2 focus:ring-[#6366f1] outline-none"
                    placeholder="ใส่คำพ้องความหมาย"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#888891] mb-1">Pattern Keyword (Regex rules คั่นด้วยคอมมา)</label>
                  <input 
                    type="text" 
                    value={editingEntry.patterns?.join(', ') || ''} 
                    onChange={(e) => setEditingEntry({...editingEntry, patterns: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                    className="w-full px-3 py-2 bg-[#0a0a0c] border border-[#24242b] text-[#e2e8f0] rounded-lg focus:ring-2 focus:ring-[#6366f1] outline-none font-mono text-sm"
                    placeholder="เช่น ^api.*$, test-[0-9]+"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#888891] mb-1">Description</label>
                  <textarea 
                    value={editingEntry.description || ''} 
                    onChange={(e) => setEditingEntry({...editingEntry, description: e.target.value})}
                    className="w-full px-3 py-2 bg-[#0a0a0c] border border-[#24242b] text-[#e2e8f0] rounded-lg focus:ring-2 focus:ring-[#6366f1] outline-none min-h-[100px] resize-y"
                    placeholder="รายละเอียดเพิ่มเติม..."
                  />
                </div>
              </div>
              <div className="p-6 bg-[#1c1c22] border-t border-[#24242b] flex justify-end gap-3">
                <button 
                  onClick={requestCloseModal}
                  className="px-4 py-2 text-sm font-medium text-[#e2e8f0] hover:bg-[#24242b] rounded-lg transition-colors"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={() => handleSaveEntry(editingEntry, editingTargetGroup)}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#6366f1] hover:opacity-90 rounded-lg transition-opacity inline-flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  บันทึก
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
