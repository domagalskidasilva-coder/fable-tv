use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("erro de banco de dados: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("erro de rede: {0}")]
    Http(#[from] reqwest::Error),
    #[error("erro de E/S: {0}")]
    Io(#[from] std::io::Error),
    #[error("entrada inválida: {0}")]
    Invalid(String),
    #[error("não encontrado: {0}")]
    NotFound(String),
    #[error("operação cancelada")]
    Cancelled,
    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Other(format!("erro de JSON: {e}"))
    }
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::Other(format!("erro interno: {e}"))
    }
}

impl From<quick_xml::Error> for AppError {
    fn from(e: quick_xml::Error) -> Self {
        AppError::Other(format!("erro de XML: {e}"))
    }
}

pub type AppResult<T> = Result<T, AppError>;
