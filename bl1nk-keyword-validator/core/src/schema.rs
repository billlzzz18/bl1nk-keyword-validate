use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============= Schema Types =============

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct KeywordRegistry {
    pub version: String,
    pub metadata: Metadata,
    pub groups: Vec<KeywordGroup>,
    pub validation: ValidationConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Metadata {
    #[serde(rename = "lastUpdated")]
    pub last_updated: String,
    pub description: String,
    pub owner: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct KeywordGroup {
    #[serde(rename = "groupId")]
    pub group_id: String,
    #[serde(rename = "groupName")]
    pub group_name: String,
    pub description: String,
    #[serde(rename = "baseFieldsSchema")]
    pub base_fields_schema: HashMap<String, FieldSchema>,
    #[serde(rename = "customFieldAllowed")]
    pub custom_field_allowed: CustomFieldConfig,
    pub entries: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FieldSchema {
    #[serde(rename = "type")]
    pub field_type: String,
    #[serde(rename = "itemType", skip_serializing_if = "Option::is_none")]
    pub item_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub values: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
    #[serde(rename = "maxLength", skip_serializing_if = "Option::is_none")]
    pub max_length: Option<usize>,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CustomFieldConfig {
    pub enabled: bool,
    #[serde(rename = "maxOne")]
    pub max_one: bool,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub examples: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ValidationConfig {
    pub rules: ValidationRules,
    #[serde(rename = "errorMessages")]
    pub error_messages: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ValidationRules {
    #[serde(rename = "aliasMinLength")]
    pub alias_min_length: usize,
    #[serde(rename = "aliasMaxLength")]
    pub alias_max_length: usize,
    #[serde(rename = "descriptionMinLength")]
    pub description_min_length: usize,
    #[serde(rename = "descriptionMaxLength")]
    pub description_max_length: usize,
    #[serde(rename = "customFieldPerEntry")]
    pub custom_field_per_entry: usize,
    #[serde(rename = "requiredBaseFields")]
    pub required_base_fields: Vec<String>,
}

// ============= Search Types =============

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SearchResult {
    pub id: String,
    #[serde(rename = "groupId")]
    pub group_id: String,
    pub aliases: Vec<String>,
    pub description: String,
    #[serde(rename = "matchType")]
    pub match_type: String, // "exact", "partial", "fuzzy"
    pub score: i64,
}

#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub query: String,
    pub results: Vec<SearchResult>,
    pub count: usize,
}
