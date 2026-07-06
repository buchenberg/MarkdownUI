import { useEffect, useRef, useState } from "react";

interface InlineRenameProps {
    initialValue: string;
    onCommit: (value: string) => void;
    onCancel: () => void;
    className?: string;
}

export default function InlineRename({
    initialValue,
    onCommit,
    onCancel,
    className,
}: InlineRenameProps) {
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef<HTMLInputElement>(null);
    const committedRef = useRef(false);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const commit = () => {
        if (committedRef.current) return;
        committedRef.current = true;
        onCommit(value.trim() || initialValue);
    };

    return (
        <input
            ref={inputRef}
            type="text"
            className={className}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    commit();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    if (committedRef.current) return;
                    committedRef.current = true;
                    onCancel();
                }
            }}
            onBlur={commit}
        />
    );
}
