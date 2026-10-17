/**
 * Runs an optional Discord side effect -- a log-channel post, an announcement,
 * a DM -- without letting it fail the command around it.
 *
 * These used to be awaited bare, so a channel the bot could not post in, or a
 * member with DMs closed, threw out of the command after it had already moved
 * gold or items: the change happened, and the player saw an error.
 */
export async function bestEffort(what: string, task: Promise<unknown>): Promise<boolean> {
    try {
        await task;
        return true;
    } catch (err) {
        const code = (err as { code?: number }).code;
        console.warn(`Skipped ${what}${code ? ` (Discord ${code})` : ""}:`, (err as Error).message ?? err);
        return false;
    }
}
