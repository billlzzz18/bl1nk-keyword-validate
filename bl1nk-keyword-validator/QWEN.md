# Project: bl1nk-keyword-validator

## Android Build Instructions (Termux)

### Problem
Building on Android fails with `Permission denied (os error 13)` when executing build scripts.
This happens because the `target/` directory resides on `/storage/emulated/0/` (external storage),
which does not allow execution of binaries.

### Solution
Set `CARGO_TARGET_DIR` to a location in the Termux home directory (`/data/data/com.termux/files/home/`):

```bash
# Create target directory once
mkdir -p /data/data/com.termux/files/home/tmp/cargo-targets

# Use it for all cargo commands
CARGO_TARGET_DIR=/data/data/com.termux/files/home/tmp/cargo-targets cargo build
CARGO_TARGET_DIR=/data/data/com.termux/files/home/tmp/cargo-targets cargo check
CARGO_TARGET_DIR=/data/data/com.termux/files/home/tmp/cargo-targets cargo test
CARGO_TARGET_DIR=/data/data/com.termux/files/home/tmp/cargo-targets cargo run -- --help
```

### Convenience: Add to .cargo/config.toml
Create `.cargo/config.toml` in project root to avoid typing the env var every time:

```toml
[env]
CARGO_TARGET_DIR = "/data/data/com.termux/files/home/tmp/cargo-targets"
```

### Justfile Commands
If `just` is installed, use the existing Justfile commands (they will inherit the env var):
```bash
just build
just release
just test
just check
just lint
```

---

## Project Overview

Rust CLI tool + library for validating and searching keyword registries (JSON files with schema-based entries).

### Quick Commands
```bash
# Build & check
CARGO_TARGET_DIR=~/tmp/cargo-targets cargo build

# Run CLI
CARGO_TARGET_DIR=~/tmp/cargo-targets cargo run -- validate
CARGO_TARGET_DIR=~/tmp/cargo-targets cargo run -- search "keyword"

# Tests
CARGO_TARGET_DIR=~/tmp/cargo-targets cargo test
```

### CLI Usage
```bash
keyword-registry [OPTIONS] <COMMAND>

Commands:
  validate    Validate registry or specific entry
  search      Search for keywords/aliases
  add         Add a new entry to a group
  edit        Edit an entry field
  show        Show entry by ID
  list        List all entries in a group
```
