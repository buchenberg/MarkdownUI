# MarkdownUI

A Markdown document viewer and editor with embedded Mermaid diagram support, built with Tauri + React.

## Features

- **Markdown Editor**: Full-featured Monaco editor with custom dark blue theme
- **Live Preview**: Real-time markdown rendering with support for:
  - GitHub Flavored Markdown (tables, task lists, strikethrough)
  - Embedded Mermaid diagrams with theme support
  - Code blocks with syntax highlighting (Prism)
- **Collections**: Organize documents into collections
- **Auto-save**: Optional automatic saving of document content
- **Export Options**:
  - Markdown (.md) - Raw markdown file
  - HTML - Styled document with embedded diagrams
  - PDF - Print-ready document (requires Chrome/Chromium)
- **Zoom Controls**: Adjust preview zoom level (30% - 300%)
- **Dark Mode**: Full dark/light theme support across all UI elements
- **Resizable Panes**: Adjust sidebar, editor, and preview widths
- **Unified Header**: Clean single-header layout with all controls

## Screenshots

### Dark Mode
![Dark Mode Editor](docs/screenshots/dark-mode.png)

### Light Mode
![Light Mode Editor](docs/screenshots/light-mode.png)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Rust](https://rustup.rs/) (latest stable)
- Chrome, Chromium, or Edge (for PDF export)

### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Building for Production

```bash
npm run tauri build
```

## Usage

1. **Toggle Sidebar**: Click the hamburger menu (☰) to show/hide the sidebar
2. **Create a Collection**: Click "New" in the Collections section
3. **Create a Document**: Select a collection, then click "New" in Documents
4. **Edit Markdown**: Write your markdown in the left editor panel
5. **Preview**: See the rendered output in the right preview panel
6. **Embed Mermaid Diagrams**: Use fenced code blocks with the `mermaid` language:

   ~~~markdown
   ```mermaid
   graph TD
       A[Start] --> B[Process]
       B --> C[End]
   ```
   ~~~

7. **Export**: Click the Export button to save as Markdown, HTML, or PDF
8. **Toggle Theme**: Click the sun/moon icon to switch between light and dark modes

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS
- **Editor**: Monaco Editor (with custom theme)
- **Markdown**: react-markdown, remark-gfm, rehype-raw
- **Syntax Highlighting**: react-syntax-highlighter (Prism)
- **Diagrams**: Mermaid.js
- **Backend**: Tauri 1.5, Rust
- **Database**: SQLite (rusqlite)
- **PDF Export**: chromiumoxide (headless Chrome)

## Architecture

For detailed architecture documentation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Project Structure

```
MarkdownUI/
├── src/                    # Frontend (React/TypeScript)
│   ├── App.tsx             # Main application component
│   ├── api.ts              # Tauri IPC API layer
│   └── components/         # React components
├── src-tauri/              # Backend (Rust/Tauri)
│   └── src/
│       ├── main.rs         # Tauri commands
│       ├── database.rs     # SQLite operations
│       └── converter.rs    # Export conversion
└── docs/                   # Documentation
    └── ARCHITECTURE.md     # Detailed architecture guide
```

## Future Ideas

- [ ] **Image Support**: Embed and manage images within documents
- [ ] **Search**: Full-text search across all documents
- [ ] **Tags**: Tag documents for better organization
- [ ] **Synchronized Scrolling**: Sync scroll position between editor and preview
- [ ] **Custom CSS**: User-defined styles for preview
- [ ] **DOCX Export**: Export to Microsoft Word format

## License

MIT
