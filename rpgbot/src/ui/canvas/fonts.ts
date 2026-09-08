import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GlobalFonts } from "@napi-rs/canvas";

// Profile cards name these families directly (`ctx.font = "16px InterSemi"`),
// so the card only renders as designed if the files behind them registered.
//
// Two things used to go wrong here, both silently:
//
//   1. The paths were relative ("assets/fonts/..."), which resolves against the
//      process CWD, not this file. Starting the bot from the repo root instead
//      of rpgbot/ -- or from any WORKDIR in a container -- looked for the fonts
//      in a directory that has none.
//   2. `registerFromPath` returns null on a missing file rather than throwing,
//      so a failed registration produced no error at all. Canvas then fell back
//      to whatever the host happened to have installed: invisible on a dev Mac
//      with 300+ system families, blank boxes in a slim image with none.
//
// Resolving from this module's own location fixes (1) for both `tsx src/` and
// `node dist/` -- dist mirrors src, so the depth up to rpgbot/ is the same --
// and checking the return value fixes (2).
const HERE = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(HERE, "..", "..", "..", "assets", "fonts");

const FONTS: ReadonlyArray<{ file: string; family: string }> = [
    { file: "Inter-Regular.ttf", family: "Inter" },
    { file: "Inter-SemiBold.ttf", family: "InterSemi" },
    { file: "Inter-Bold.ttf", family: "InterBold" },
];

let registered = false;

/**
 * Registers the profile-card fonts. Idempotent, and safe to call from module
 * scope. Throws if a font is missing: a bot that renders every profile card in
 * a fallback face is broken in a way no one reports as a bug, so it is better
 * to fail at startup than to ship cards that quietly look wrong.
 */
export function registerCardFonts(): void {
    if (registered) return;

    const failed: string[] = [];

    for (const { file, family } of FONTS) {
        const path = join(FONT_DIR, file);

        // Returns null on failure -- never trust it to throw.
        GlobalFonts.registerFromPath(path, family);

        if (!GlobalFonts.has(family)) failed.push(`${family} (${path})`);
    }

    if (failed.length > 0) {
        throw new Error(
            `Could not register profile-card fonts: ${failed.join(", ")}. ` +
            `Expected the .ttf files in ${FONT_DIR} -- see rpgbot/assets/fonts/README.md.`
        );
    }

    registered = true;
}
