/**
 * Markdown Table Parsing and Serialization Utilities
 * 
 * Handles basic GFM-style markdown tables:
 * - Header row with pipes
 * - Separator row with dashes
 * - Data rows
 * - Preserves column alignment markers
 */

/**
 * Column alignment for a markdown table
 */
export type Alignment = 'left' | 'center' | 'right' | null;

/**
 * Represents a single cell in a markdown table
 */
export interface TableCell {
  content: string;
  alignment: Alignment;
}

/**
 * Represents a row in a markdown table
 */
export interface TableRow {
  cells: TableCell[];
  isHeader: boolean;
}

/**
 * Complete table data structure with source location
 */
export interface TableData {
  rows: TableRow[];
  startLine: number;
  endLine: number;
  rawContent: string;
}

/**
 * Parse alignment from separator cell content
 */
function parseAlignment(separator: string): Alignment {
  const trimmed = separator.trim();
  if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
  if (trimmed.endsWith(':')) return 'right';
  if (trimmed.startsWith(':')) return 'left';
  return null;
}

/**
 * Check if a line is a table separator row
 * Separator rows contain |, -, :, and spaces (with or without outer pipes)
 */
function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  
  // Check if line looks like a separator (contains only pipes, dashes, colons, and spaces)
  const clean = trimmed.replace(/\s/g, '');
  
  // Must contain at least one dash and only dashes/colons/pipes
  if (!clean.includes('-')) return false;
  
  for (const char of clean) {
    if (char !== '-' && char !== ':' && char !== '|') return false;
  }
  
  return true;
}

/**
 * Parse a single table row into cells
 */
function parseRow(line: string, isSeparator: boolean = false): TableCell[] {
  const trimmed = line.trim();
  
  // Remove leading and trailing pipes
  let content = trimmed;
  if (content.startsWith('|')) content = content.slice(1);
  if (content.endsWith('|')) content = content.slice(0, -1);
  
  // Split by pipe and trim each cell
  const cells = content.split('|').map(c => c.trim());
  
  if (isSeparator) {
    return cells.map(separator => ({
      content: '',
      alignment: parseAlignment(separator)
    }));
  }
  
  return cells.map(content => ({
    content,
    alignment: null
  }));
}

/**
 * Parse a markdown table string into structured data
 * Returns null if the input doesn't contain a valid table
 */
export function parseMarkdownTable(
  markdown: string,
  _startLine: number = 0
): TableData | null {
  const lines = markdown.split('\n');
  
  // Find the first line that looks like a table row
  let headerLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Check if line looks like a table row: contains at least 2 pipes (for at least 1 column separator)
    const pipeCount = (line.match(/\|/g) || []).length;
    if (pipeCount >= 2) {
      headerLineIndex = i;
      break;
    }
  }
  
  if (headerLineIndex === -1) return null;
  
  // Check if next line is a separator
  if (headerLineIndex + 1 >= lines.length || !isSeparatorRow(lines[headerLineIndex + 1])) {
    return null;
  }
  
  const rows: TableRow[] = [];
  let endLine = headerLineIndex;
  
  // Parse header row
  const headerCells = parseRow(lines[headerLineIndex]);
  const separatorCells = parseRow(lines[headerLineIndex + 1], true);
  
  // Ensure header and separator have same number of columns
  const colCount = Math.max(headerCells.length, separatorCells.length);
  
  // Header row
  rows.push({
    isHeader: true,
    cells: headerCells.map((cell, idx) => ({
      ...cell,
      alignment: separatorCells[idx]?.alignment || null
    }))
  });
  
  endLine = headerLineIndex + 1;
  
  // Parse data rows
  for (let i = headerLineIndex + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Stop if line is empty or doesn't look like a table row
    if (!line || !line.includes('|')) break;
    
    // Try to parse as table row
    const cells = parseRow(line);
    
    // If the row has a different number of columns, try to handle it gracefully
    // Pad or truncate to match header column count
    const normalizedCells = cells.map(c => ({ ...c }));
    while (normalizedCells.length < colCount) {
      normalizedCells.push({ content: '', alignment: null });
    }
    if (normalizedCells.length > colCount) {
      normalizedCells.length = colCount;
    }
    
    rows.push({
      isHeader: false,
      cells: normalizedCells
    });
    
    endLine = i;
  }
  
  // Extract raw content
  const rawLines = lines.slice(headerLineIndex, endLine + 1);
  const rawContent = rawLines.join('\n');
  
  return {
    rows,
    startLine: headerLineIndex + 1, // 1-indexed for display
    endLine: endLine + 1,
    rawContent
  };
}

/**
 * Convert a TableData object back to markdown string
 */
export function tableToMarkdown(table: TableData): string {
  const lines: string[] = [];
  
  for (const row of table.rows) {
    const cells = row.cells.map(cell => {
      // Escape pipes in cell content
      let content = cell.content.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
      return content;
    });
    
    if (row.isHeader) {
      // Header row
      lines.push(`| ${cells.join(' | ')} |`);
    } else if (row.cells.some(c => c.alignment !== null)) {
      // This shouldn't happen for non-header rows, but handle separator
      // Actually, separator is part of header in our structure
    } else {
      // Data row
      lines.push(`| ${cells.join(' | ')} |`);
    }
  }
  
  // Insert separator row after header
  if (table.rows.length > 0 && table.rows[0].isHeader) {
    const alignments = table.rows[0].cells.map(cell => {
      if (cell.alignment === 'left') return ':---';
      if (cell.alignment === 'center') return ':---:';
      if (cell.alignment === 'right') return '---:';
      return '---';
    });
    lines.splice(1, 0, `| ${alignments.join(' | ')} |`);
  }
  
  return lines.join('\n');
}

/**
 * Find all tables in markdown content and return them with their positions
 */
export function extractTablesFromMarkdown(content: string): TableData[] {
  const tables: TableData[] = [];
  const lines = content.split('\n');
  let i = 0;
  
  while (i < lines.length) {
    const result = parseMarkdownTable(
      lines.slice(i).join('\n'),
      i + 1
    );
    
    if (result) {
      tables.push({
        ...result,
        startLine: i + result.startLine,
        endLine: i + result.endLine
      });
      i = i + result.endLine;
    } else {
      i++;
    }
  }
  
  return tables;
}

/**
 * Replace a specific table in the markdown content with new table markdown
 */
export function replaceTableInContent(
  content: string,
  oldTable: TableData,
  newTableMarkdown: string
): string {
  const lines = content.split('\n');
  
  // Replace lines from startLine-1 to endLine-1 (0-indexed)
  const startIndex = oldTable.startLine - 1;
  const endIndex = oldTable.endLine - 1;
  
  const newLines = [
    ...lines.slice(0, startIndex),
    newTableMarkdown,
    ...lines.slice(endIndex + 1)
  ];
  
  return newLines.join('\n');
}

/**
 * Create an empty table with the given dimensions
 */
export function createEmptyTable(rows: number, cols: number): TableData {
  const tableRows: TableRow[] = [];
  
  // Header row
  tableRows.push({
    isHeader: true,
    cells: Array(cols).fill({ content: '', alignment: null })
  });
  
  // Data rows
  for (let i = 0; i < rows - 1; i++) {
    tableRows.push({
      isHeader: false,
      cells: Array(cols).fill({ content: '', alignment: null })
    });
  }
  
  return {
    rows: tableRows,
    startLine: 0,
    endLine: rows,
    rawContent: tableToMarkdown({ rows: tableRows, startLine: 0, endLine: rows, rawContent: '' })
  };
}

/**
 * Deep clone a TableData object
 */
export function cloneTableData(table: TableData): TableData {
  return {
    ...table,
    rows: table.rows.map(row => ({
      ...row,
      cells: row.cells.map(cell => ({ ...cell }))
    }))
  };
}

/**
 * A single column in the grid model used by the table editor.
 * Unlike TableRow (where the header is rows[0]), the grid model separates
 * header metadata (GridColumn) from data rows (GridRow).
 */
export interface GridColumn {
  id: string;
  header: string;
  alignment: Alignment;
}

/**
 * A single data row in the grid model, keyed by GridColumn.id.
 */
export interface GridRow {
  id: string;
  cells: Record<string, string>;
}

/**
 * Grid representation of a table for use with a headless table library.
 */
export interface TableGrid {
  columns: GridColumn[];
  rows: GridRow[];
}

/**
 * Convert a parsed TableData object into the grid model.
 * The header row becomes columns; data rows become flat keyed records.
 */
export function tableDataToGrid(table: TableData): TableGrid {
  const headerRow = table.rows.find(row => row.isHeader) ?? table.rows[0];

  const columns: GridColumn[] = headerRow.cells.map((cell, index) => ({
    id: `c${index}`,
    header: cell.content,
    alignment: cell.alignment,
  }));

  const rows: GridRow[] = table.rows
    .filter(row => !row.isHeader)
    .map((row, index) => {
      const cells: Record<string, string> = {};
      row.cells.forEach((cell, cellIndex) => {
        cells[`c${cellIndex}`] = cell.content;
      });
      return { id: `r${index}`, cells };
    });

  return { columns, rows };
}

/**
 * Convert the grid model back into a TableData object, re-serializing the
 * markdown via tableToMarkdown so rawContent stays in sync.
 */
export function gridToTableData(
  grid: TableGrid,
  meta: { startLine: number; endLine: number }
): TableData {
  const rows: TableRow[] = [
    {
      isHeader: true,
      cells: grid.columns.map(column => ({
        content: column.header,
        alignment: column.alignment,
      })),
    },
    ...grid.rows.map(gridRow => ({
      isHeader: false,
      cells: grid.columns.map(column => ({
        content: gridRow.cells[column.id] ?? '',
        alignment: null,
      })),
    })),
  ];

  return {
    rows,
    startLine: meta.startLine,
    endLine: meta.endLine,
    rawContent: tableToMarkdown({
      rows,
      startLine: meta.startLine,
      endLine: meta.endLine,
      rawContent: '',
    }),
  };
}
