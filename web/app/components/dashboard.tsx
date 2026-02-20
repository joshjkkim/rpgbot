"use client"

import { useEffect, useRef, useState } from "react" 
import { useRouter } from "next/navigation"

export default function Dashboard() {
    const [guilds, setGuilds] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);
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
            } else {
                setError("Failed to fetch guilds.");
            }
        }
        fetchGuilds();
    }, []);

    async function handleClick(guild: any) {
        if(!guild.installed) {
            setError("This guild is not installed.");
            setTimeout
            return;
        }

        router.push(`/dashboard/${guild.id}`);
    }

    return (
        <div className="p-4">
            {error && <p className="text-red-500">{error}</p>}
            <ul className="flex inline-flex flex-col overflow-y-auto max-h-[80vh]">
                {guilds.map((guild) => (
                    <li 
                        onClick={() => handleClick(guild)} 
                        key={guild.id}
                        className={`bg-gray-800 text-shadow-lg m-2 p-2 rounded-lg cursor-pointer hover:underline transition-all duration-150 ease-in-out hover:bg-gray-700 hover:scale-101 ${guild.installed ? "font-bold" : ""}`}
                    >
                        {guild.name}
                    </li>
                ))}
            </ul>
        </div>
    )
}