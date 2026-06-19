interface SettingsRowProps {
    label: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
}

export default function SettingsRow({ label, icon, children }: SettingsRowProps) {
    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {icon && (
                        <span className="text-gray-400 flex-shrink-0">{icon}</span>
                    )}
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {label}
                    </span>
                </div>
                {children}
            </div>
        </div>
    );
}
