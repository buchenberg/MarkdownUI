/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // You can add custom colors here if needed
            },
            fontFamily: {
                sans: [
                    '-apple-system',
                    'BlinkMacSystemFont',
                    '"Segoe UI"',
                    'Roboto',
                    'Oxygen',
                    'Ubuntu',
                    'Cantarell',
                    '"Fira Sans"',
                    '"Droid Sans"',
                    '"Helvetica Neue"',
                    'sans-serif',
                ],
                mono: [
                    'source-code-pro',
                    'Menlo',
                    'Monaco',
                    'Consolas',
                    '"Courier New"',
                    'monospace',
                ],
            },
        },
    },
    plugins: [],
}
