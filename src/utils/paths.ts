/** Return the parent path of a filesystem path, or null if it has no parent. */
export function getParentPath(path: string): string | null {
    const normalized = path.replace(/\\/g, "/");
    const idx = normalized.lastIndexOf("/");
    if (idx <= 0) return null;
    return normalized.slice(0, idx);
}
