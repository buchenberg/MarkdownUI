use bytes::Bytes;
use serde::{Deserialize, Serialize};
use shiva::core::TransformerTrait;

/// Supported export formats
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Html,
    Pdf,
}

impl ExportFormat {
    /// Parse format from string
    pub fn from_str(s: &str) -> Result<Self, String> {
        match s.to_lowercase().as_str() {
            "html" => Ok(ExportFormat::Html),
            "pdf" => Ok(ExportFormat::Pdf),
            _ => Err(format!("Unsupported format: {}. Supported: html, pdf", s)),
        }
    }

    /// Get file extension for format
    pub fn extension(&self) -> &'static str {
        match self {
            ExportFormat::Html => "html",
            ExportFormat::Pdf => "pdf",
        }
    }
}

/// Convert markdown content to the specified format
pub fn convert_markdown(content: &str, format: &ExportFormat) -> Result<Vec<u8>, String> {
    // Parse markdown to Common Document Model
    let input_bytes = Bytes::from(content.to_string());
    let document = shiva::markdown::Transformer::parse(&input_bytes)
        .map_err(|e| format!("Failed to parse markdown: {:?}", e))?;

    // Generate output in target format
    let output_bytes = match format {
        ExportFormat::Html => {
            shiva::html::Transformer::generate(&document)
                .map_err(|e| format!("Failed to generate HTML: {:?}", e))?
        }
        ExportFormat::Pdf => {
            shiva::pdf::Transformer::generate(&document)
                .map_err(|e| format!("Failed to generate PDF: {:?}", e))?
        }
    };

    Ok(output_bytes.to_vec())
}
