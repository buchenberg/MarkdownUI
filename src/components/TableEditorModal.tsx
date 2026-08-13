import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTheme } from '../ThemeContext';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { CellContext, ColumnDef, HeaderContext, RowData } from '@tanstack/react-table';
import type { Alignment, TableData, TableGrid, GridColumn, GridRow } from '../utils/tables';
import { tableDataToGrid, gridToTableData } from '../utils/tables';

interface TableEditorModalProps {
  isOpen: boolean;
  tableData: TableData;
  onSave: (updatedTable: TableData) => void;
  onCancel: () => void;
}

type Theme = 'light' | 'dark';

type EditingCell = { rowId: string; colId: string };

// Maximum history states to keep for undo/redo
const MAX_HISTORY = 50;

// Stable placeholders used before the grid is initialised, so the table options
// don't churn on every render.
const EMPTY_ROWS: GridRow[] = [];
const EMPTY_GRID: TableGrid = { columns: [], rows: [] };

// Editing state + callbacks handed to the cell renderers through the table meta.
// This has to travel via meta rather than closures so the renderer component
// types stay referentially stable - see HeaderCellRenderer below.
interface TableEditorMeta {
  grid: TableGrid;
  editingCell: EditingCell | null;
  editingHeader: string | null;
  editValue: string;
  theme: Theme;
  setEditValue: (value: string) => void;
  startEditingCell: (rowId: string, colId: string, value: string) => void;
  startEditingHeader: (colId: string, value: string) => void;
  onCellKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    rowId: string,
    colId: string
  ) => void;
  onHeaderKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, colId: string) => void;
  commitPendingEdit: () => void;
  deleteColumn: (colId: string) => void;
}

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    alignment?: Alignment;
  }

  interface TableMeta<TData extends RowData> {
    editor: TableEditorMeta;
  }
}

interface HeaderCellProps {
  column: GridColumn;
  isEditing: boolean;
  editValue: string;
  canDelete: boolean;
  theme: Theme;
  onChange: (value: string) => void;
  onStartEdit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onDelete: () => void;
}

function HeaderCell({
  column,
  isEditing,
  editValue,
  canDelete,
  theme,
  onChange,
  onStartEdit,
  onKeyDown,
  onBlur,
  onDelete,
}: HeaderCellProps) {
  return (
    <div
      className="relative group flex items-center"
      onClick={isEditing ? undefined : onStartEdit}
    >
      {isEditing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          className={`w-full p-1 rounded outline-none font-semibold ${
            theme === 'dark'
              ? 'bg-gray-900 text-gray-100 border border-blue-500'
              : 'bg-white text-gray-900 border border-blue-500'
          }`}
        />
      ) : (
        <span className="block min-h-[1.5em] font-semibold whitespace-pre-wrap">
          {column.header || (
            <span className={`italic ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
              Empty
            </span>
          )}
        </span>
      )}

      {!isEditing && column.alignment && (
        <span className="absolute top-1 right-1 text-[10px] text-gray-400 group-hover:hidden">
          {column.alignment === 'left' ? '←' : column.alignment === 'right' ? '→' : '↔'}
        </span>
      )}

      {!isEditing && canDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={`absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 rounded ${
            theme === 'dark'
              ? 'text-gray-400 hover:text-red-400 hover:bg-gray-700'
              : 'text-gray-500 hover:text-red-500 hover:bg-gray-200'
          }`}
          title="Delete column"
          aria-label="Delete column"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

interface DataCellProps {
  value: string;
  isEditing: boolean;
  editValue: string;
  theme: Theme;
  onChange: (value: string) => void;
  onStartEdit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur: () => void;
}

function DataCell({
  value,
  isEditing,
  editValue,
  theme,
  onChange,
  onStartEdit,
  onKeyDown,
  onBlur,
}: DataCellProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [isEditing, editValue]);

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        value={editValue}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onClick={(e) => e.stopPropagation()}
        rows={1}
        wrap="soft"
        autoFocus
        className={`w-full p-1 rounded outline-none resize-none overflow-hidden leading-snug ${
          theme === 'dark'
            ? 'bg-gray-900 text-gray-100 border border-blue-500'
            : 'bg-white text-gray-900 border border-blue-500'
        }`}
      />
    );
  }

  return (
    <span
      className="block min-h-[1.5em] whitespace-pre-wrap cursor-text"
      onClick={onStartEdit}
    >
      {value || (
        <span className={`italic ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
          Empty
        </span>
      )}
    </span>
  );
}

// flexRender calls createElement(headerOrCell, context), so the function stored on
// the column def IS the React element type. It must be a stable module-level
// component: an inline arrow would be a new type on every render, remounting the
// input/textarea mid-edit and resetting the caret to position 0.
function HeaderCellRenderer({ table, column }: HeaderContext<GridRow, string>) {
  const editor = table.options.meta?.editor;
  const gridColumn = editor?.grid.columns.find((c) => c.id === column.id);
  if (!editor || !gridColumn) return null;

  return (
    <HeaderCell
      column={gridColumn}
      isEditing={editor.editingHeader === gridColumn.id}
      editValue={editor.editValue}
      canDelete={editor.grid.columns.length > 1}
      theme={editor.theme}
      onChange={editor.setEditValue}
      onStartEdit={() => editor.startEditingHeader(gridColumn.id, gridColumn.header)}
      onKeyDown={(e) => editor.onHeaderKeyDown(e, gridColumn.id)}
      onBlur={editor.commitPendingEdit}
      onDelete={() => editor.deleteColumn(gridColumn.id)}
    />
  );
}

function DataCellRenderer({ table, row, column, getValue }: CellContext<GridRow, string>) {
  const editor = table.options.meta?.editor;
  if (!editor) return null;

  const value = getValue();

  return (
    <DataCell
      value={value}
      isEditing={
        editor.editingCell?.rowId === row.id && editor.editingCell?.colId === column.id
      }
      editValue={editor.editValue}
      theme={editor.theme}
      onChange={editor.setEditValue}
      onStartEdit={() => editor.startEditingCell(row.id, column.id, value)}
      onKeyDown={(e) => editor.onCellKeyDown(e, row.id, column.id)}
      onBlur={editor.commitPendingEdit}
    />
  );
}

export default function TableEditorModal({
  isOpen,
  tableData,
  onSave,
  onCancel,
}: TableEditorModalProps) {
  const { theme } = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);

  // Working grid state
  const [grid, setGrid] = useState<TableGrid | null>(null);

  // Undo/redo history
  const [history, setHistory] = useState<TableGrid[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Editing state
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [editingHeader, setEditingHeader] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Monotonic id counters so ids never collide after deletions
  const nextColIdRef = useRef(0);
  const nextRowIdRef = useRef(0);

  // Refs mirroring latest state so blur/save can commit without stale closures.
  const gridRef = useRef<TableGrid | null>(null);
  const editingCellRef = useRef<{ rowId: string; colId: string } | null>(null);
  const editingHeaderRef = useRef<string | null>(null);
  const editValueRef = useRef<string>('');
  gridRef.current = grid;
  editingCellRef.current = editingCell;
  editingHeaderRef.current = editingHeader;
  editValueRef.current = editValue;

  // Initialize working grid when modal opens
  useEffect(() => {
    if (isOpen && tableData) {
      const initial = tableDataToGrid(tableData);
      setGrid(initial);
      setHistory([initial]);
      setHistoryIndex(0);
      setEditingCell(null);
      setEditingHeader(null);
      setEditValue('');
      nextColIdRef.current = initial.columns.length;
      nextRowIdRef.current = initial.rows.length;
    }
  }, [isOpen, tableData]);

  const pushHistory = useCallback(
    (newGrid: TableGrid) => {
      setHistory((prev) => {
        const next = [...prev.slice(0, historyIndex + 1), newGrid];
        return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
      });
      setHistoryIndex((prev) => prev + 1);
      setGrid(newGrid);
    },
    [historyIndex]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const index = historyIndex - 1;
      setHistoryIndex(index);
      setGrid(history[index]);
      setEditingCell(null);
      setEditingHeader(null);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const index = historyIndex + 1;
      setHistoryIndex(index);
      setGrid(history[index]);
      setEditingCell(null);
      setEditingHeader(null);
    }
  }, [history, historyIndex]);

  const cancelEditing = useCallback(() => {
    setEditingCell(null);
    setEditingHeader(null);
  }, []);

  const isEditing = editingCell !== null || editingHeader !== null;

  // Close modal on escape, handle undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditing) {
          cancelEditing();
        } else {
          onCancel();
        }
      }

      if ((e.ctrlKey || e.metaKey) && !isEditing) {
        if (e.key === 'z') {
          e.preventDefault();
          handleUndo();
        }
        if (e.key === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isEditing, onCancel, cancelEditing, handleUndo, handleRedo]);

  // ---- Editing entry points ----
  const startEditingCell = useCallback((rowId: string, colId: string, value: string) => {
    setEditingHeader(null);
    setEditingCell({ rowId, colId });
    setEditValue(value);
  }, []);

  const startEditingHeader = useCallback((colId: string, value: string) => {
    setEditingCell(null);
    setEditingHeader(colId);
    setEditValue(value);
  }, []);

  // ---- Commit operations ----
  const commitCell = useCallback(
    (rowId: string, colId: string, value: string) => {
      const current = gridRef.current;
      if (!current) return;
      const newGrid: TableGrid = {
        columns: current.columns,
        rows: current.rows.map((row) =>
          row.id === rowId ? { ...row, cells: { ...row.cells, [colId]: value } } : row
        ),
      };
      pushHistory(newGrid);
      setEditingCell(null);
    },
    [pushHistory]
  );

  const commitHeader = useCallback(
    (colId: string, value: string) => {
      const current = gridRef.current;
      if (!current) return;
      const newGrid: TableGrid = {
        columns: current.columns.map((column) =>
          column.id === colId ? { ...column, header: value } : column
        ),
        rows: current.rows,
      };
      pushHistory(newGrid);
      setEditingHeader(null);
    },
    [pushHistory]
  );

  const commitPendingEdit = useCallback(() => {
    const cell = editingCellRef.current;
    const header = editingHeaderRef.current;
    if (cell) {
      commitCell(cell.rowId, cell.colId, editValueRef.current);
    } else if (header) {
      commitHeader(header, editValueRef.current);
    }
  }, [commitCell, commitHeader]);

  // ---- Add / delete operations ----
  const addColumn = useCallback(() => {
    if (!grid) return;
    const id = `c${nextColIdRef.current++}`;
    const newGrid: TableGrid = {
      columns: [...grid.columns, { id, header: '', alignment: null }],
      rows: grid.rows.map((row) => ({ ...row, cells: { ...row.cells, [id]: '' } })),
    };
    pushHistory(newGrid);
  }, [grid, pushHistory]);

  const addRow = useCallback(
    (afterIndex?: number) => {
      if (!grid) return;
      const id = `r${nextRowIdRef.current++}`;
      const cells: Record<string, string> = {};
      for (const column of grid.columns) cells[column.id] = '';
      const rows = [...grid.rows];
      const insertAt = afterIndex === undefined ? rows.length : afterIndex + 1;
      rows.splice(insertAt, 0, { id, cells });
      const newGrid: TableGrid = {
        columns: grid.columns,
        rows,
      };
      pushHistory(newGrid);
    },
    [grid, pushHistory]
  );

  const deleteColumn = useCallback(
    (colId: string) => {
      if (!grid || grid.columns.length <= 1) return;
      const newGrid: TableGrid = {
        columns: grid.columns.filter((column) => column.id !== colId),
        rows: grid.rows.map((row) => {
          const cells = { ...row.cells };
          delete cells[colId];
          return { ...row, cells };
        }),
      };
      pushHistory(newGrid);
      setEditingCell((cell) => (cell && cell.colId === colId ? null : cell));
      setEditingHeader((header) => (header === colId ? null : header));
    },
    [grid, pushHistory]
  );

  const deleteRow = useCallback(
    (rowId: string) => {
      if (!grid || grid.rows.length <= 1) return;
      const newGrid: TableGrid = {
        columns: grid.columns,
        rows: grid.rows.filter((row) => row.id !== rowId),
      };
      pushHistory(newGrid);
      setEditingCell((cell) => (cell && cell.rowId === rowId ? null : cell));
    },
    [grid, pushHistory]
  );

  // ---- Cell / header keyboard handling ----
  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>, rowId: string, colId: string) => {
      if (!grid) return;
      const colIndex = grid.columns.findIndex((column) => column.id === colId);
      const rowIndex = grid.rows.findIndex((row) => row.id === rowId);

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          commitCell(rowId, colId, editValue);
          if (rowIndex >= 0 && rowIndex < grid.rows.length - 1) {
            const nextRow = grid.rows[rowIndex + 1];
            startEditingCell(nextRow.id, colId, nextRow.cells[colId] ?? '');
          }
          break;
        case 'Tab': {
          e.preventDefault();
          commitCell(rowId, colId, editValue);
          let nextCol = colIndex + 1;
          let nextRow = rowIndex;
          if (nextCol >= grid.columns.length) {
            nextCol = 0;
            nextRow += 1;
          }
          if (nextRow >= 0 && nextRow < grid.rows.length) {
            const targetRow = grid.rows[nextRow];
            const targetColumn = grid.columns[nextCol];
            startEditingCell(
              targetRow.id,
              targetColumn.id,
              targetRow.cells[targetColumn.id] ?? ''
            );
          }
          break;
        }
        case 'Escape':
          e.preventDefault();
          cancelEditing();
          break;
      }
    },
    [grid, editValue, commitCell, startEditingCell, cancelEditing]
  );

  const handleHeaderKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, colId: string) => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          commitHeader(colId, editValue);
          break;
        case 'Tab':
          e.preventDefault();
          commitHeader(colId, editValue);
          break;
        case 'Escape':
          e.preventDefault();
          cancelEditing();
          break;
      }
    },
    [editValue, commitHeader, cancelEditing]
  );

  // ---- Save ----
  const handleSave = useCallback(() => {
    const base = gridRef.current;
    if (!base) return;

    let finalGrid: TableGrid = base;
    const cell = editingCellRef.current;
    const header = editingHeaderRef.current;
    const value = editValueRef.current;

    if (cell) {
      finalGrid = {
        columns: base.columns,
        rows: base.rows.map((row) =>
          row.id === cell.rowId
            ? { ...row, cells: { ...row.cells, [cell.colId]: value } }
            : row
        ),
      };
    } else if (header) {
      finalGrid = {
        columns: base.columns.map((column) =>
          column.id === header ? { ...column, header: value } : column
        ),
        rows: base.rows,
      };
    }

    const updatedTable = gridToTableData(finalGrid, {
      startLine: tableData.startLine,
      endLine: tableData.endLine,
    });
    onSave(updatedTable);
    onCancel();
  }, [tableData, onSave, onCancel]);

  // Build column definitions (before any early return so hooks stay unconditional).
  // Only the column shape lives here - all editing state travels through the table
  // meta below, which keeps these defs (and the renderer element types) stable
  // while the user is typing.
  const columnDefs = useMemo<ColumnDef<GridRow, string>[]>(
    () =>
      grid
        ? grid.columns.map((column) => ({
            id: column.id,
            accessorFn: (row: GridRow) => row.cells[column.id] ?? '',
            header: HeaderCellRenderer,
            cell: DataCellRenderer,
            meta: { alignment: column.alignment },
          }))
        : [],
    [grid]
  );

  const table = useReactTable<GridRow>({
    data: grid?.rows ?? EMPTY_ROWS,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    meta: {
      editor: {
        grid: grid ?? EMPTY_GRID,
        editingCell,
        editingHeader,
        editValue,
        theme,
        setEditValue,
        startEditingCell,
        startEditingHeader,
        onCellKeyDown: handleCellKeyDown,
        onHeaderKeyDown: handleHeaderKeyDown,
        commitPendingEdit,
        deleteColumn,
      },
    },
  });

  if (!isOpen || !grid) return null;

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onCancel}
    >
      <div
        ref={modalRef}
        className={`w-full h-full flex flex-col p-6 ${
          theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-editor-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 id="table-editor-title" className="text-lg font-semibold">
            Edit Table
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className={`px-2 py-1 text-xs rounded ${
                canUndo
                  ? theme === 'dark'
                    ? 'bg-gray-700 hover:bg-gray-600'
                    : 'bg-gray-200 hover:bg-gray-300'
                  : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }`}
              title="Undo (Ctrl+Z / Cmd+Z)"
            >
              <kbd className={theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Ctrl+Z</kbd>
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className={`px-2 py-1 text-xs rounded ${
                canRedo
                  ? theme === 'dark'
                    ? 'bg-gray-700 hover:bg-gray-600'
                    : 'bg-gray-200 hover:bg-gray-300'
                  : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }`}
              title="Redo (Ctrl+Y / Cmd+Y)"
            >
              <kbd className={theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Ctrl+Y</kbd>
            </button>
            <button
              onClick={onCancel}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              title="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Table Editor */}
        <div className="flex-1 overflow-auto mb-4">
          <table
            className={`w-full border-collapse ${
              theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
            }`}
          >
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  <th
                    className={`w-10 p-1 border ${
                      theme === 'dark'
                        ? 'bg-gray-800 border-gray-700'
                        : 'bg-gray-100 border-gray-300'
                    }`}
                  />
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={`p-2 text-left font-semibold relative ${
                        theme === 'dark'
                          ? 'bg-gray-800 border border-gray-700'
                          : 'bg-gray-100 border border-gray-300'
                      }`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                  <th
                    className={`w-16 p-1 border ${
                      theme === 'dark'
                        ? 'bg-gray-800 border-gray-700'
                        : 'bg-gray-100 border-gray-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={addColumn}
                      title="Add column"
                      aria-label="Add column"
                      className={`w-full h-full flex items-center justify-center rounded ${
                        theme === 'dark'
                          ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  </th>
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b">
                  <td
                    className={`w-10 p-1 border text-center ${
                      theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
                    }`}
                  >
                    <span
                      className={`text-xs ${
                        theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                      }`}
                    >
                      {row.index + 1}
                    </span>
                  </td>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`p-2 relative ${
                        theme === 'dark' ? 'border border-gray-700' : 'border border-gray-300'
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                  <td
                    className={`w-16 p-1 border ${
                      theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => deleteRow(row.id)}
                        disabled={grid.rows.length <= 1}
                        title={
                          grid.rows.length <= 1
                            ? 'Cannot delete - at least one data row required'
                            : 'Delete row'
                        }
                        aria-label="Delete row"
                        className={`p-0.5 rounded ${
                          grid.rows.length <= 1
                            ? 'opacity-40 cursor-not-allowed'
                            : theme === 'dark'
                              ? 'text-gray-400 hover:text-red-400 hover:bg-gray-700'
                              : 'text-gray-500 hover:text-red-500 hover:bg-gray-200'
                        }`}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => addRow(row.index)}
                        title="Add row below"
                        aria-label="Add row below"
                        className={`p-0.5 rounded ${
                          theme === 'dark'
                            ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td
                  className={`w-10 p-1 border ${
                    theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
                  }`}
                />
                <td
                  colSpan={grid.columns.length}
                  className={`p-1 border ${
                    theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
                  }`}
                />
                <td
                  className={`w-16 p-1 border ${
                    theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => addRow()}
                    title="Add row"
                    aria-label="Add row"
                    className={`w-full h-full flex items-center justify-center rounded ${
                      theme === 'dark'
                        ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className={`px-4 py-2 text-sm rounded transition-colors ${
              theme === 'dark'
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded transition-colors bg-blue-600 hover:bg-blue-700 text-white"
          >
            Save
          </button>
        </div>

        {/* Keyboard hints */}
        <div className="mt-2 text-xs text-gray-400 dark:text-gray-500 text-right">
          <kbd className="px-1 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">Enter</kbd> save,
          <kbd className="px-1 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">Tab</kbd> next,
          <kbd className="px-1 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">Esc</kbd> cancel
        </div>
      </div>
    </div>
  );
}
