import { 
    parseMarkdownTable, 
    tableToMarkdown, 
    extractTablesFromMarkdown, 
    replaceTableInContent,
    createEmptyTable,
    cloneTableData
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
});
