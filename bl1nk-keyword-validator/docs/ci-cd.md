# CI/CD Integration Guide

The `bl1nk-keyword-validator` can be easily integrated into your Continuous Integration (CI) and Continuous Deployment (CD) pipelines. This ensures that any keyword registry changes or new code additions conform to your schema and validation rules before they are merged or deployed.

With the new `scan` command, you can automatically validate multiple JSON/YAML registry files and ignore specific paths (like build artifacts or generated files).

---

## Output Status Codes

When using the CLI in pipelines, the exit status codes dictate success or failure:
- **`0`**: Success (All validation passed)
- **`1`**: Validation failed (Errors found)
- **`2`**: Invalid arguments or CLI errors

---

## 1. GitHub Actions

GitHub Actions makes it easy to run the keyword validator on every pull request or push. You can install the Rust environment, or use pre-compiled binaries if you host them. Here is a standard configuration using `cargo`.

Create `.github/workflows/keyword-validation.yml`:

```yaml
name: Keyword Registry Validation

on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Parse and Validate Registry Files
        # Use the scan command to check all YAML/JSON files outside ignored folders
        # Provide a custom rule config if required
        run: |
          cargo run --release --bin keyword-registry -- scan --dir . --ignore "**/.git/**,**/node_modules/**,**/dist/**,**/target/**"
```

## 2. GitLab CI

For GitLab CI, you can execute the validator within a Rust Docker image.

Create `.gitlab-ci.yml`:

```yaml
stages:
  - validate

keyword_validation:
  stage: validate
  image: rust:latest
  script:
    - echo "Validating keyword registry files..."
    - cargo run --release --bin keyword-registry -- scan --dir . --ignore "**/.git/**,**/node_modules/**" --config custom-rules.yaml
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

## 3. Jenkins

For Jenkins, you can create a stage in your `Jenkinsfile` that checks out the repository and runs the validation.

Create `Jenkinsfile`:

```groovy
pipeline {
    agent {
        docker {
            image 'rust:latest'
            args '-v $HOME/.cargo/registry:/usr/local/cargo/registry'
        }
    }
    stages {
        stage('Validation') {
            steps {
                echo 'Running bl1nk keyword validation...'
                sh '''
                cargo run --release --bin keyword-registry -- scan \
                    --dir . \
                    --ignore '**/node_modules/**,**/target/**,**/.git/**' \
                    --config custom-rules.yml
                '''
            }
        }
    }
    post {
        failure {
            echo 'Keyword validation failed. Please check the logs.'
        }
    }
}
```

---

## Custom Rule Sets (JSON/YAML)

You can maintain a strict `custom-rules.yaml` in your repository that overrides or supplements the default embedded rules. Whenever the CI runs, pass it to the validator using:

```bash
keyword-registry scan --dir data/ --config custom-rules.yaml
```

**Example `custom-rules.yaml`:**
```yaml
version: "1.1.0"
metadata:
  lastUpdated: "2026-04-17"
  description: "Company Level CI/CD custom overrides"
  owner: "DevOps"
groups: []
validation:
  rules:
    aliasMinLength: 4
    aliasMaxLength: 50
    descriptionMinLength: 10
    descriptionMaxLength: 1000
    customFieldPerEntry: 2
    requiredBaseFields:
      - "id"
      - "aliases"
      - "type"
  errorMessages:
    ALIAS_TOO_SHORT: "Aliases must be at least 4 characters long."
```
