interface SegmentedToggleOption<T extends string> {
    value: T;
    label: string;
    icon?: React.ReactNode;
}

interface SegmentedToggleProps<T extends string> {
    options: SegmentedToggleOption<T>[];
    value: T;
    onChange: (value: T) => void;
    size?: 'sm' | 'md';
}

export default function SegmentedToggle<T extends string>({
    options,
    value,
    onChange,
    size = 'sm',
}: SegmentedToggleProps<T>) {
    const padding = size === 'md' ? 'px-4 py-2' : 'px-3 py-1.5';
    const textSize = size === 'md' ? 'text-sm' : 'text-xs';

    return (
        <div className="flex items-center gap-1 bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5">
            {options.map((opt) => (
                <button
                    key={opt.value}
                    onClick={() => onChange(opt.value)}
                    className={`${padding} ${textSize} font-medium rounded-md transition-colors ${
                        value === opt.value
                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                >
                    <span className="flex items-center gap-1.5">
                        {opt.icon}
                        {opt.label}
                    </span>
                </button>
            ))}
        </div>
    );
}
