"use client";
import { useEffect } from "react";
import { SessionProvider, signIn, useSession } from "next-auth/react";

/**
 * Sends the user back through Discord when their token can no longer be
 * refreshed. Re-authorising is silent for anyone who has already approved the
 * app, so this usually costs a redirect and nothing else -- and there is nothing
 * to lose by leaving a page mid-edit, because a dead token cannot save anyway.
 */
function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const expired = session?.error === "RefreshAccessTokenError";

  useEffect(() => {
    if (expired) signIn("discord");
  }, [expired]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionGuard>{children}</SessionGuard>
    </SessionProvider>
  );
}
