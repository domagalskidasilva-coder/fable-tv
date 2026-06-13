use crate::error::{AppError, AppResult};
use std::path::PathBuf;

/// Validates that a user-supplied URL is a well-formed http(s) URL.
/// Only sources explicitly configured by the user are ever contacted.
pub fn validate_http_url(raw: &str) -> AppResult<url::Url> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::Invalid("URL vazia".into()));
    }
    if trimmed.len() > 4096 {
        return Err(AppError::Invalid("URL longa demais".into()));
    }
    let u = url::Url::parse(trimmed)
        .map_err(|_| AppError::Invalid(format!("URL inválida: {trimmed}")))?;
    match u.scheme() {
        "http" | "https" => {}
        other => {
            return Err(AppError::Invalid(format!(
                "esquema de URL não permitido: {other} (use http ou https)"
            )))
        }
    }
    if u.host_str().is_none() {
        return Err(AppError::Invalid("URL sem host".into()));
    }
    Ok(u)
}

/// Validates a local file path provided by the user (via the native file
/// dialog) before reading it. Must be absolute, existing and a plain file.
pub fn validate_local_file(path: &str, allowed_exts: &[&str]) -> AppResult<PathBuf> {
    let p = PathBuf::from(path.trim());
    if !p.is_absolute() {
        return Err(AppError::Invalid("o caminho do arquivo deve ser absoluto".into()));
    }
    if !p.is_file() {
        return Err(AppError::NotFound(format!("arquivo não encontrado: {}", p.display())));
    }
    if !allowed_exts.is_empty() {
        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        if !allowed_exts.contains(&ext.as_str()) {
            return Err(AppError::Invalid(format!(
                "extensão não permitida: .{ext} (permitidas: {})",
                allowed_exts.join(", ")
            )));
        }
    }
    Ok(p)
}

/// Validates a destination path for exports: absolute, .json, parent exists.
pub fn validate_export_path(path: &str) -> AppResult<PathBuf> {
    let p = PathBuf::from(path.trim());
    if !p.is_absolute() {
        return Err(AppError::Invalid("o caminho de destino deve ser absoluto".into()));
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if ext != "json" {
        return Err(AppError::Invalid("o arquivo de exportação deve terminar em .json".into()));
    }
    match p.parent() {
        Some(parent) if parent.is_dir() => Ok(p),
        _ => Err(AppError::Invalid("a pasta de destino não existe".into())),
    }
}

/// Trims and bounds a user-facing name.
pub fn sanitize_name(raw: &str, fallback: &str) -> String {
    let s = raw.trim();
    let s = if s.is_empty() { fallback } else { s };
    s.chars().take(200).collect()
}

const VALID_ITEM_TYPES: &[&str] = &["channel", "movie", "series", "episode"];

pub fn validate_item_type(t: &str) -> AppResult<()> {
    if VALID_ITEM_TYPES.contains(&t) {
        Ok(())
    } else {
        Err(AppError::Invalid(format!("tipo de item inválido: {t}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_validation_accepts_http_https_only() {
        assert!(validate_http_url("http://example.com/playlist.m3u").is_ok());
        assert!(validate_http_url("https://example.com/get.php?a=1").is_ok());
        assert!(validate_http_url("ftp://example.com/x").is_err());
        assert!(validate_http_url("file:///etc/passwd").is_err());
        assert!(validate_http_url("javascript:alert(1)").is_err());
        assert!(validate_http_url("").is_err());
        assert!(validate_http_url("not a url").is_err());
    }

    #[test]
    fn item_type_allowlist() {
        assert!(validate_item_type("channel").is_ok());
        assert!(validate_item_type("movie").is_ok());
        assert!(validate_item_type("playlist'; DROP TABLE--").is_err());
    }

    #[test]
    fn sanitize_name_trims_and_falls_back() {
        assert_eq!(sanitize_name("  Minha Fonte  ", "x"), "Minha Fonte");
        assert_eq!(sanitize_name("   ", "Fonte"), "Fonte");
    }
}
