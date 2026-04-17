# Smart Search Enhancement - Learning from Skill Patterns

## Core Insight: Hierarchical Intent Recognition

**From skill patterns:** Skills don't just match keywords—they detect **intent levels**

### Skill Pattern Example:
```text
write-api-reference skill:
  Level 1 (Broad):    "Use when user asks to write"
  Level 2 (Medium):   "Trigger on 'document this function'"
  Level 3 (Specific): "Path pattern: docs/**/api-reference/"
  Level 4 (Context):  "Auto-activate if api param found"
```

**Problem in current search:** Query "write docs" returns all docs-related entries equally
**Solution:** Add hierarchical intent layers to search

---

## Enhancement 1: Hierarchical Query Matching

### Current Search (Existing Baseline):
```rust
// Already ranks by match type: exact (10000) > partial (5000+) > fuzzy (variable)
search("cache") → returns [
  SearchResult { id: "cache-components", match_type: "exact", score: 10000 },
  SearchResult { id: "caching-guide", match_type: "partial", score: 5050 },
  SearchResult { id: "perf-cache", match_type: "fuzzy", score: 340 }
]
// Also supports optional group scoping: search(query, Some("skills"))
```

**Current limitation:** Scoring doesn't distinguish *intent* (e.g., "cache optimization" vs "browser cache") — treats all matches in same category equally

### Smart Search Enhancement (Proposed):

**Adds:** Intent layers + anti-intent filtering + context awareness on top of existing match-type scoring
```text
// Entry with intent layers
{
  "id": "cache-components",
  "aliases": ["cache-components", "ppr"],
  "context_nouns": ["cache", "performance", "next.js"],
  "action_verbs": ["optimize", "improve", "configure"],
  "intent_signals": {
    "level_1_broad": ["performance optimization"],
    "level_2_medium": ["rendering efficiency"],
    "level_3_specific": ["partial prerendering configuration"],
    "level_4_proactive": ["cacheComponents: true in config"]
  }
}
```

### Search Logic (Existing + Smart Enhancement):
```text
User query: "how to optimize cache in next.js"

Step 1 - Existing match-type scoring (baseline):
  cache-components alias="cache-components" → exact match, base score: 10000
  caching-guide contains "cache" → partial match, base score: 5050
  perf-cache fuzzy match → fuzzy match, base score: 340

Step 2 - Smart intent layer (NEW - multiplicative boost on base):
  cache-components has intent_signals matching "optimization" → score ×1.5 (10000 → 15000)
  caching-guide no intent match → score ×1.0 (5050 → 5050)
  perf-cache no intent match → score ×1.0 (340 → 340)

Step 3 - Anti-intent filter (NEW - deprioritize):
  If query included "disable" → deprioritize entries with anti_intent: ["performance-only"]

Final ranking: cache-components (15000) > caching-guide (5050) > perf-cache (340)
```

---

## Enhancement 2: Semantic Grouping (Like Skill Namespaces)

### Current Registry:
```text
All entries flat — no clustering signal
```

### Smart Registry:
```json
{
  "groupId": "skills",
  "semantic_tags": {
    "mcp-ecosystem": ["mcp-server", "mcp-client", "mcp-deployment"],
    "performance": ["cache", "optimization", "scaling"],
    "documentation": ["api-docs", "guides", "references"]
  }
}
```

### Search Enhancement:
```text
Query: "I need to set up MCP"

Returns:
1. mcp-server-fundamentals (semantic_tag match: 100%)
2. mcp-testing (semantic_tag match: 80%)
3. mcp-deployment (semantic_tag match: 70%)
← All clustered, not scattered
```

---

## Enhancement 3: Anti-Intent Detection (Negative Matching)

### From Skill Pattern:
```text
cache-components skill:
  intents: ["performance optimization", "rendering efficiency"]
  anti_intents: ["client-side caching", "browser cache optimization"]
  ↑ Skill says: "Don't use me for this"
```

### Application to Registry:
```json
{
  "id": "cache-components",
  "intents": ["ssr performance", "server rendering optimization"],
  "anti_intents": ["client-side caching", "browser caching"],
  "confusion_with": ["modal", "vercel-analytics"]
}
```

### Smart Search Logic:
```text
Query: "optimize client-side cache"

cache-components entry:
- Matches "cache", "optimize"
- BUT anti_intent matches "client-side"
→ Suppress in results (don't hide, just deprioritize)

Better result: web-caching-guide (if exists)
```

---

## Enhancement 4: Context-Aware Alias Expansion

### Skill Pattern Observation:
```text
One skill responds to multiple trigger contexts:
- "write docs" → write-api-reference
- "document function" → write-api-reference  
- "api reference" → write-api-reference
- ALL treated as equal triggers (binary)
```

### Smart Expansion:
```json
{
  "id": "cache-components",
  "aliases": ["cache-components", "ppr", "partial-prerendering"],
  "context_aliases": {
    "next.js": ["next cache", "next.js caching", "next ppr"],
    "performance": ["cache optimization", "performance tuning"],
    "react": ["react cache", "server components cache"]
  }
}
```

### Search Engine:
```text
Query: "next.js caching strategy"

Expanded search:
- Direct alias match: "cache-components"
- Context alias match: "next cache" → cache-components
- Synonym expansion: "caching" → "cache"

Result: cache-components (high confidence)
```

---

## Enhancement 5: Trigger Pattern Detection (Skill Activation Logic)

### Skill Pattern:
```text
god-architecture skill:
  Triggers: ["architecture", "system design", "refactor", "monorepo"]
  Auto-activation: When mention "restructure codebase"
  Priority: If path contains "src/", run proactively
```

### Apply to Registry Search:
```json
{
  "id": "visual-story-extension",
  "trigger_patterns": {
    "keywords": ["visual", "story", "workflow", "narrative"],
    "context": ["gemini", "claude-code", "markdown"],
    "activation_signal": {
      "keyword_combo": ["story", "visual"],
      "min_confidence": 0.8
    }
  }
}
```

### Search Logic:
```text
Query: "visual story workflow"

Score calculation:
- Single keyword "visual": score 50
- Single keyword "story": score 50
- Combo "visual" + "story": score 500 ← Pattern match!

Result: visual-story-extension (high confidence)
vs. random entries with just "visual" (low confidence)
```

---

## Enhancement 6: Prerequisite-Aware Search (Skill Learning Path)

### Skill Pattern:
```text
mcp-integration-deployment skill:
  Prerequisites: ["mcp-server-fundamentals", "mcp-testing-debugging"]
  "You should know these before using this skill"
```

### Apply to Registry:
```json
{
  "id": "advanced-mcp-deployment",
  "prerequisites": ["mcp-server-basics", "mcp-testing"],
  "complexity": "advanced"
}
```

### Search Enhancement:
```text
User query: "how to deploy MCP"
User experience: "beginner"

Smart response:
1. mcp-server-basics (beginner, no prerequisites)
2. mcp-testing (intermediate, prerequisite: basics)
3. advanced-mcp-deployment (advanced, prerequisites marked)

← Shows learning path, not just list
```

---

## Concrete Implementation Plan

### Phase 2B: Intelligent Search (Low effort, high impact)

#### Step 1: Extend Schema (Schema.rs)
```rust
#[derive(JsonSchema)]
pub struct EntryMetadata {
    pub intent_signals: Option<IntentLayers>,      // Level 1-4
    pub anti_intents: Option<Vec<String>>,         // What NOT to use
    pub semantic_tags: Option<Vec<String>>,        // Grouping
    pub context_aliases: Option<HashMap<String, Vec<String>>>,  // Expansion
    pub trigger_patterns: Option<TriggerPattern>,  // Combo detection
    pub prerequisites: Option<Vec<String>>,        // Learning path
}

pub struct IntentLayers {
    pub level_1_broad: Vec<String>,
    pub level_2_medium: Vec<String>,
    pub level_3_specific: Vec<String>,
    pub level_4_proactive: Vec<String>,
}
```

#### Step 2: Update Search Algorithm (search.rs)
```rust
pub fn search_intelligent(
    &self,
    query: &str,
    user_context: Option<&UserContext>
) -> Vec<SearchResult> {
    // 1. Parse query into: action_verbs + context_nouns
    // 2. Check intent_signals (matches level 1-4)
    // 3. Check anti_intents (suppress if matched)
    // 4. Expand via context_aliases
    // 5. Detect trigger_patterns (combo matches)
    // 6. Score by: direct match + intent level + combo bonus
    // 7. Sort by score + prerequisites filter
}
```

#### Step 3: CLI Commands
```text
# Current
keyword-registry search "cache"

# New
keyword-registry search "cache" --intent-level 2
keyword-registry search "cache" --context "next.js"
keyword-registry search "cache" --avoid "browser"
keyword-registry search "cache" --learning-path beginner
```

#### Step 4: Validation in CI/CD
```text
# New CI check
- name: Validate Intent Consistency
  run: |
    ./target/release/keyword-registry validate \
      --check anti-intents \
      --check prerequisites \
      --check semantic-tags
```

---

## Quick Example: Before vs After

### Before (Current):
```bash
$ keyword-registry search "write"
Results:
1. write-api-reference (from aliases)
2. content-research-writer (from aliases)
3. writeup-guide (from aliases)
← All equally matched, user confused
```

### After (Smart):
```bash
$ keyword-registry search "write api docs" --context next.js
Results:
1. write-api-reference (score: 950)
   - Action match: "write" ✓
   - Intent match: "api reference" ✓
   - Context match: "next.js" ✓
   - Combo pattern: "write" + "api" ✓

2. content-research-writer (score: 300)
   - Action match: "write" ✓
   - Intent mismatch: not "api" ✗

3. writeup-guide (score: 100)
   - Alias match only
← Clear winner, less confusion
```

---

## Benefits Summary

| Problem | Solution | Benefit |
|---------|----------|---------|
| All matches treated equally | Intent-level scoring | Correct answer ranks first |
| Scattered results | Semantic grouping | Related entries cluster together |
| Misleading matches | Anti-intent filter | No false positives |
| Single keyword matches | Context alias expansion | Smarter matching |
| Random combo matches | Pattern detection | "write api" ≠ "api write" |
| No guidance | Prerequisite path | Users learn progressively |

---

## Implementation Timeline

- **Week 1:** Schema design + validation tests
- **Week 2:** Search algorithm (without context aliases yet)
- **Week 3:** CLI commands + documentation
- **Week 4:** CI/CD validation + test coverage

**Effort:** ~2-3 days Rust coding
**Impact:** 10x smarter search, no breaking changes