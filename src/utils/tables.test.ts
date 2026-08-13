import { 
    parseMarkdownTable, 
    tableToMarkdown, 
    extractTablesFromMarkdown, 
    replaceTableInContent,
    createEmptyTable,
    cloneTableData,
    tableDataToGrid,
    gridToTableData
} from './tables';

describe('Table Parsing', () => {
    test('parse simple table', () => {
        const markdown = `
| Header 1 | Header 2 | Header 3 |
|---------|---------|---------|
| Cell 1  | Cell 2  | Cell 3  |
| Cell 4  | Cell 5  | Cell 6  |
`;
        const result = parseMarkdownTable(markdown);
        
        expect(result).not.toBeNull();
        expect(result!.rows.length).toBe(3); // header + 2 data rows
        expect(result!.rows[0].isHeader).toBe(true);
        expect(result!.rows[0].cells.length).toBe(3);
        expect(result!.rows[0].cells[0].content).toBe('Header 1');
        expect(result!.rows[1].isHeader).toBe(false);
        expect(result!.rows[1].cells[0].content).toBe('Cell 1');
    });

    test('parse table with alignment', () => {
        const markdown = `
| Left | Center | Right |
|:-----|:------:|------:|
| L1   | C1     | R1    |
`;
        const result = parseMarkdownTable(markdown);
        
        expect(result).not.toBeNull();
        expect(result!.rows[0].cells[0].alignment).toBe('left');
        expect(result!.rows[0].cells[1].alignment).toBe('center');
        expect(result!.rows[0].cells[2].alignment).toBe('right');
    });

    test('table to markdown', () => {
        const markdown = `
| A | B |
|---|---|
| 1 | 2 |
`;
        const parsed = parseMarkdownTable(markdown);
        expect(parsed).not.toBeNull();
        
        const converted = tableToMarkdown(parsed!);
        expect(converted).toContain('| A | B |');
        expect(converted).toContain('|---|---|');
        expect(converted).toContain('| 1 | 2 |');
    });

    test('extract multiple tables', () => {
        const markdown = `
Some text

| Table 1 | Col |
|--------|-----|
| A | B |

More text

| Table 2 | Col |
|--------|-----|
| C | D |
`;
        const tables = extractTablesFromMarkdown(markdown);
        expect(tables.length).toBe(2);
    });

    test('replace table in content', () => {
        const content = `
Before

| Old | Table |
|-----|-------|
| 1 | 2 |

After
`;
        const tables = extractTablesFromMarkdown(content);
        expect(tables.length).toBe(1);
        
        const newMarkdown = `
| New | Table |
|-----|-------|
| 3 | 4 |
`;
        
        const updated = replaceTableInContent(content, tables[0], newMarkdown);
        expect(updated).toContain('Before');
        expect(updated).toContain('After');
        expect(updated).toContain('| New | Table |');
        expect(updated).not.toContain('| Old | Table |');
    });

    test('create empty table', () => {
        const table = createEmptyTable(3, 2);
        expect(table.rows.length).toBe(3);
        expect(table.rows[0].isHeader).toBe(true);
        expect(table.rows[0].cells.length).toBe(2);
        expect(table.rows[1].isHeader).toBe(false);
    });

    test('clone table data', () => {
        const markdown = `
| A | B |
|---|---|
| 1 | 2 |
`;
        const parsed = parseMarkdownTable(markdown);
        expect(parsed).not.toBeNull();
        
        const cloned = cloneTableData(parsed!);
        expect(cloned).not.toBe(parsed);
        expect(cloned.rows).not.toBe(parsed!.rows);
        expect(cloned.rows[0].cells).not.toBe(parsed!.rows[0].cells);
        expect(cloned.rows[0].cells[0].content).toBe(parsed!.rows[0].cells[0].content);
    });

    test('tableDataToGrid maps header to columns and data to rows', () => {
        const markdown = `
| Left | Center | Right |
|:-----|:------:|------:|
| L1   | C1     | R1    |
| L2   | C2     | R2    |
`;
        const parsed = parseMarkdownTable(markdown)!;
        const grid = tableDataToGrid(parsed);

        expect(grid.columns.length).toBe(3);
        expect(grid.columns[0]).toEqual({ id: 'c0', header: 'Left', alignment: 'left' });
        expect(grid.columns[1]).toEqual({ id: 'c1', header: 'Center', alignment: 'center' });
        expect(grid.columns[2]).toEqual({ id: 'c2', header: 'Right', alignment: 'right' });

        expect(grid.rows.length).toBe(2);
        expect(grid.rows[0]).toEqual({ id: 'r0', cells: { c0: 'L1', c1: 'C1', c2: 'R1' } });
        expect(grid.rows[1]).toEqual({ id: 'r1', cells: { c0: 'L2', c1: 'C2', c2: 'R2' } });
    });

    test('gridToTableData round-trips content and alignment', () => {
        const markdown = `
| Left | Center | Right |
|:-----|:------:|------:|
| L1   | C1     | R1    |
`;
        const parsed = parseMarkdownTable(markdown)!;
        const grid = tableDataToGrid(parsed);
        const restored = gridToTableData(grid, { startLine: parsed.startLine, endLine: parsed.endLine });

        expect(restored.rows.length).toBe(2);
        expect(restored.rows[0].isHeader).toBe(true);
        expect(restored.rows[0].cells[0]).toEqual({ content: 'Left', alignment: 'left' });
        expect(restored.rows[1].cells[0]).toEqual({ content: 'L1', alignment: null });
        expect(restored.startLine).toBe(parsed.startLine);
        expect(restored.endLine).toBe(parsed.endLine);
        expect(restored.rawContent).toBe(tableToMarkdown(parsed));
    });

    test('grid round-trip preserves plain table markdown', () => {
        const markdown = `
| A | B |
|---|---|
| 1 | 2 |
`;
        const parsed = parseMarkdownTable(markdown)!;
        const grid = tableDataToGrid(parsed);
        const restored = gridToTableData(grid, { startLine: parsed.startLine, endLine: parsed.endLine });

        expect(restored.rawContent).toContain('| A | B |');
        expect(restored.rawContent).toContain('|---|---|');
        expect(restored.rawContent).toContain('| 1 | 2 |');
    });
});
