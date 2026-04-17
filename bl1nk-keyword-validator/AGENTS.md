# bl1nk-keyword-validator Learnings

## Architecture & Design

- **Cargo Workspace (v1.1.0)**: Split `core` and `cli` to optimize AI agent context. Core is reusable as library or WASM future.
- **Schema-centric design**: Single source of truth (`keyword-registry-schema.json`). Validator reads patterns + enums dynamically from schema, not hardcoded.
- **Group-scoped namespacing**: `relatedIds` checked against ALL valid IDs (not just within group) for cross-namespace linking.
- **Fuzzy search with scoring**: SkimMatcherV2 + scoring system (exact:10000, partial:5000+, fuzzy:variable). Prevents duplicate results per entry.

## Critical Validation Rules

- **Version compatibility**: SUPPORTED_VERSION hardcoded to "1.1.0" in validator. Bump script updates `keyword-registry-schema.json` only, not Cargo files.
- **Duplicate alias check**: Lowercase comparison, ignores entry being edited (for safe edit workflows).
- **Broken links**: `relatedIds` must reference existing IDs in entire registry before entry is saved.
- **Pattern + Enum validation**: Both read from schema `FieldSchema` at validation time, not pre-compiled.

## Build & Deployment

- **Workspace root Cargo.toml**: No dependencies, just `[workspace]` + `[profile.release]` with LTO/strip.
- **CI/CD**: GitHub Actions validate on `**.json` changes + Security audit via `cargo-audit`.
- **Release binaries**: Cross-platform (Linux/macOS/Windows) via matrix build, uploaded to GH Releases.

## CLI Command Mapping

- `validate` → single or entire registry (reads all groups, collects errors)
- `search` → scoped optional (filter by group_id)
- `add/edit` → auto-saves to file + re-validates
- `docs-gen` → exports markdown from registry
- `schema-export` → outputs JSON Schema without loading registry

## Testing

- Core tests in `src/validator.rs` + `src/search.rs` (24+ unit tests)
- Mock registry used for search/validator tests (hardcoded projects + skills groups)