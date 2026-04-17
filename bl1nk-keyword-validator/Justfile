# Justfile for bl1nk-keyword-validator

set shell := ["bash", "-c"]

# Default task: list all available recipes
default:
    @just --list

# Build the project in debug mode
build:
    cargo build

# Build the project in release mode (optimized binary)
release:
    cargo build --release

# Run tests
test:
    cargo test

# Check code for errors without building
check:
    cargo check

# Format code using rustfmt
fmt:
    cargo fmt

# Run clippy for linting
lint:
    cargo clippy -- -D warnings

# Clean build artifacts
clean:
    cargo clean

# Deep clean: remove all gitignored files EXCEPT .env files
clean-all:
    cargo clean
    rm -rf target/
    rm -f Cargo.lock
    rm -f **/*.rs.bk
    rm -rf .idea/
    rm -rf .vscode/
    rm -f *.swp *.swo *~
    rm -f .DS_Store
    rm -f tarpaulin-report.html cobertura.xml
    rm -f Thumbs.db .directory
    rm -f *.o *.a *.so *.dylib *.dll *.exe
    rm -f keyword-registry

# Run the binary with arguments (example: just run search "AI")
run *args:
    cargo run -- {{args}}

# Build and install the binary to ~/.cargo/bin
install:
    cargo install --path .

# Build for specific target (e.g., x86_64-unknown-linux-musl)
build-musl:
    cargo build --release --target x86_64-unknown-linux-musl

# Bump the registry version (major, minor, or patch)
bump type:
    ./scripts/bump-version.sh {{type}}
