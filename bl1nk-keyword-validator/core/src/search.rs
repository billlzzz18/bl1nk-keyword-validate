use std::collections::HashMap;
use crate::schema::{KeywordRegistry, SearchResult};
use fuzzy_matcher::skim::SkimMatcherV2;
use fuzzy_matcher::FuzzyMatcher;

/// Tokenize text with basic whitespace and Thai bigram support for BM25
fn tokenize(text: &str) -> Vec<String> {
    let normalized = normalize_query(text);
    let mut tokens = Vec::new();
    for word in normalized.split_whitespace() {
        let chars: Vec<char> = word.chars().collect();
        let is_thai = chars.iter().any(|&c| c >= '\u{0E00}' && c <= '\u{0E7F}');
        
        if is_thai && chars.len() > 1 {
            for i in 0..chars.len() - 1 {
                let mut b = String::new();
                b.push(chars[i]);
                b.push(chars[i+1]);
                tokens.push(b);
            }
        } else if !chars.is_empty() {
            tokens.push(word.to_string());
        }
    }
    tokens
}

#[derive(Default)]
struct Bm25Index {
    docs: Vec<Bm25Document>,
    doc_freqs: HashMap<String, usize>,
    avgdl: f64,
}

struct Bm25Document {
    doc_id: String,
    tokens: Vec<String>,
}

impl Bm25Index {
    fn build(registry: &KeywordRegistry) -> Self {
        let mut docs = Vec::new();
        let mut doc_freqs = HashMap::new();
        let mut total_len = 0;

        for group in &registry.groups {
            for entry in &group.entries {
                if let Some(id) = entry.get("id").and_then(|v| v.as_str()) {
                    let mut content = String::new();
                    content.push_str(id);
                    content.push(' ');

                    if let Some(aliases) = entry.get("aliases").and_then(|v| v.as_array()) {
                        for a in aliases {
                            if let Some(s) = a.as_str() {
                                content.push_str(s);
                                content.push(' ');
                            }
                        }
                    }

                    if let Some(desc) = entry.get("description").and_then(|v| v.as_str()) {
                        content.push_str(desc);
                    }

                    let tokens = tokenize(&content);
                    total_len += tokens.len();

                    let mut unique_tokens = tokens.clone();
                    unique_tokens.sort();
                    unique_tokens.dedup();

                    for t in unique_tokens {
                        *doc_freqs.entry(t).or_insert(0) += 1;
                    }

                    docs.push(Bm25Document {
                        doc_id: format!("{}::{}", group.group_id, id),
                        tokens,
                    });
                }
            }
        }

        let avgdl = if docs.is_empty() {
            0.0
        } else {
            total_len as f64 / docs.len() as f64
        };

        Self {
            docs,
            doc_freqs,
            avgdl,
        }
    }

    fn score(&self, doc_id: &str, query_tokens: &[String]) -> f64 {
        let k1 = 1.2;
        let b = 0.75;
        let n = self.docs.len() as f64;

        let doc = match self.docs.iter().find(|d| d.doc_id == doc_id) {
            Some(d) => d,
            None => return 0.0,
        };

        let dl = doc.tokens.len() as f64;
        let mut score = 0.0;

        for q in query_tokens {
            let nq = *self.doc_freqs.get(q).unwrap_or(&0) as f64;
            if nq == 0.0 {
                continue;
            }

            let idf = ((n - nq + 0.5) / (nq + 0.5) + 1.0).ln();
            let fq = doc.tokens.iter().filter(|t| t == &q).count() as f64;

            if fq > 0.0 {
                let tf = (fq * (k1 + 1.0)) / (fq + k1 * (1.0 - b + b * (dl / self.avgdl.max(1.0))));
                score += idf * tf;
            }
        }

        score
    }
}

/// ค้นหา keyword จาก aliases ในทั้ง registry
pub struct KeywordSearch {
    registry: KeywordRegistry,
    matcher: SkimMatcherV2,
    bm25: Bm25Index,
}

impl KeywordSearch {
    pub fn new(registry: KeywordRegistry) -> Self {
        let bm25 = Bm25Index::build(&registry);
        Self {
            registry,
            // ปรับแต่ง matcher ให้ยืดหยุ่นขึ้น
            matcher: SkimMatcherV2::default().smart_case(),
            bm25,
        }
    }

    /// ค้นหา keyword จาก query โดยรองรับการระบุกลุ่ม (scoped search)
    /// สนับสนุน: exact match, partial match, fuzzy match, smart/bm25 match
    pub fn search(&self, query: &str, group_id: Option<&str>) -> Vec<SearchResult> {
        let normalized_query = normalize_query(query);
        let query_tokens = tokenize(query);
        let mut results = Vec::new();

        for group in &self.registry.groups {
            // กรองกลุ่ม (Namespace isolation)
            if let Some(target_group) = group_id {
                if group.group_id != target_group {
                    continue;
                }
            }

            for entry in &group.entries {
                if let Some(id) = entry.get("id").and_then(|v| v.as_str()) {
                    if let Some(aliases) = entry.get("aliases").and_then(|v| v.as_array()) {
                        let description = entry
                            .get("description")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();

                        let mut best_match: Option<SearchResult> = None;
                        
                        // 0. Smart Match (BM25) as baseline for the entry
                        let doc_id = format!("{}::{}", group.group_id, id);
                        let bm25_score = self.bm25.score(&doc_id, &query_tokens);
                        if bm25_score > 0.1 {
                             best_match = Some(SearchResult {
                                 id: id.to_string(),
                                 group_id: group.group_id.clone(),
                                 aliases: aliases.iter().filter_map(|a| a.as_str().map(String::from)).collect(),
                                 description: description.clone(),
                                 match_type: "smart".to_string(),
                                 score: (bm25_score * 1000.0) as i64,
                             });
                        }

                        for alias in aliases {
                            if let Some(alias_str) = alias.as_str() {
                                let normalized_alias = normalize_query(alias_str);

                                // --- ลำดับการตรวจสอบความแม่นยำ ---

                                // 1. Exact Match (สูงสุด)
                                if normalized_alias == normalized_query {
                                    let result = SearchResult {
                                        id: id.to_string(),
                                        group_id: group.group_id.clone(),
                                        aliases: aliases
                                            .iter()
                                            .filter_map(|a| a.as_str().map(String::from))
                                            .collect(),
                                        description: description.clone(),
                                        match_type: "exact".to_string(),
                                        score: 10000, // คะแนนสูงสุด
                                    };
                                    best_match = Some(result);
                                    break; // เจอดีที่สุดแล้ว
                                }

                                // 2. Partial Match (รองลงมา)
                                if normalized_alias.contains(&normalized_query) {
                                    let score = 5000 + (normalized_query.len() as i64 * 10);
                                    let result = SearchResult {
                                        id: id.to_string(),
                                        group_id: group.group_id.clone(),
                                        aliases: aliases
                                            .iter()
                                            .filter_map(|a| a.as_str().map(String::from))
                                            .collect(),
                                        description: description.clone(),
                                        match_type: "partial".to_string(),
                                        score,
                                    };
                                    if best_match.as_ref().map_or(true, |m| m.score < score) {
                                        best_match = Some(result);
                                    }
                                }

                                // 3. Fuzzy Match (ยืดหยุ่นที่สุด)
                                // หมายเหตุ: fuzzy_match มักจะต้องการให้อักขระเรียงลำดับกัน
                                // การใช้ fuzzy_match กับคำที่พิมพ์ผิดอาจจะได้คะแนนน้อย หรือ None
                                if let Some(score) = self.matcher.fuzzy_match(alias_str, query) {
                                    if score > 0 {
                                        let result = SearchResult {
                                            id: id.to_string(),
                                            group_id: group.group_id.clone(),
                                            aliases: aliases
                                                .iter()
                                                .filter_map(|a| a.as_str().map(String::from))
                                                .collect(),
                                            description: description.clone(),
                                            match_type: "fuzzy".to_string(),
                                            score,
                                        };
                                        if best_match.as_ref().map_or(true, |m| m.score < score) {
                                            best_match = Some(result);
                                        }
                                    }
                                }
                            }
                        }

                        if let Some(m) = best_match {
                            // ป้องกันการเพิ่ม entry เดิมซ้ำถ้าเจอหลาย alias
                            if !results
                                .iter()
                                .any(|r: &SearchResult| r.id == id && r.group_id == group.group_id)
                            {
                                results.push(m);
                            }
                        }
                    }
                }
            }
        }

        // เรียงตามคะแนนความแม่นยำ (มากไปน้อย)
        results.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.id.cmp(&b.id)));

        results
    }

    /// ค้นหาจากทุก alias ของ entry เดียว
    pub fn search_by_entry_id(&self, id: &str) -> Option<SearchResult> {
        for group in &self.registry.groups {
            for entry in &group.entries {
                if let Some(entry_id) = entry.get("id").and_then(|v| v.as_str()) {
                    if entry_id == id {
                        if let Some(aliases) = entry.get("aliases").and_then(|v| v.as_array()) {
                            let description = entry
                                .get("description")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();

                            return Some(SearchResult {
                                id: entry_id.to_string(),
                                group_id: group.group_id.clone(),
                                aliases: aliases
                                    .iter()
                                    .filter_map(|a| a.as_str().map(String::from))
                                    .collect(),
                                description,
                                match_type: "exact".to_string(),
                                score: 10000,
                            });
                        }
                    }
                }
            }
        }
        None
    }

    /// ค้นหาแบบไม่เจาะจงกลุ่ม
    pub fn search_language_neutral(&self, query: &str) -> Vec<SearchResult> {
        self.search(query, None)
    }
}

/// ทำให้คำค้นหาเป็นตัวพิมพ์เล็ก นำช่องว่างส่วนเกินออก
/// และถอดสระ/วรรณยุกต์ภาษาไทย (Thai Tone-Mark Insensitive Search)
fn normalize_query(q: &str) -> String {
    use std::sync::OnceLock;
    use regex::Regex;

    static THAI_TONE_RE: OnceLock<Regex> = OnceLock::new();
    let re = THAI_TONE_RE.get_or_init(|| Regex::new(r"[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]").unwrap());
    
    let lowercased = q.trim().to_lowercase();
    re.replace_all(&lowercased, "").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::{
        CustomFieldConfig, KeywordGroup, KeywordRegistry, Metadata, ValidationConfig,
        ValidationRules,
    };
    use serde_json::json;
    use std::collections::HashMap;

    fn make_test_registry() -> KeywordRegistry {
        KeywordRegistry {
            version: "1.1.0".to_string(),
            metadata: Metadata {
                last_updated: "2026-04-04T00:00:00Z".to_string(),
                description: "Test".to_string(),
                owner: "test".to_string(),
            },
            groups: vec![
                KeywordGroup {
                    group_id: "projects".to_string(),
                    group_name: "Projects".to_string(),
                    description: "Test".to_string(),
                    base_fields_schema: HashMap::new(),
                    custom_field_allowed: CustomFieldConfig {
                        enabled: false,
                        max_one: false,
                        description: "".to_string(),
                        examples: None,
                    },
                    entries: vec![
                        json!({
                            "id": "proj-visual",
                            "aliases": ["visual-story", "ภาพเรื่อง"],
                            "description": "Visual Story Extension"
                        }),
                        json!({
                            "id": "proj-docs",
                            "aliases": ["api-docs", "เอกสาร"],
                            "description": "API Documentation"
                        }),
                    ],
                },
                KeywordGroup {
                    group_id: "skills".to_string(),
                    group_name: "Skills".to_string(),
                    description: "Test skills".to_string(),
                    base_fields_schema: HashMap::new(),
                    custom_field_allowed: CustomFieldConfig {
                        enabled: false,
                        max_one: false,
                        description: "".to_string(),
                        examples: None,
                    },
                    entries: vec![json!({
                        "id": "skill-docs",
                        "aliases": ["api-reference"],
                        "description": "Docs skill"
                    })],
                },
            ],
            validation: ValidationConfig {
                rules: ValidationRules {
                    alias_min_length: 2,
                    alias_max_length: 50,
                    description_min_length: 10,
                    description_max_length: 255,
                    custom_field_per_entry: 1,
                    required_base_fields: vec![],
                },
                error_messages: HashMap::new(),
            },
        }
    }

    #[test]
    fn test_search_exact_match() {
        let searcher = KeywordSearch::new(make_test_registry());
        let results = searcher.search("visual-story", None);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "proj-visual");
        assert_eq!(results[0].match_type, "exact");
    }

    #[test]
    fn test_search_fuzzy_match() {
        let searcher = KeywordSearch::new(make_test_registry());
        // ใช้คำที่ใกล้เคียง (ตัวอักษรอยู่ในลำดับเดิม)
        let results = searcher.search("vual", None); // v-i-s-u-a-l

        assert!(!results.is_empty());
        assert_eq!(results[0].id, "proj-visual");
        assert_eq!(results[0].match_type, "fuzzy");
    }

    #[test]
    fn test_search_scoped_by_group() {
        let searcher = KeywordSearch::new(make_test_registry());

        // ค้นหา 'api' ในทุกกลุ่ม ควรเจอ 2 อย่าง
        let all_results = searcher.search("api", None);
        assert!(all_results.len() >= 2);

        // ค้นหา 'api' เฉพาะในกลุ่ม 'skills' ควรเจอแค่อย่างเดียว
        let scoped_results = searcher.search("api", Some("skills"));
        assert_eq!(scoped_results.len(), 1);
        assert_eq!(scoped_results[0].id, "skill-docs");
    }

    #[test]
    fn test_search_priority() {
        let mut registry = make_test_registry();
        registry.groups[0].entries.push(json!({
            "id": "proj-v",
            "aliases": ["visual"],
            "description": "Exact target"
        }));

        let searcher = KeywordSearch::new(registry);
        // ค้นหา "visual"
        // proj-v (exact) vs proj-visual (partial match ของ 'visual-story')
        let results = searcher.search("visual", None);

        assert_eq!(results[0].id, "proj-v");
        assert_eq!(results[0].match_type, "exact");
    }

    #[test]
    fn test_search_thai_tone_insensitive() {
        let searcher = KeywordSearch::new(make_test_registry());
        
        // alias ใน test registry คือ "ภาพเรื่อง"
        // ลองค้นหาด้วย "ภาพเรือง" (ไม่มีไม้เอก) หรือ "ภาพเรื่่อง" (เติมไม้เอกซ้อน)
        let results_1 = searcher.search("ภาพเรือง", None);
        let results_2 = searcher.search("ภาพเรื่อง", None);

        assert!(!results_1.is_empty(), "Should find match even without tone marks");
        assert_eq!(results_1[0].id, "proj-visual");
        // เพราะทั้ง alias ("ภาพเรื่อง") และ query ("ภาพเรือง") จะถูกแปลงเป็น "ภาพเรอง" ทำให้มันกลายเป็น Exact Match
        assert_eq!(results_1[0].match_type, "exact");
        assert_eq!(results_2[0].id, "proj-visual");
    }
}
