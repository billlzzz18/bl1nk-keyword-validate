# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-04-04

### Added
- **Cargo Workspace Architecture**: Refactored the project into a multi-crate workspace (`core` and `cli`) for better modularity and AI context efficiency.
- **Strategic Roadmap**: Established `SPEC.md` as the "Knowledge Backbone" roadmap for the bl1nk ecosystem.
- **Group-Scoped Namespacing**: Implemented logic to treat groups as namespaces for better keyword organization.
- **Broken Link Validation**: New validator check to ensure all `relatedIds` link to existing entries (`BROKEN_RELATIONSHIP`).
- **Dynamic Regex Validation**: Validator now reads `pattern` from each group's schema to enforce ID and string formats.
- **Enum (Values) Validation**: Implemented strict checking for enum-type fields (e.g., status, type) against allowed values in schema.
- **Version Bumping Script**: Created `scripts/bump-version.sh` and integrated it into `Justfile` via `just bump {major|minor|patch}`.
- **Comprehensive Test Suite**: Added 24+ unit tests covering fuzzy search, regex validation, enum checking, and relationship integrity.

### Changed
- **Generic Schema**: Generalised `keyword-registry-schema.json` by removing hardcoded `bl1nk-` prefix requirements, making the tool project-agnostic.
- **Validator Refactoring**: Robust error aggregation in `validate_registry` to return all errors at once.
- **Search Logic**: Improved `KeywordSearch` with better priority handling (Exact matches always rank before partial matches).

### Fixed
- Compile errors related to Regex type resolution and missing field schemas in mock data.
- Inconsistent mock data in unit tests (missing `type` and `description` fields).

---

## [1.0.0] - 2026-04-03

### Added
- **Initial Release**: Core validation and multi-language (Thai/English) search functionality.
- **Basic CLI**: Commands for search, validate, add, edit, show, and list.
- **Schema Foundation**: Initial `keyword-registry-schema.json` with base field validation.
- **Justfile**: Basic task automation for build, test, and linting.
- **CI/CD**: Initial Google Cloud Build and GitHub Actions workflows.
