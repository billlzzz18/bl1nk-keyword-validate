use bl1nk_keyword_core::{load_registry, save_registry, KeywordSearch, Validator};
use clap::{Parser, Subcommand};
use serde_json::{json, Value};
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "keyword-registry",
    version = "1.1.0",
    about = "Validation and search tool for bl1nk keyword registry"
)]
struct Cli {
    #[arg(
        global = true,
        short,
        long,
        default_value = "./keyword-registry.json",
        help = "Path to keyword registry JSON file"
    )]
    schema: PathBuf,

    #[arg(
        global = true,
        short = 'c',
        long,
        help = "Custom configuration file to override or add rules (YAML or JSON)"
    )]
    config: Option<PathBuf>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Validate entire schema or single entry
    Validate {
        /// Entry ID to validate (optional, validates entire schema if not provided)
        #[arg(value_name = "ID")]
        entry_id: Option<String>,

        /// Group ID (required if validating single entry)
        #[arg(short, long)]
        group: Option<String>,
    },

    /// Search keyword by query
    Search {
        /// Search query (supports Thai and English)
        #[arg(value_name = "QUERY")]
        query: String,

        /// Filter by Group ID
        #[arg(short, long)]
        group: Option<String>,

        /// Return raw JSON output
        #[arg(short, long)]
        json: bool,
    },

    /// Add new entry to registry
    Add {
        /// Group ID (projects, skills, keywords)
        #[arg(value_name = "GROUP")]
        group: String,

        /// JSON entry data as string or @file
        #[arg(value_name = "JSON")]
        entry: String,
    },

    /// Edit existing entry
    Edit {
        /// Entry ID to edit
        #[arg(value_name = "ID")]
        id: String,

        /// Group ID
        #[arg(short, long)]
        group: String,

        /// Field name to edit
        #[arg(short, long)]
        field: String,

        /// New value
        #[arg(short, long)]
        value: String,
    },

    /// Show entry details
    Show {
        /// Entry ID
        #[arg(value_name = "ID")]
        id: String,

        /// Return raw JSON output
        #[arg(short, long)]
        json: bool,
    },

    /// List all entries in a group
    List {
        /// Group ID
        #[arg(value_name = "GROUP")]
        group: String,

        /// Return raw JSON output
        #[arg(short, long)]
        json: bool,
    },

    /// Export JSON Schema for the registry
    SchemaExport,

    /// Generate Markdown documentation from the registry
    DocsGen {
        /// Output file path (default: stdout)
        #[arg(short, long)]
        output: Option<PathBuf>,
    },

    /// Scan directory for registry files and validate them
    Scan {
        /// Directory to scan
        #[arg(short, long, default_value = ".")]
        dir: PathBuf,

        /// Glob patterns to ignore (comma separated), e.g., "**/.git/**,**/node_modules/**"
        #[arg(short, long)]
        ignore: Option<String>,
    },
}

fn main() {
    if let Err(e) = run() {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    // คำสั่งที่ไม่ต้องโหลด registry หลักจาก cli.schema
    match &cli.command {
        Commands::SchemaExport => {
            let schema = schemars::schema_for!(bl1nk_keyword_core::schema::KeywordRegistry);
            println!("{}", serde_json::to_string_pretty(&schema)?);
            return Ok(());
        }
        Commands::Scan { dir, ignore } => {
            return handle_scan(dir, ignore.clone(), cli.config.clone());
        }
        _ => {}
    }

    // โหลด registry
    let mut registry = load_registry(&cli.schema).map_err(|e| match e {
        bl1nk_keyword_core::ValidatorError::FileIo(msg) => msg,
        bl1nk_keyword_core::ValidatorError::JsonError(err) => format!("Data format error: {}", err),
        _ => format!("Registry error: {}", e),
    })?;

    // Apply custom rules to the main registry if provided
    if let Some(config_path) = &cli.config {
        let custom_registry = load_registry(config_path).map_err(|e| match e {
            bl1nk_keyword_core::ValidatorError::FileIo(msg) => format!("Custom config IO: {}", msg),
            bl1nk_keyword_core::ValidatorError::JsonError(err) => format!("Custom config format error: {}", err),
            _ => format!("Custom config error: {}", e),
        })?;
        registry.validation = custom_registry.validation;
    }

    match cli.command {
        Commands::Validate { entry_id, group } => {
            cmd_validate(&registry, entry_id, group)?;
        }

        Commands::Search { query, group, json } => {
            cmd_search(&registry, &query, group, json)?;
        }

        Commands::Add { group, entry } => {
            cmd_add(&registry, &cli.schema, &group, &entry)?;
        }

        Commands::Edit {
            id,
            group,
            field,
            value,
        } => {
            cmd_edit(&registry, &cli.schema, &id, &group, &field, &value)?;
        }

        Commands::Show { id, json } => {
            cmd_show(&registry, &id, json)?;
        }

        Commands::List { group, json } => {
            cmd_list(&registry, &group, json)?;
        }

        Commands::DocsGen { output } => {
            cmd_docs_gen(&registry, output)?;
        }

        Commands::SchemaExport | Commands::Scan { .. } => unreachable!(),
    }

    Ok(())
}

fn handle_scan(
    dir: &PathBuf,
    ignore: Option<String>,
    config: Option<PathBuf>,
) -> Result<(), Box<dyn std::error::Error>> {
    println!("Scanning directory: {:?}", dir);

    let ignore_patterns: Vec<String> = if let Some(ig) = ignore {
        ig.split(',').map(|s| s.trim().to_string()).collect()
    } else {
        // Default ignore patterns
        vec![
            "**/.git/**".to_string(),
            "**/node_modules/**".to_string(),
            "**/target/**".to_string(),
            "**/dist/**".to_string(),
        ]
    };

    // Prepare custom rules if provided
    let mut custom_rules = None;
    if let Some(config_path) = config {
        println!("Loading custom configuration: {:?}", config_path);
        let custom_registry = bl1nk_keyword_core::load_registry(&config_path)?;
        custom_rules = Some(custom_registry.validation);
    }

    let search_str = dir.join("**/*.{json,yaml,yml}").to_string_lossy().to_string();

    let mut scanned_count = 0;
    let mut valid_count = 0;
    let mut error_count = 0;

    println!("Searching for files using pattern: {}", search_str);
    for entry in glob::glob(&search_str).expect("Failed to read glob pattern") {
        match entry {
            Ok(path) => {
                let path_str = path.to_string_lossy().replace("\\", "/");
                
                // Check if ignored
                let mut is_ignored = false;
                for pattern in &ignore_patterns {
                    if let Ok(matcher) = glob::Pattern::new(pattern) {
                        if matcher.matches(&path_str) {
                            is_ignored = true;
                            break;
                        }
                    }
                }
                
                if is_ignored {
                    continue;
                }

                // Try validating
                scanned_count += 1;
                print!("Validating {}... ", path_str);
                
                let mut registry = match bl1nk_keyword_core::load_registry(&path) {
                    Ok(r) => r,
                    Err(_) => {
                        println!("Failed to parse as keyword registry. Skipping.");
                        continue; // Not a registry file
                    }
                };
                
                // Override rules if custom provided
                if let Some(ref custom_validation) = custom_rules {
                    registry.validation = custom_validation.clone();
                }

                let validator = Validator::new(registry);
                match validator.validate_registry() {
                    Ok(_) => {
                        println!("OK");
                        valid_count += 1;
                    }
                    Err(errors) => {
                        println!("FAILED");
                        for err in errors {
                            println!("  - [{}] {}: {}", err.code, err.field.unwrap_or_default(), err.message);
                        }
                        error_count += 1;
                    }
                }
            }
            Err(e) => println!("Error accessing path: {:?}", e),
        }
    }
    
    println!("\nScan Complete.");
    println!("Files matched & scanned: {}", scanned_count);
    println!("Valid registries: {}", valid_count);
    if error_count > 0 {
        println!("Registries with errors: {}", error_count);
        return Err("Validation failed for some files".into());
    } else {
        println!("All scanned registries are valid!");
    }

    Ok(())
}

fn cmd_validate(
    registry: &bl1nk_keyword_core::KeywordRegistry,
    entry_id: Option<String>,
    group: Option<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    let validator = Validator::new(registry.clone());

    if let Some(id) = entry_id {
        // validate single entry
        let g_id = group.ok_or("Group ID is required for single entry validation")?;
        let group_data = registry
            .groups
            .iter()
            .find(|g| g.group_id == g_id)
            .ok_or(format!("Group '{}' not found", g_id))?;

        let entry = group_data
            .entries
            .iter()
            .find(|e| e.get("id").and_then(|v| v.as_str()) == Some(&id))
            .ok_or(format!("Entry '{}' not found in group '{}'", id, g_id))?;

        match validator.validate_entry(&g_id, entry) {
            Ok(_) => {
                println!(
                    "{}",
                    json!({ "valid": true, "message": format!("Entry '{}' is valid", id) })
                );
            }
            Err(errors) => {
                println!("{}", json!({ "valid": false, "errors": errors }));
                std::process::exit(1);
            }
        }
    } else {
        // validate entire registry
        match validator.validate_registry() {
            Ok(_) => {
                println!(
                    "{}",
                    json!({ "valid": true, "message": "All entries are valid" })
                );
            }
            Err(errors) => {
                println!("{}", json!({ "valid": false, "errors": errors }));
                std::process::exit(1);
            }
        }
    }

    Ok(())
}

fn cmd_search(
    registry: &bl1nk_keyword_core::KeywordRegistry,
    query: &str,
    group_id: Option<String>,
    json_output: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let search = KeywordSearch::new(registry.clone());
    let results = search.search(query, group_id.as_deref());

    if json_output {
        let response = json!({
            "query": query,
            "results": results,
            "count": results.len()
        });
        println!("{}", response);
    } else {
        if results.is_empty() {
            println!("No results found for: {}", query);
        } else {
            println!("Found {} result(s):\n", results.len());
            for result in results {
                println!("ID: {}", result.id);
                println!("Group: {}", result.group_id);
                println!(
                    "Match Type: {} (Score: {})",
                    result.match_type, result.score
                );
                println!("Aliases: {}", result.aliases.join(", "));
                println!("Description: {}", result.description);
                println!("---");
            }
        }
    }

    Ok(())
}

fn cmd_add(
    registry: &bl1nk_keyword_core::KeywordRegistry,
    schema_path: &std::path::PathBuf,
    group: &str,
    entry_str: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut registry = registry.clone();
    let new_entry: Value = if let Some(path) = entry_str.strip_prefix('@') {
        let content = std::fs::read_to_string(path)?;
        serde_json::from_str(&content)?
    } else {
        serde_json::from_str(entry_str)?
    };

    let validator = Validator::new(registry.clone());

    // 1. ตรวจสอบความถูกต้องของ entry
    validator.validate_entry(group, &new_entry).map_err(|e| {
        format!(
            "Validation failed: {}",
            serde_json::to_string_pretty(&e).unwrap()
        )
    })?;

    // 2. ตรวจสอบ duplicate aliases
    if let Some(aliases) = new_entry.get("aliases").and_then(|v| v.as_array()) {
        let alias_strings: Vec<String> = aliases
            .iter()
            .filter_map(|a| a.as_str().map(String::from))
            .collect();

        let dup_errors = validator.check_duplicate_aliases(group, None, &alias_strings);
        if !dup_errors.is_empty() {
            return Err(format!(
                "Duplicate aliases found: {}",
                serde_json::to_string_pretty(&dup_errors).unwrap()
            )
            .into());
        }
    }

    // 3. เพิ่มเข้า registry
    let group_data = registry
        .groups
        .iter_mut()
        .find(|g| g.group_id == group)
        .ok_or(format!("Group '{}' not found", group))?;

    group_data.entries.push(new_entry);

    // 4. บันทึกไฟล์
    save_registry(schema_path, &registry)?;
    println!(
        "{}",
        json!({ "valid": true, "message": "Entry added successfully" })
    );

    Ok(())
}

fn cmd_edit(
    registry: &bl1nk_keyword_core::KeywordRegistry,
    schema_path: &std::path::PathBuf,
    id: &str,
    group: &str,
    field: &str,
    value: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut registry = registry.clone();
    let validator = Validator::new(registry.clone());

    let group_data = registry
        .groups
        .iter_mut()
        .find(|g| g.group_id == group)
        .ok_or(format!("Group '{}' not found", group))?;

    let entry = group_data
        .entries
        .iter_mut()
        .find(|e| e.get("id").and_then(|v| v.as_str()) == Some(id))
        .ok_or(format!("Entry '{}' not found in group '{}'", id, group))?;

    // อัปเดตค่า (จัดการประเภทข้อมูลเบื้องต้น)
    let new_val: Value = if value.starts_with('[') || value.starts_with('{') {
        serde_json::from_str(value)?
    } else {
        Value::String(value.to_string())
    };

    entry[field] = new_val;

    // ตรวจสอบความถูกต้องหลังแก้ไข
    validator.validate_entry(group, entry).map_err(|e| {
        format!(
            "Validation failed after edit: {}",
            serde_json::to_string_pretty(&e).unwrap()
        )
    })?;

    // ตรวจสอบ duplicate aliases (ถ้าแก้ไข aliases)
    if field == "aliases" {
        if let Some(aliases) = entry.get("aliases").and_then(|v| v.as_array()) {
            let alias_strings: Vec<String> = aliases
                .iter()
                .filter_map(|a| a.as_str().map(String::from))
                .collect();

            let dup_errors = validator.check_duplicate_aliases(group, Some(id), &alias_strings);
            if !dup_errors.is_empty() {
                return Err(format!(
                    "Duplicate aliases found after edit: {}",
                    serde_json::to_string_pretty(&dup_errors).unwrap()
                )
                .into());
            }
        }
    }

    save_registry(schema_path, &registry)?;
    println!(
        "{}",
        json!({ "valid": true, "message": "Entry updated successfully" })
    );

    Ok(())
}

fn cmd_show(
    registry: &bl1nk_keyword_core::KeywordRegistry,
    id: &str,
    json_output: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    for group in &registry.groups {
        if let Some(entry) = group
            .entries
            .iter()
            .find(|e| e.get("id").and_then(|v| v.as_str()) == Some(id))
        {
            if json_output {
                println!("{}", serde_json::to_string_pretty(entry)?);
            } else {
                println!("Entry Details:");
                println!("ID: {}", id);
                println!("Group: {}", group.group_id);
                println!("{:#}", entry);
            }
            return Ok(());
        }
    }

    Err(format!("Entry '{}' not found in any group", id).into())
}

fn cmd_list(
    registry: &bl1nk_keyword_core::KeywordRegistry,
    group_id: &str,
    json_output: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let group = registry
        .groups
        .iter()
        .find(|g| g.group_id == group_id)
        .ok_or(format!("Group '{}' not found", group_id))?;

    if json_output {
        println!("{}", serde_json::to_string_pretty(&group.entries)?);
    } else {
        println!("Entries in group '{}':\n", group_id);
        for entry in &group.entries {
            if let Some(id) = entry.get("id").and_then(|v| v.as_str()) {
                if let Some(desc) = entry.get("description").and_then(|v| v.as_str()) {
                    println!("- {}: {}", id, desc);
                }
            }
        }
    }

    Ok(())
}

fn cmd_docs_gen(
    registry: &bl1nk_keyword_core::KeywordRegistry,
    output: Option<PathBuf>,
) -> Result<(), Box<dyn std::error::Error>> {
    let markdown = bl1nk_keyword_core::generate_markdown(registry);

    match output {
        Some(path) => {
            std::fs::write(&path, markdown)?;
            println!("Documentation generated at: {}", path.display());
        }
        None => {
            println!("{}", markdown);
        }
    }

    Ok(())
}
