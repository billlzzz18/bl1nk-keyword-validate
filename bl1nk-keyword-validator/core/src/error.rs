use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub code: String,
    pub field: Option<String>,
    pub message: String,
}

#[derive(Debug, Error)]
pub enum ValidatorError {
    #[error("Schema parsing error: {0}")]
    SchemaParse(String),

    #[error("File I/O error: {0}")]
    FileIo(String),

    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Validation error")]
    ValidationFailed(Vec<ValidationError>),

    #[error("Entry not found: {0}")]
    EntryNotFound(String),

    #[error("Duplicate entry: {0}")]
    DuplicateEntry(String),

    #[error("Search failed: {0}")]
    SearchFailed(String),
}

impl ValidatorError {
    pub fn to_json_response(&self) -> serde_json::Value {
        match self {
            ValidatorError::ValidationFailed(errors) => serde_json::json!({
                "valid": false,
                "errors": errors
            }),
            _ => serde_json::json!({
                "valid": false,
                "errors": [{
                    "code": "ERROR",
                    "field": null,
                    "message": self.to_string()
                }]
            }),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ValidationResponse<T> {
    pub valid: bool,
    pub data: Option<T>,
    pub errors: Vec<ValidationError>,
}

impl<T: Serialize> ValidationResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            valid: true,
            data: Some(data),
            errors: vec![],
        }
    }

    pub fn failure(errors: Vec<ValidationError>) -> serde_json::Value {
        serde_json::json!({
            "valid": false,
            "errors": errors
        })
    }
}
