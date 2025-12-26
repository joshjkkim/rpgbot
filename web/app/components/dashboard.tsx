"use client"

import { useEffect, useRef, useState } from "react" 
import { useRouter } from "next/navigation"

export default function Dashboard() {
    const [guilds, setGuilds] = useState<any[]>([]);
    const didFetch = useRef(false);
    const router = useRouter();

    useEffect(() => {
        if (didFetch.current) return;
        didFetch.current = true;

        async function fetchGuilds() {
            const res = await fetch("/api/discord/guilds");
            if (res.ok) {
                const data = await res.json();
                setGuilds(data);
            }
        }
        fetchGuilds();
    }, []);

    return (
        <div>
            <ul>
                {guilds.map((guild) => (
                    <li 
                        onClick={() => router.push(`/dashboard/${guild.id}`)} 
                        key={guild.id}
                        className={`cursor-pointer hover:underline ${guild.installed ? "font-bold" : ""}`}
                    >
                        {guild.name}
                    </li>
                ))}
            </ul>
        </div>
    )
}