# bl1nk-keyword-validator

Validation and search tool for bl1nk keyword registry. Supports multi-language search (Thai + English), schema enforcement, and CLI/library usage.

## Features

- ✅ **Schema-based validation**: Enforce structure from JSON schema
- ✅ **Multi-language search**: Search aliases in Thai and English seamlessly
- ✅ **CLI tool**: Commands for validate, search, add, edit, show, list
- ✅ **Library mode**: Reusable Rust library (`lib.rs`)
- ✅ **JSON I/O**: Input/output as JSON for easy integration
- ✅ **Error reporting**: Detailed validation errors with codes and messages

## Build

### Release Binary (optimized)
```bash
cargo build --release
# Binary: target/release/keyword-registry
```

### Install as global command
```bash
cargo install --path .
# Command: keyword-registry
```

### Development
```bash
cargo build
cargo run -- --help
```

## Usage

### CLI Commands

#### Validate entire schema
```bash
keyword-registry validate
# or with custom schema path
keyword-registry -s /path/to/schema.json validate
```

#### Validate single entry
```bash
keyword-registry validate bl1nk-visual-story-extension --group projects
```

#### Search keyword
```bash
# Search (human-readable output)
keyword-registry search "visual-story"
keyword-registry search "ภาพเรื่อง"

# Search (JSON output)
keyword-registry search "mcp" --json
```

#### Add new entry
```bash
# From JSON string
keyword-registry add projects '{"id":"bl1nk-test","aliases":["test"],"type":"app","status":"active","description":"Test"}'

# From JSON file
keyword-registry add skills @entry.json
```

#### Edit entry
```bash
keyword-registry edit bl1nk-visual-story-extension \
  --group projects \
  --field status \
  --value "archived"
```

#### Show entry details
```bash
keyword-registry show bl1nk-visual-story-extension
keyword-registry show bl1nk-visual-story-extension --json
```

#### List group entries
```bash
keyword-registry list projects
keyword-registry list skills --json
```

### Library Usage

```rust
use bl1nk_keyword_core::{load_registry, KeywordSearch, Validator};

// Load registry
let registry = load_registry("keyword-registry.json")?;

// Search
let search = KeywordSearch::new(registry.clone());
let results = search.search("visual-story");

// Validate
let validator = Validator::new(registry);
validator.validate_registry()?;
```

## Schema Structure

```json
{
  "version": "1.1.0",
  "metadata": { ... },
  "groups": [
    {
      "groupId": "projects",
      "baseFieldsSchema": { ... },
      "customFieldAllowed": { ... },
      "entries": [ ... ]
    }
  ],
  "validation": {
    "rules": { ... },
    "errorMessages": { ... }
  }
}
```

### Supported Field Types

- `string`: Text with optional pattern (regex) and length constraints
- `array`: Collections with item type validation
- `enum`: Predefined values
- `pattern`: Regex-validated strings

### Custom Fields

- ✅ 1 custom field per entry
- ✅ Type-locked (must match schema type for group)
- ✅ No naming conflicts with base fields

## Output Format

### Success Response
```json
{
  "valid": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "valid": false,
  "errors": [
    {
      "code": "INVALID_PATTERN",
      "field": "id",
      "message": "ID must match pattern for group type"
    }
  ]
}
```

## Error Codes

- `INVALID_ID`: ID doesn't match group pattern
- `DUPLICATE_ID`: ID already exists
- `DUPLICATE_ALIAS`: Alias already used
- `MISSING_REQUIRED_FIELD`: Required field missing
- `INVALID_TYPE`: Type mismatch
- `INVALID_ENUM`: Value not in allowed list
- `INVALID_PATTERN`: Doesn't match regex
- `ALIAS_TOO_SHORT`: Less than min length
- `ALIAS_TOO_LONG`: Exceeds max length
- `DESCRIPTION_TOO_LONG`: Exceeds 255 characters
- `TOO_MANY_CUSTOM_FIELDS`: Exceeds custom field limit

## Integration

### Node.js / Bun
```javascript
import { spawn } from "child_process";

const proc = spawn("keyword-registry", ["search", "mcp", "--json"]);
let output = "";

proc.stdout.on("data", (data) => {
  output += data.toString();
});

proc.on("close", (code) => {
  const result = JSON.parse(output);
  console.log(result);
});
```

### CI/CD Pipelines
You can easily add `bl1nk-keyword-validator` to GitHub Actions, GitLab CI, and Jenkins.
See the [CI/CD Integration Guide](docs/ci-cd.md) for full examples, custom YAML rule sets, and directory scanning with ignore patterns.

### Python
```python
import subprocess
import json

result = subprocess.run(
    ["keyword-registry", "search", "visual-story", "--json"],
    capture_output=True,
    text=True
)

data = json.loads(result.stdout)
print(data)
```

### MCP Server
Wrap commands as MCP tools — see `mcp-integration.rs` (future)

## Development

### Run tests
```bash
cargo test
```

### Check code
```bash
cargo clippy
```

### Format
```bash
cargo fmt
```

## Dependencies

- `serde` / `serde_json`: JSON serialization
- `clap`: CLI argument parsing
- `regex`: Pattern matching
- `anyhow` / `thiserror`: Error handling

## Project Structure

```
bl1nk-keyword-validator/
├── Cargo.toml           # Workspace root
├── core/                # Core logic crate
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs       # Main entry & persistence
│       ├── schema.rs    # Data models
│       ├── validator.rs # Logic for validation
│       ├── search.rs    # Logic for searching
│       └── error.rs     # Error definitions
├── cli/                 # CLI interface crate
│   ├── Cargo.toml
│   └── src/
│       └── main.rs      # CLI implementation
├── scripts/             # Utility scripts
│   └── bump-version.sh  # Version management
├── README.md
├── SPEC.md
└── Justfile
```

## Exit Codes

- `0`: Success
- `1`: Validation failed / Entry not found / Error
- `2`: Invalid arguments

## Future

- [ ] MCP server integration
- [ ] Batch operations
- [ ] Schema migration tools
- [ ] Watch mode (auto-validate on file change)
- [ ] TOML support
- [ ] Remote schema URL support

## Author

อาจารย์ (Dollawatt)

## License

MIT
