"use client"

export default function ConfigDisplay({ config }: { config: unknown }) {

    return (
        <pre className="max-h-[70vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 text-xs whitespace-pre-wrap break-words">
            {JSON.stringify(config, null, 2)}
        </pre>
    );
}
