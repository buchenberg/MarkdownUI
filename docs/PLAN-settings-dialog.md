# Feature: Settings Dialog

## Overview

Add a settings dialog (modal) accessible via a cog/gear icon in the header bar. The dialog will organize configuration into sections. Initial sections replicate existing high-level controls:

| Section | Settings |
|---|---|
| **General** | Appearance (light/dark toggle) |
| **MCP Server** | On/off toggle, status indicator |

The high-level controls in the header bar remain in place — the settings dialog adds **duplicate** controls for discoverability and future expansion.

---

## Architecture

```
src/
  components/
    SettingsModal.tsx        # Settings dialog component (new)
      ├── SettingsSection.tsx  # Reusable section wrapper (new)
  contexts/
    SettingsContext.tsx      # Optional: centralised settings state (new)
  api.ts                     # (no changes — reuses existing MCP API)
  App.tsx                    # Open/close settings, wire MCP toggle
  index.css                  # Add settings-specific styles if needed
```

---

## Plan

### 1. Create `SettingsModal.tsx`

**Pattern:** Reuse the `ConfirmModal` overlay pattern (fixed overlay, centered card, click-outside-to-dismiss, stopPropagation on card).

**Props:**
```ts
interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    theme: 'light' | 'dark';
    onThemeChange: (theme: 'light' | 'dark') => void;
    mcpRunning: boolean;
    mcpPending: boolean;
    onMcpToggle: () => Promise<void>;
}
```

**Layout:**
```
+-------------------------------------------+
|  ⚙ Settings                          [×]  |
+-------------------------------------------+
|                                           |
|  General                                  |
|  ┌─────────────────────────────────────┐ |
|  │ Appearance  [○ Light  ● Dark]       │ |
|  └─────────────────────────────────────┘ |
|                                           |
|  MCP Server                               |
|  ┌─────────────────────────────────────┐ |
|  │ Server    [● Running / ○ Stopped]   │ |
|  │           [Toggle Button]           │ |
|  └─────────────────────────────────────┘ |
|                                           |
|  [+ Add Section]  ← placeholder for future|
|                                           |
+-------------------------------------------+
```

**Implementation details:**
- Header: cog icon (inline SVG), "Settings" title, close button (× icon or ESC key)
- Each section has a heading and a card (`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4`)
- **General > Appearance:** Two radio-style buttons (sun icon + "Light", moon icon + "Dark"), using existing `ThemeContext` pattern
- **MCP Server > Server:** Status dot + label (mirrors existing header MCP button), toggle button
- Escape key closes the modal (add `useEffect` with `keydown` listener)
- Focus trap is **out of scope** for v1

### 2. Create `SettingsSection.tsx` (optional but clean)

A thin wrapper to avoid repeating card styles:
```tsx
interface SettingsSectionProps {
    title: string;
    children: React.ReactNode;
}
```
Renders: `<h3>` heading + styled card div wrapping children.

### 3. Create `SettingsContext.tsx`

Centralise settings state so it can grow without prop-drilling through `App.tsx`:

```ts
interface SettingsContextValue {
    settingsOpen: boolean;
    openSettings: () => void;
    closeSettings: () => void;
    // Theme
    theme: 'light' | 'dark';
    setTheme: (t: 'light' | 'dark') => void;
    // MCP (delegated to App.tsx via callbacks)
    mcpRunning: boolean;
    mcpPending: boolean;
    handleMcpToggle: () => Promise<void>;
}
```

- `settingsOpen` stored in `useState` (modal is transient, no persistence needed)
- Theme uses existing `ThemeContext` (no change to persistence logic)
- MCP state/callbacks are passed through from `App.tsx`

**Why a context:** Even though v1 has only 2 sections, the settings area is explicitly meant to grow. A context prevents `App.tsx` from becoming a prop-funnel.

### 4. Wire into `App.tsx`

Changes to `App.tsx`:
1. Import `SettingsModal`, `SettingsProvider`, `useSettings`
2. Wrap the app content with `<SettingsProvider>` (passing existing MCP + theme state/callbacks)
3. Add a **cog icon button** to the unified header, positioned between the MCP toggle and theme toggle:
   ```tsx
   <button onClick={openSettings} title="Settings" className="...">
       {/* inline cog SVG */}
   </button>
   ```
4. Render `<SettingsModal>` at the bottom of the JSX tree (sibling to other modals)

**Cog SVG** (inline, no library):
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0
    11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0
    00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009
    19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65
    1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65
    1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0
    112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0
    001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001
    1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83
    2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0
    001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
</svg>
```

### 5. CSS / Styling

All styling via Tailwind utility classes. No new CSS rules needed unless a custom animation or transition is desired for the modal open/close.

Key Tailwind classes to reuse:
- Modal overlay: `fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center`
- Modal card: `bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto`
- Section card: `rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4`
- Toggle row: `flex items-center justify-between py-2`

### 6. Future Sections (placeholder, out of scope for this PR)

The settings dialog is designed to accept new sections easily:

| Planned Section | Settings |
|---|---|
| **Storage** | Database path, backup location, export format defaults |
| **Editor** | Font size, word wrap, line numbers (Monaco config) |
| **Preview** | Default zoom, Mermaid theme, syntax highlight theme |
| **Keyboard Shortcuts** | Custom keybindings |

Each new section is a new `<SettingsSection>` block inside `SettingsModal.tsx` — no structural changes needed.

---

## Testing Plan

| Test | Method |
|---|---|
| Cog button opens settings modal | Manual: click cog, verify modal visible |
| Settings modal closes on × button | Manual: click ×, verify modal hidden |
| Settings modal closes on Escape key | Manual: press ESC, verify modal hidden |
| Settings modal closes on backdrop click | Manual: click outside card, verify modal hidden |
| Theme toggle in settings changes app theme | Manual: toggle light↔dark, verify both header and settings reflect change |
| MCP toggle in settings starts/stops server | Manual: toggle on/off, verify status dot updates, MCP header button stays in sync |
| Settings modal renders in dark mode | Manual: switch to dark mode, verify all cards/text are readable |

**Automated tests:** Out of scope for v1. The project has no existing frontend test suite.

---

## Migration / Risk

| Risk | Mitigation |
|---|---|
| `ConfirmModal` pattern is untested | Copy its overlay logic verbatim; the pattern is simple (fixed overlay + centered card) |
| Prop-drilling through App.tsx grows messy | `SettingsContext` introduced to contain this |
| MCP toggle state desync between header and settings | Both read/write the same `mcpRunning`/`mcpPending` state from `App.tsx` |
| No icon library means duplicated SVG markup | Cog SVG is written once in the header button; future icons can be extracted to a shared `src/icons/` directory |

---

## Files to Create

| File | Purpose |
|---|---|
| `src/components/SettingsModal.tsx` | Settings dialog |
| `src/components/SettingsSection.tsx` | Reusable section card wrapper |
| `src/contexts/SettingsContext.tsx` | Settings state provider |

## Files to Modify

| File | Change |
|---|---|
| `src/App.tsx` | Import settings components, wrap with `SettingsProvider`, add cog button to header, render `<SettingsModal>` |
| `src/contexts/SettingsContext.tsx` | (new file, listed above) |

---

## Branch

`feature/settings-dialog` — created and active.
