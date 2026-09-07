"use client"

import { useEffect, useRef, useState } from "react";

export function useGuildConfig(guildId: string) {
    const [config, setConfig] = useState<any>(null);
    const [dbGuildId, setDbGuildId] = useState<number | null>(null);
    const [guild, setGuild] = useState<{ name: string | null; iconUrl: string | null }>({ name: null, iconUrl: null });
    // Hash of the config as loaded. Sent back on save so the server can reject
    // the write if the bot or another editor changed it in the meantime.
    const [version, setVersion] = useState<string | null>(null);
    const did = useRef<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    async function refresh() {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/discord/guilds/${guildId}/config`, { cache: "no-store" });
            if (!res.ok) throw new Error(`GET failed: ${res.status}`);

            const data = await res.json();
            setConfig(data.config);
            setDbGuildId(data.id);
            setGuild({ name: data.name ?? null, iconUrl: data.iconUrl ?? null });
            setVersion(data.version ?? null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function save(newConfig: any) {
        const toSave = newConfig ?? config;
        if(!toSave) return;

        setSaving(true);
        setError(null);

        try {
            const res = await fetch(`/api/discord/guilds/${guildId}/config`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ config: toSave, version }),
            });

            if (res.status === 409) {
                // Someone -- or the bot -- wrote first. Pull the current config
                // back so the page is not left showing a save that never landed.
                await refresh();
                throw new Error(
                    "These settings changed while you were editing them. The latest version has been loaded; please reapply your change."
                );
            }

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(`POST failed: ${res.status} ${text}`);
            }

            await refresh();
            return true;
        } catch (err: any) {
            setError(err.message);
            return false;
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        if(!guildId) return;
        if(did.current) return;
        did.current = true;
        refresh();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [guildId]);

    return { config, setConfig, dbGuildId, guild, version, loading, saving, error, refresh, save };
}