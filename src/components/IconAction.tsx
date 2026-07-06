interface IconActionProps {
    title: string;
    onClick: () => void;
    danger?: boolean;
    children: React.ReactNode;
}

export default function IconAction({ title, onClick, danger, children }: IconActionProps) {
    return (
        <button
            title={title}
            onClick={onClick}
            className={`p-0.5 rounded transition-colors ${
                danger
                    ? "text-gray-400 dark:text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-red-500 dark:hover:text-red-400"
                    : "text-gray-400 dark:text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-blue-500 dark:hover:text-blue-400"
            }`}
        >
            <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                {children}
            </svg>
        </button>
    );
}
