interface ZoomControlsProps {
    zoomLevel: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onResetZoom: () => void;
    onExportMd?: () => void;
    minZoom?: number;
    maxZoom?: number;
}

export default function ZoomControls({
    zoomLevel,
    onZoomIn,
    onZoomOut,
    onResetZoom,
    onExportMd,
    minZoom = 0.3,
    maxZoom = 3.0,
}: ZoomControlsProps) {
    const zoomPercentage = Math.round(zoomLevel * 100);
    const canZoomIn = zoomLevel < maxZoom;
    const canZoomOut = zoomLevel > minZoom;

    return (
        <div className="flex items-center gap-2">
            <button
                className="w-8 h-8 bg-gray-200 text-gray-700 rounded flex items-center justify-center text-lg font-bold hover:bg-gray-300 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                onClick={onZoomOut}
                disabled={!canZoomOut}
                title="Zoom Out"
                aria-label="Zoom Out"
            >
                −
            </button>

            <div className="px-2 py-1 bg-gray-100 rounded text-sm font-medium">
                <span className="text-gray-700">{zoomPercentage}%</span>
            </div>

            <button
                className="w-8 h-8 bg-gray-200 text-gray-700 rounded flex items-center justify-center text-lg font-bold hover:bg-gray-300 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                onClick={onZoomIn}
                disabled={!canZoomIn}
                title="Zoom In"
                aria-label="Zoom In"
            >
                +
            </button>

            <button
                className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-sm font-medium hover:bg-gray-300 transition-colors"
                onClick={onResetZoom}
                title="Reset Zoom to 100%"
                aria-label="Reset Zoom"
            >
                100%
            </button>

            {onExportMd && (
                <button
                    className="w-8 h-8 bg-green-500 text-white rounded flex items-center justify-center text-sm hover:bg-green-600 transition-colors"
                    onClick={onExportMd}
                    title="Export Markdown"
                    aria-label="Export Markdown"
                >
                    ⬇️
                </button>
            )}
        </div>
    );
}
