# MarkdownUI

A Markdown document viewer and editor with embedded Mermaid diagram support, built with Tauri + React.

## Features

- **Markdown Editor**: Full-featured Monaco editor with markdown syntax highlighting
- **Live Preview**: Real-time markdown rendering with support for:
  - GitHub Flavored Markdown (tables, task lists, strikethrough)
  - Embedded Mermaid diagrams
  - Code blocks with syntax highlighting
- **Collections**: Organize documents into collections
- **Auto-save**: Optional automatic saving of document content
- **Export**: Download documents as `.md` files
- **Zoom Controls**: Adjust preview zoom level

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Rust](https://rustup.rs/) (latest stable)

### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Building for Production

```bash
npm run build
```

## Usage

1. **Create a Collection**: Click the "+" button in the Collections section
2. **Create a Document**: Select a collection, then click "New" in the Documents section
3. **Edit Markdown**: Write your markdown in the left editor panel
4. **Preview**: See the rendered output in the right preview panel
5. **Embed Mermaid Diagrams**: Use fenced code blocks with the `mermaid` language:

   ~~~markdown
   ```mermaid
   graph TD
       A[Start] --> B[Process]
       B --> C[End]
   ```
   ~~~

6. **Export**: Click the download button to save as `.md` file

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS
- **Editor**: Monaco Editor
- **Markdown**: react-markdown, remark-gfm, rehype-raw
- **Diagrams**: Mermaid.js
- **Backend**: Tauri 1.5, Rust
- **Database**: SQLite (rusqlite)

## Future Ideas

- [ ] **DOCX Export**: Convert markdown documents to Word format with embedded diagrams as images
- [ ] **PDF Export**: Generate PDF documents from markdown
- [ ] **HTML Export**: Export as standalone HTML files
- [ ] **Syntax Highlighting**: Add Prism.js or highlight.js for better code block highlighting
- [ ] **Image Support**: Embed and manage images within documents
- [ ] **Search**: Full-text search across all documents
- [ ] **Tags**: Tag documents for better organization
- [ ] **Dark Mode**: Toggle between light and dark themes
- [ ] **Synchronized Scrolling**: Sync scroll position between editor and preview

## License

MIT
