import { useEffect, useState, useRef, useCallback } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface McpEventPayload {
    operation: string;
    id: number;
    collection_id: number | null;
    name: string;
}

export interface McpEventDetail {
    id: number;
    operation: string;
    collectionId: number | null;
    name: string;
}

const ANIMATION_DURATION_MS = 3000;

export function useMcpEvents(enabled: boolean) {
    const [animatingIds, setAnimatingIds] = useState<Set<number>>(new Set());
    const [lastEvents, setLastEvents] = useState<McpEventDetail[]>([]);
    const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
    const eventsWindowRef = useRef<McpEventDetail[]>([]);

    // Clear old events from the window (keep last 3 seconds)
    const pruneEvents = useCallback(() => {
        const cutoff = Date.now() - 3000;
        eventsWindowRef.current = eventsWindowRef.current.filter(
            (e) => (e as any)._ts > cutoff
        );
        setLastEvents([...eventsWindowRef.current]);
    }, []);

    useEffect(() => {
        if (!enabled) return;

        let unlisten: UnlistenFn;

        const setup = async () => {
            unlisten = await listen<McpEventPayload>("mcp-operation", (event) => {
                const { id, collection_id, operation, name } = event.payload;

                // Add to animating set
                setAnimatingIds((prev) => {
                    const next = new Set(prev);
                    next.add(id);
                    if (collection_id != null) {
                        next.add(collection_id);
                    }
                    return next;
                });

                // Add to recent events window
                const detail: McpEventDetail & { _ts: number } = {
                    id,
                    operation,
                    collectionId: collection_id,
                    name,
                    _ts: Date.now(),
                };
                eventsWindowRef.current.push(detail);
                pruneEvents();

                // Clear existing timer for this ID (dedup)
                const existing = timersRef.current.get(id);
                if (existing) clearTimeout(existing);

                // Set expiration timer
                const timer = setTimeout(() => {
                    setAnimatingIds((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        if (collection_id != null) {
                            next.delete(collection_id);
                        }
                        return next;
                    });
                    timersRef.current.delete(id);
                }, ANIMATION_DURATION_MS);

                timersRef.current.set(id, timer);
            });
        };

        setup();

        return () => {
            unlisten?.();
            timersRef.current.forEach((t) => clearTimeout(t));
            timersRef.current.clear();
        };
    }, [enabled, pruneEvents]);

    return { animatingIds, lastEvents };
}
