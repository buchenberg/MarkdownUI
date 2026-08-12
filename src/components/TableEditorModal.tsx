import { useState, useRef, useEffect, useCallback } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTheme } from '../ThemeContext';
import type { TableData, TableRow, TableCell } from '../utils/tables';
import { cloneTableData, tableToMarkdown, createEmptyTable } from '../utils/tables';

interface TableEditorModalProps {
  isOpen: boolean;
  tableData: TableData;
  onSave: (updatedTable: TableData) => void;
  onCancel: () => void;
}

// Maximum history states to keep for undo/redo
const MAX_HISTORY = 50;

export default function TableEditorModal({
  isOpen,
  tableData,
  onSave,
  onCancel,
}: TableEditorModalProps) {
  const { theme } = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);
  
  // Working copy of table data
  const [workingData, setWorkingData] = useState<TableData | null>(null);
  
  // Undo/redo history
  const [history, setHistory] = useState<TableData[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  
  // Cell editing state
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  
  // Initialize working data when modal opens
  useEffect(() => {
    if (isOpen && tableData) {
      const cloned = cloneTableData(tableData);
      setWorkingData(cloned);
      setHistory([cloned]);
      setHistoryIndex(0);
      setEditingCell(null);
    }
  }, [isOpen, tableData]);
  
  // Close modal on escape, handle undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingCell) {
          setEditingCell(null);
        } else {
          onCancel();
        }
      }
      
      // Handle undo/redo with Ctrl+Z/Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && !editingCell) {
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
  }, [isOpen, editingCell, onCancel, handleUndo, handleRedo]);
  
  // Save current state to history
  const saveToHistory = useCallback((newData: TableData) => {
    setHistory(prev => {
      const newHistory = [...prev.slice(0, historyIndex + 1), cloneTableData(newData)];
      // Trim history if too long
      if (newHistory.length > MAX_HISTORY) {
        return newHistory.slice(newHistory.length - MAX_HISTORY);
      }
      return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
    setWorkingData(newData);
  }, [historyIndex]);
  
  // Handle undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setWorkingData(history[newIndex]);
      setEditingCell(null);
    }
  }, [history, historyIndex]);
  
  // Handle redo
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setWorkingData(history[newIndex]);
      setEditingCell(null);
    }
  }, [history, historyIndex]);
  
  // Start editing a cell
  const startEditing = useCallback((row: number, col: number) => {
    if (!workingData) return;
    setEditingCell({ row, col });
    setEditValue(workingData.rows[row].cells[col].content);
  }, [workingData]);
  
  // Save cell edit
  const saveCellEdit = useCallback(() => {
    if (!workingData || !editingCell) return;
    
    const newData = cloneTableData(workingData);
    newData.rows[editingCell.row].cells[editingCell.col].content = editValue;
    saveToHistory(newData);
    setEditingCell(null);
  }, [workingData, editingCell, editValue, saveToHistory]);
  
  // Cancel cell edit
  const cancelCellEdit = useCallback(() => {
    setEditingCell(null);
  }, []);
  
  // Handle cell input key down
  const handleCellKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!workingData || !editingCell) return;
    
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        saveCellEdit();
        // Move to next cell
        if (editingCell.row < workingData.rows.length - 1) {
          startEditing(editingCell.row + 1, editingCell.col);
        }
        break;
      case 'Tab':
        e.preventDefault();
        saveCellEdit();
        // Move to next cell in row, or next row
        if (editingCell.col < workingData.rows[editingCell.row].cells.length - 1) {
          startEditing(editingCell.row, editingCell.col + 1);
        } else if (editingCell.row < workingData.rows.length - 1) {
          startEditing(editingCell.row + 1, 0);
        }
        break;
      case 'Escape':
        e.preventDefault();
        cancelCellEdit();
        break;
    }
  }, [workingData, editingCell, saveCellEdit, cancelCellEdit, startEditing]);
  
  // Add a new row
  const addRow = useCallback((insertAt?: number) => {
    if (!workingData) return;
    
    const newData = cloneTableData(workingData);
    const at = insertAt !== undefined ? insertAt : newData.rows.length;
    
    const colCount = newData.rows[0].cells.length;
    const newRow: TableRow = {
      isHeader: false,
      cells: Array(colCount).fill({ content: '', alignment: null })
    };
    
    newData.rows.splice(at, 0, newRow);
    saveToHistory(newData);
  }, [workingData, saveToHistory]);
  
  // Delete a row
  const deleteRow = useCallback((rowIndex: number) => {
    if (!workingData || workingData.rows.length <= 1) return;
    
    const newData = cloneTableData(workingData);
    newData.rows.splice(rowIndex, 1);
    saveToHistory(newData);
    
    // If we were editing this row, clear the edit
    if (editingCell && editingCell.row >= rowIndex) {
      setEditingCell(null);
    }
  }, [workingData, editingCell, saveToHistory]);
  
  // Add a new column
  const addColumn = useCallback((insertAt?: number) => {
    if (!workingData) return;
    
    const newData = cloneTableData(workingData);
    const at = insertAt !== undefined ? insertAt : newData.rows[0].cells.length;
    
    for (const row of newData.rows) {
      row.cells.splice(at, 0, { content: '', alignment: null });
    }
    
    saveToHistory(newData);
  }, [workingData, saveToHistory]);
  
  // Delete a column
  const deleteColumn = useCallback((colIndex: number) => {
    if (!workingData || workingData.rows[0].cells.length <= 1) return;
    
    const newData = cloneTableData(workingData);
    for (const row of newData.rows) {
      row.cells.splice(colIndex, 1);
    }
    saveToHistory(newData);
    
    // If we were editing this column or beyond, clear the edit
    if (editingCell && editingCell.col >= colIndex) {
      setEditingCell(null);
    }
  }, [workingData, editingCell, saveToHistory]);
  
  // Save changes
  const handleSave = useCallback(() => {
    if (!workingData) return;
    // Update rawContent with the current markdown representation
    const updatedTable = {
      ...workingData,
      rawContent: tableToMarkdown(workingData)
    };
    onSave(updatedTable);
    onCancel();
  }, [workingData, onSave, onCancel]);
  
  if (!isOpen || !workingData) return null;
  
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const colCount = workingData.rows[0]?.cells.length || 0;
  
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onCancel}
    >
      <div
        ref={modalRef}
        className={`rounded-lg shadow-lg p-6 max-w-2xl w-[90vw] max-h-[90vh] flex flex-col ${
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
          <div className="relative">
            <table
              className={`w-full border-collapse ${
                theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
              }`}
            >
              <thead>
                {workingData.rows.map((row, rowIndex) => (
                  row.isHeader ? (
                    <tr key={rowIndex} className="border-b">
                      {row.cells.map((cell, colIndex) => (
                        <th
                          key={colIndex}
                          className={`p-2 text-left font-semibold relative ${
                            theme === 'dark' 
                              ? 'bg-gray-800 border border-gray-700' 
                              : 'bg-gray-100 border border-gray-300'
                          }`}
                          onClick={() => startEditing(rowIndex, colIndex)}
                        >
                          {editingCell?.row === rowIndex && editingCell?.col === colIndex ? (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleCellKeyDown}
                              onClick={(e) => e.stopPropagation()}
                              className={`w-full p-1 rounded outline-none ${
                                theme === 'dark' 
                                  ? 'bg-gray-900 text-gray-100 border border-blue-500' 
                                  : 'bg-white text-gray-900 border border-blue-500'
                              }`}
                              autoFocus
                            />
                          ) : (
                            <span className="block min-h-[1.5em]">
                              {cell.content || <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>}
                            </span>
                          )}
                          {/* Alignment indicator */}
                          {cell.alignment && (
                            <span className="absolute top-1 right-1 text-[10px] text-gray-400">
                              {cell.alignment === 'left' ? '←' : 
                               cell.alignment === 'right' ? '→' : '↔'}
                            </span>
                          )}
                        </th>
                      ))}
                      {/* Add column button (header row) */}
                      <th className="w-8 p-1">
                        <button
                          onClick={() => addColumn()}
                          className={`w-full h-full flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
                            theme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                          }`}
                          title="Add column"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                      </th>
                    </tr>
                  ) : null
                ))}
              </thead>
              <tbody>
                {workingData.rows.map((row, rowIndex) => (
                  !row.isHeader && (
                    <tr key={rowIndex} className="border-b">
                      {row.cells.map((cell, colIndex) => (
                        <td
                          key={colIndex}
                          className={`p-2 relative ${
                            theme === 'dark' 
                              ? 'border border-gray-700' 
                              : 'border border-gray-300'
                          }`}
                          onClick={() => startEditing(rowIndex, colIndex)}
                        >
                          {editingCell?.row === rowIndex && editingCell?.col === colIndex ? (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleCellKeyDown}
                              onClick={(e) => e.stopPropagation()}
                              className={`w-full p-1 rounded outline-none ${
                                theme === 'dark' 
                                  ? 'bg-gray-900 text-gray-100 border border-blue-500' 
                                  : 'bg-white text-gray-900 border border-blue-500'
                              }`}
                              autoFocus
                            />
                          ) : (
                            <span className="block min-h-[1.5em]">
                              {cell.content || <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>}
                            </span>
                          )}
                        </td>
                      ))}
                      {/* Row actions */}
                      <td className="w-8 p-1">
                        <div className="flex flex-col gap-0.5 h-full">
                          <button
                            onClick={() => addRow(rowIndex)}
                            className={`flex-1 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
                              theme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                            }`}
                            title="Add row"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteRow(rowIndex)}
                            disabled={workingData.rows.length <= 2} // Keep at least header + 1 row
                            className={`flex-1 flex items-center justify-center rounded ${
                              workingData.rows.length <= 2
                                ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                : theme === 'dark'
                                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' 
                                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                            }`}
                            title={workingData.rows.length <= 2 ? 'Cannot delete - at least one data row required' : 'Delete row'}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
            
            {/* Column deletion buttons (below header) */}
            {colCount > 1 && (
              <div className="flex gap-1 mt-2">
                {workingData.rows[0]?.cells.map((_, colIndex) => (
                  <button
                    key={colIndex}
                    onClick={() => deleteColumn(colIndex)}
                    className={`px-2 py-1 text-xs rounded ${
                      theme === 'dark'
                        ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-300'
                    }`}
                    title={`Delete column ${colIndex + 1}`}
                  >
                    Col {colIndex + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
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
