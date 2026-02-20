"use client"

import { signIn, signOut, useSession } from "next-auth/react";

export default function Home() {
  const { data: session } = useSession();

  return (
    <main className="min-h-screen bg-gradient-to-tr from-black via-black to-blue-900 overflow-x-hidden">
      <div className="absolute inset-0 min-w-screen max-h-[10vh] p-6 flex items-center justify-end bg-black/35">
         {session ? (
          <div className="flex flex-row min-w-full">
            <p className="bg-white/10 p-2 rounded-lg">Signed in as {session.user?.name}</p>
            <div className="flex flex-row inset-0 absolute min-w-full p-5 gap-4 justify-end">
              <button className="bg-gradient-to-r from-blue-800 to-blue-900 p-2 rounded-lg shadow-xl transition-all duration-180 ease-in hover:from-blue-100 hover:to-blue-200 hover:text-black" onClick={() => window.location.href = '/dashboard'}>Dashboard</button>
              <button className="bg-gradient-to-r from-red-800 to-red-900 p-2 rounded-lg shadow-xl transition-all duration-180 ease-in hover:from-red-100 hover:to-red-200 hover:text-black" onClick={() => signOut()}>Sign out</button>
            </div>
          </div>
        ) : (
          <button 
          className="bg-[#7289da] p-2 rounded-lg shadow-lg shadow-lg transition-all duration-300 hover:scale-102 hover:bg-[#5b6eae]"
          onClick={() => signIn("discord")}
          >
            Sign in with Discord
            </button>
        )}
      </div>

      <div className="flex-1 flex min-h-screen items-center justify-center">
        <div className="text-center p-10 bg-gradient-to-tr z-10 rounded-xl to-blue-900 via-black from-black">
          <h1 className="text-white text-4xl">Blah Blah</h1>
        </div>
      </div>
     
    </main>
  );
}
