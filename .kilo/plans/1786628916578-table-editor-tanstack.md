# Table Editor → TanStack Table Refactor

## Goal

Replace the hand-rolled `<table>` in `TableEditorModal.tsx` with **@tanstack/react-table v8**, keeping the external `TableData` contract and markdown round-trip unchanged so `DocumentPreview.tsx` and `tables.test.ts` remain valid.

## Decisions (confirmed with user)

1. **Multiline = visual wrapping only.** Data-cell content stays single-line logically. No newline/`<br>` encoding is added to `tables.ts`. `tableToMarkdown` / `parseMarkdownTable` are **not** changed.
2. **Add/delete controls = header/gutter hover controls:**
   - Delete a column: small `×` on the header cell, shown on hover.
   - Delete a row: small `×` in a left gutter cell, shown on hover.
   - Append a column: trailing `+` header cell.
   - Append a row: a bottom "Add row" bar below the table.
3. **Data-cell editor = auto-growing `<textarea wrap="soft">`.** Enter commits and moves down (no newline inserted). Headers use a single-line `<input>`.
4. **Kept as-is:** undo/redo (Ctrl+Z / Ctrl+Y), Tab/Esc navigation, Esc-closes-modal, focus trap, "Empty" placeholder, alignment preservation (display indicator only, no editing).
5. **Out of scope:** column resize / sort / filter, alignment editing, real `<br>` multiline encoding, virtualized rows.

## TanStack is headless

TanStack manages columns/data/row-model only; every cell is still rendered manually via `flexRender`. It requires a flat `data: TData[]` and `ColumnDef[]`, so we add a small grid transform layer rather than fighting the existing `rows[0] = header` shape.

## Files

### 1. `package.json`
Add dependency: `@tanstack/react-table` (^8). Install: `npm install @tanstack/react-table`.

### 2. `src/utils/tables.ts` — add grid types + transforms (do NOT change existing functions)

```ts
export type Alignment = 'left' | 'center' | 'right' | null;

export interface GridColumn {
  id: string;          // stable unique: 'c0','c1',...
  header: string;
  alignment: Alignment;
}

export interface GridRow {
  id: string;          // stable unique: 'r0','r1',...
  cells: Record<string, string>;   // keyed by GridColumn.id
}

export interface TableGrid {
  columns: GridColumn[];
  rows: GridRow[];
}

export function tableDataToGrid(table: TableData): TableGrid;
export function gridToTableData(
  grid: TableGrid,
  meta: { startLine: number; endLine: number }
): TableData;
```

- `tableDataToGrid`: `columns` from `rows[0].cells` (id = `c${i}`, header = `cell.content`, alignment = `cell.alignment`); `rows` from `rows.slice(1)` (id = `r${i}`, `cells = { [c${j}]: cell.content }`).
- `gridToTableData`: rebuild header `TableRow` from `grid.columns` and data `TableRow[]` from `grid.rows`, then set `rawContent = tableToMarkdown(...)` and preserve `startLine`/`endLine`.
- Add unit tests to `tables.test.ts` mirroring the existing style (round-trip: `tableDataToGrid` → `gridToTableData` preserves content/alignment; markdown output identical for a plain table).

### 3. `src/components/TableEditorModal.tsx` — full rewrite

**State** (replaces `workingData: TableData | null`):
- `columns: GridColumn[]`
- `rows: GridRow[]`
- `history: TableGrid[]` + `historyIndex` (undo/redo snapshots of `{ columns, rows }`, MAX_HISTORY = 50)
- `editingCell: { rowId: string; colId: string } | null` + `editValue`
- `editingHeader: string | null` (colId) + `headerValue` (or reuse `editingCell` with an `isHeader` flag)
- `nextColId` / `nextRowId` via `useRef<number>` counters so ids never collide after deletions (do **not** derive ids from array length).

**TanStack wiring:**
```ts
const columnDefs = useMemo<ColumnDef<GridRow, string>[]>(() =>
  columns.map(c => ({
    id: c.id,
    accessorFn: (row) => row.cells[c.id] ?? '',
    header: () => <HeaderCell column={c} ... />,
    cell: (info) => <DataCell rowId={info.row.id} columnId={c.id} value={info.getValue()} ... />,
    meta: { alignment: c.alignment },
  })), [columns]);

const table = useReactTable({
  data: rows,
  columns: columnDefs,
  getCoreRowModel: getCoreRowModel(),
  getRowId: (row) => row.id,
});
```
Add the `ColumnMeta` module augmentation (in the modal file or a small `.d.ts`):
```ts
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> { alignment?: Alignment }
}
```

**Rendering:**
- `<thead>`: one `<tr>` = optional empty gutter `<th>` + `table.getHeaderGroups()[0].headers.map(h => flexRender(h.column.columnDef.header, h.getContext()))` + trailing `+` `<th>` (append column).
- `<tbody>`: `table.getRowModel().rows.map(row => <tr>` with leading gutter `<td>` (hover `×` delete row) + `row.getVisibleCells().map(cell => flexRender(cell.column.columnDef.cell, cell.getContext()))`.
- Bottom: an "Add row" bar (`<button>` full-width) below the table.

**Sub-components (defined in the same file):**
- `HeaderCell`: shows header text; on hover shows `×` (delete column, `stopPropagation`); click elsewhere enters single-line `<input>` edit (Enter commit / Esc cancel).
- `DataCell`: shows content (or "Empty" placeholder) with `whitespace-pre-wrap`; click enters auto-growing `<textarea wrap="soft">`.
- Auto-grow textarea: `onInput` set `style.height = 'auto'; style.height = scrollHeight + 'px'` with `min-height` of one line.

**Keyboard (preserve current flow):**
- Textarea/input: Enter = commit + move down; Tab = commit + move to next cell (wrap to next row); Esc = cancel edit. Enter must `preventDefault` in the textarea so no newline is inserted.
- Modal level: Esc (not editing) = close; Ctrl/Cmd+Z = undo; Ctrl/Cmd+Y = redo.

**Operations (all push a snapshot to history):**
- `appendColumn`: new `{ id: c${nextColId++}, header:'', alignment:null }` + add `''` key on every row.
- `appendRow`: new `{ id: r${nextRowId++}, cells: { [each colId]: '' } }`.
- `deleteColumn(colId)`: guard `columns.length > 1`; drop column + delete key from every row.
- `deleteRow(rowId)`: guard `rows.length >= 1` (preserve current "min one data row" behavior).
- `commitCell(rowId, colId, value)`, `commitHeader(colId, value)`.

**Save:** `gridToTableData({ columns, rows }, { startLine, endLine })` → `onSave(updated)` → `onCancel()` (unchanged from current `handleSave`).

### 4. `src/components/DocumentPreview.tsx` — no changes required
`TableEditorModal` props (`tableData`, `onSave`, `onCancel`) and the `TableData`/`replaceTableInContent` flow are unchanged.

## Pre-existing issues (note only; optional separate fix)

- `handleEditTable(0)` is hardcoded to table index 0 — clicking the edit button on any table always edits the first table. Fixing is out of scope for this change but should be a follow-up.
- `Array(n).fill({...})` shared-object references in `addRow`/`createEmptyTable` disappear as a side effect of the new grid model.

## Edge cases

- Delete last column blocked (min 1 column). Delete last data row blocked (min 1 data row) — matches current behavior.
- Cells containing `|` / `\`: existing `tableToMarkdown` escaping still applies. Parser does not unescape on read (pre-existing; out of scope).
- Empty cells show the "Empty" italic placeholder; empty string saved as empty cell.
- Header hover `×` and click-to-edit must not conflict: `×` uses `stopPropagation`.

## Validation

No test runner is configured, so:
1. `npx tsc --noEmit` — typecheck (strict mode; watch `noUnusedLocals`/`noUnusedParameters`).
2. `npm run build:frontend` — Vite production build.
3. `npm run tauri dev` — manual checks: edit a cell (long text wraps in the auto-grow textarea; Enter commits and moves down), edit a header (single-line), append/delete columns and rows via hover controls, undo/redo, save and confirm the preview updates and the raw markdown format is identical to before.

## Ordered task list

1. `npm install @tanstack/react-table`.
2. Add `Alignment` type, `GridColumn`, `GridRow`, `TableGrid`, `tableDataToGrid`, `gridToTableData` to `src/utils/tables.ts`; add round-trip tests to `tables.test.ts`.
3. Rewrite `TableEditorModal.tsx` using TanStack `useReactTable` with grid state, `flexRender`, header/gutter hover controls, and auto-grow textarea data cells.
4. Typecheck + build + manual verification per Validation above.
