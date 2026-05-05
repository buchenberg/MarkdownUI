/**
 * Converts a heading text string into a URL-friendly slug, matching
 * GitHub Flavored Markdown heading anchor behaviour.
 *
 * Usage example:
 *   slugify("Hello World!")  → "hello-world"
 *   slugify("**Bold** Text") → "bold-text"
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")   // strip everything except letters, digits, spaces, hyphens
        .replace(/\s+/g, "-")            // collapse whitespace to hyphens
        .replace(/^-+|-+$/g, "");        // trim leading/trailing hyphens
}
