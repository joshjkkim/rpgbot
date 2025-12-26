"use client"
// test configDisplay just to see if it renders properly

export default function ConfigDisplay({ config, section }: { config: any, section?: string }) {
    const visible = section ? config?.[section] : config;

    return (
        <section className="mt-6">
            <pre className="mt-3 max-h-[70vh] overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-900 whitespace-pre-wrap break-words">
            {JSON.stringify(visible, null, 2)}
            </pre>
        </section>
    );
}