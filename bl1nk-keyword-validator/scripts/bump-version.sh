#!/usr/bin/env bash
set -e

FILE="keyword-registry-schema.json"
TYPE=$1

if [[ -z "$TYPE" ]]; then
    echo "Usage: $0 {major|minor|patch}"
    exit 1
fi

CURRENT_VERSION=$(jq -r '.version' "$FILE")
IFS='.' read -ra ADDR <<< "$CURRENT_VERSION"
MAJOR=${ADDR[0]}
MINOR=${ADDR[1]}
PATCH=${ADDR[2]}

case "$TYPE" in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    patch)
        PATCH=$((PATCH + 1))
        ;;
    *)
        echo "Invalid version type: $TYPE. Use {major|minor|patch}."
        exit 1
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Create a temporary file and update using jq
jq --arg ver "$NEW_VERSION" --arg time "$TIMESTAMP" '.version = $ver | .metadata.lastUpdated = $time' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"

echo "Registry bumped to v$NEW_VERSION at $TIMESTAMP"
