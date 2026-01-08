use bytes::Bytes;
use serde::{Deserialize, Serialize};
use shiva::core::TransformerTrait;
use std::path::PathBuf;

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
}

/// HTML template with modern styling and Mermaid.js support
const HTML_TEMPLATE: &str = r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{TITLE}}</title>
    <style>
        :root {
            --bg-color: #ffffff;
            --text-color: #24292e;
            --code-bg: #f6f8fa;
            --border-color: #e1e4e8;
            --link-color: #0366d6;
            --heading-color: #24292e;
        }
        
        * {
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            font-size: 16px;
            line-height: 1.6;
            color: var(--text-color);
            background-color: var(--bg-color);
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
        }
        
        h1, h2, h3, h4, h5, h6 {
            color: var(--heading-color);
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 0.3em;
        }
        
        h1 { font-size: 2em; }
        h2 { font-size: 1.5em; }
        h3 { font-size: 1.25em; border-bottom: none; }
        h4, h5, h6 { border-bottom: none; }
        
        p {
            margin-top: 0;
            margin-bottom: 16px;
        }
        
        a {
            color: var(--link-color);
            text-decoration: none;
        }
        
        a:hover {
            text-decoration: underline;
        }
        
        code {
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            font-size: 85%;
            background-color: var(--code-bg);
            padding: 0.2em 0.4em;
            border-radius: 6px;
        }
        
        pre {
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            font-size: 85%;
            background-color: var(--code-bg);
            padding: 16px;
            overflow: auto;
            border-radius: 6px;
            line-height: 1.45;
        }
        
        pre code {
            background-color: transparent;
            padding: 0;
            border-radius: 0;
        }
        
        blockquote {
            margin: 0 0 16px 0;
            padding: 0 1em;
            color: #6a737d;
            border-left: 4px solid var(--border-color);
        }
        
        ul, ol {
            margin-top: 0;
            margin-bottom: 16px;
            padding-left: 2em;
        }
        
        li + li {
            margin-top: 0.25em;
        }
        
        table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 16px;
        }
        
        table th, table td {
            padding: 8px 13px;
            border: 1px solid var(--border-color);
        }
        
        table th {
            background-color: var(--code-bg);
            font-weight: 600;
        }
        
        table tr:nth-child(even) {
            background-color: #f6f8fa;
        }
        
        hr {
            border: 0;
            height: 1px;
            background-color: var(--border-color);
            margin: 24px 0;
        }
        
        img {
            max-width: 100%;
            height: auto;
        }
        
        /* Task list styling */
        input[type="checkbox"] {
            margin-right: 0.5em;
        }
        
        /* Mermaid diagram styling */
        .mermaid {
            text-align: center;
            margin: 16px 0;
            background-color: var(--code-bg);
            padding: 16px;
            border-radius: 6px;
        }
        
        @media print {
            body {
                max-width: none;
                padding: 20px;
            }
        }
        
        @media (prefers-color-scheme: dark) {
            :root {
                --bg-color: #0d1117;
                --text-color: #c9d1d9;
                --code-bg: #161b22;
                --border-color: #30363d;
                --link-color: #58a6ff;
                --heading-color: #c9d1d9;
            }
            
            table tr:nth-child(even) {
                background-color: #161b22;
            }
        }
    </style>
    <!-- Mermaid.js for diagram rendering -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // Detect dark mode
            const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            mermaid.initialize({
                startOnLoad: true,
                theme: isDark ? 'dark' : 'default',
                securityLevel: 'loose'
            });
        });
    </script>
</head>
<body>
{{CONTENT}}
</body>
</html>"#;

/// Unique placeholder for mermaid blocks that won't be modified by Shiva
const MERMAID_PLACEHOLDER: &str = "MERMAID_DIAGRAM_PLACEHOLDER_";

/// Convert markdown content to the specified format
pub fn convert_markdown(content: &str, format: &ExportFormat) -> Result<Vec<u8>, String> {
    // Extract mermaid blocks and replace with placeholders
    let (processed_content, mermaid_blocks) = extract_mermaid_blocks(content);
    
    // Parse markdown to Common Document Model
    let input_bytes = Bytes::from(processed_content);
    let document = shiva::markdown::Transformer::parse(&input_bytes)
        .map_err(|e| format!("Failed to parse markdown: {:?}", e))?;

    // Generate output in target format
    let output_bytes = match format {
        ExportFormat::Html => {
            let raw_html = shiva::html::Transformer::generate(&document)
                .map_err(|e| format!("Failed to generate HTML: {:?}", e))?;
            
            // Extract title from first heading or use default
            let title = extract_title(content);
            
            // Convert raw HTML and inject mermaid divs back
            let mut html_content = String::from_utf8_lossy(&raw_html).to_string();
            
            // Replace placeholders with actual mermaid divs
            for (i, mermaid_code) in mermaid_blocks.iter().enumerate() {
                let placeholder = format!("{}{}", MERMAID_PLACEHOLDER, i);
                let mermaid_div = format!(
                    "<div class=\"mermaid\">\n{}\n</div>",
                    mermaid_code.trim()
                );
                html_content = html_content.replace(&placeholder, &mermaid_div);
            }
            
            // Wrap with styled template
            let styled_html = HTML_TEMPLATE
                .replace("{{TITLE}}", &title)
                .replace("{{CONTENT}}", &html_content);
            
            Bytes::from(styled_html.into_bytes())
        }
        // PDF format is handled in main.rs via convert_html_to_pdf
        // This arm should never be reached since PDF goes through HTML first
        ExportFormat::Pdf => {
            return Err("PDF format should be handled via convert_html_to_pdf".to_string());
        }
    };

    Ok(output_bytes.to_vec())
}

/// Extract mermaid blocks from markdown and replace with unique placeholders
/// Returns the processed markdown and a list of mermaid diagram contents
fn extract_mermaid_blocks(content: &str) -> (String, Vec<String>) {
    let mut result = String::new();
    let mut mermaid_blocks = Vec::new();
    let mut in_mermaid = false;
    let mut mermaid_content = String::new();
    
    for line in content.lines() {
        if line.trim() == "```mermaid" {
            in_mermaid = true;
            mermaid_content.clear();
        } else if in_mermaid && line.trim() == "```" {
            in_mermaid = false;
            // Store the mermaid content and add a placeholder
            let placeholder = format!("{}{}\n", MERMAID_PLACEHOLDER, mermaid_blocks.len());
            result.push_str(&placeholder);
            mermaid_blocks.push(mermaid_content.clone());
        } else if in_mermaid {
            mermaid_content.push_str(line);
            mermaid_content.push('\n');
        } else {
            result.push_str(line);
            result.push('\n');
        }
    }
    
    (result, mermaid_blocks)
}

/// Extract title from first heading in markdown content
fn extract_title(content: &str) -> String {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") {
            return trimmed[2..].trim().to_string();
        }
    }
    "Document".to_string()
}

/// Check if Chrome/Chromium is available for PDF generation
/// Returns the path to the Chrome executable if found
pub fn check_chrome_available() -> Result<PathBuf, String> {
    use chromiumoxide::detection::{default_executable, DetectionOptions};
    
    default_executable(DetectionOptions::default())
        .map_err(|_| "Chrome, Chromium, or Edge is required for PDF export. Please install a Chromium-based browser.".to_string())
}

/// Convert HTML content to PDF using Chrome (async)
/// Uses chromiumoxide's new headless mode to suppress window flash on Windows
pub async fn convert_html_to_pdf(html: &str) -> Result<Vec<u8>, String> {
    use chromiumoxide::browser::{Browser, BrowserConfig};
    use chromiumoxide::cdp::browser_protocol::page::PrintToPdfParams;
    use futures::StreamExt;
    
    // Build browser config with new headless mode (Chrome 112+)
    // This uses --headless=new which should suppress window flash better
    let config = BrowserConfig::builder()
        .new_headless_mode()
        .window_size(1200, 1600)
        .arg("--disable-gpu")
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .build()
        .map_err(|e| format!("Failed to build browser config: {:?}", e))?;
    
    // Launch browser
    let (browser, mut handler) = Browser::launch(config)
        .await
        .map_err(|e| format!("Failed to launch browser: {:?}", e))?;
    
    // Spawn handler task
    let handler_task = tokio::spawn(async move {
        while let Some(_) = handler.next().await {}
    });
    
    // Create a new page
    let page = browser.new_page("about:blank")
        .await
        .map_err(|e| format!("Failed to create page: {:?}", e))?;
    
    // Set HTML content
    page.set_content(html)
        .await
        .map_err(|e| format!("Failed to set HTML content: {:?}", e))?;
    
    // Wait for content to render (especially for Mermaid.js diagrams)
    tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
    
    // Print to PDF with A4 size and margins
    let pdf_params = PrintToPdfParams::builder()
        .paper_width(8.27)   // A4 width in inches
        .paper_height(11.69) // A4 height in inches
        .margin_top(0.5)
        .margin_bottom(0.5)
        .margin_left(0.5)
        .margin_right(0.5)
        .print_background(true)
        .build();
    
    let pdf_bytes = page.pdf(pdf_params)
        .await
        .map_err(|e| format!("Failed to generate PDF: {:?}", e))?;
    
    // Close browser
    drop(browser);
    handler_task.abort();
    
    Ok(pdf_bytes)
}
