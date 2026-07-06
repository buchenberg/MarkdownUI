import { slugify } from "./slugify";

export interface Heading {
    id: string;
    text: string;
    level: number;
}

/**
 * Parse markdown content into a list of headings with deduplicated ids.
 * When two headings have the same slug, later ones get `-1`, `-2` suffixes.
 */
export function parseHeadings(markdown: string): Heading[] {
    const counts = new Map<string, number>();
    const headings: Heading[] = [];
    for (const line of markdown.split("\n")) {
        const match = line.match(/^(#{1,6})\s+(.+)/);
        if (!match) continue;
        const level = match[1].length;
        const text = match[2].trim();
        let id = slugify(text);
        const count = counts.get(id) ?? 0;
        counts.set(id, count + 1);
        if (count > 0) id = `${id}-${count}`;
        headings.push({ id, text, level });
    }
    return headings;
}
