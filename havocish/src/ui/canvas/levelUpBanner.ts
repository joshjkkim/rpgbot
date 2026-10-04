import { createCanvas } from "@napi-rs/canvas";
import { AttachmentBuilder } from "discord.js";
import { registerCardFonts } from "./fonts.js";
import { drawTextWithEmojis } from "./drawEmojis.js";
import {
    GOLD, PARCHMENT, PARCHMENT_DIM, STONE_BORDER, STONE_DIM, drawAvatarCircle, drawPanelFrame,
} from "./theme.js";

const WIDTH = 560;       // logical pixels; rendered at 2x like the item card
const HEIGHT = 140;
const SCALE = 2;
const PAD = 28;
const AVATAR_R = 40;

/** Cuts a name to fit, so a long display name cannot run under the level number. */
function fitText(ctx: any, text: string, maxWidth: number) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let chars = [...text];
    while (chars.length > 1 && ctx.measureText(chars.join("") + "…").width > maxWidth) chars.pop();
    return chars.join("") + "…";
}

/**
 * The banner posted with a level-up announcement: avatar, name, and the new
 * level in large type, in the same frame as the item card.
 */
export async function renderLevelUpBanner(args: {
    name: string;
    avatarUrl: string;
    level: number;
}): Promise<AttachmentBuilder> {
    registerCardFonts();

    const canvas = createCanvas(WIDTH * SCALE, HEIGHT * SCALE);
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);

    drawPanelFrame(ctx, WIDTH, HEIGHT);

    // Avatar, ringed in stone. A failed fetch leaves an empty ring rather than no banner.
    const cx = PAD + AVATAR_R;
    const cy = HEIGHT / 2;
    await drawAvatarCircle(ctx, args.avatarUrl, cx, cy, AVATAR_R).catch(() => {});
    ctx.strokeStyle = STONE_BORDER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, AVATAR_R + 1, 0, Math.PI * 2);
    ctx.stroke();

    // The new level, right-aligned.
    const right = WIDTH - PAD;
    ctx.textAlign = "right";
    ctx.fillStyle = PARCHMENT_DIM;
    ctx.font = "12px InterSemi";
    ctx.fillText("LEVEL", right, 52);
    ctx.fillStyle = GOLD;
    ctx.font = "48px InterBold";
    ctx.fillText(String(args.level), right, 100);
    const levelWidth = Math.max(ctx.measureText(String(args.level)).width, 40);
    ctx.textAlign = "left";

    // Divider between the name block and the number.
    const dividerX = right - levelWidth - 20;
    ctx.strokeStyle = STONE_DIM;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dividerX, 36);
    ctx.lineTo(dividerX, HEIGHT - 36);
    ctx.stroke();

    const textX = cx + AVATAR_R + 22;
    ctx.fillStyle = GOLD;
    ctx.font = "12px InterSemi";
    ctx.fillText("LEVEL UP", textX, 60);

    ctx.fillStyle = PARCHMENT;
    ctx.font = "24px InterSemi";
    const name = fitText(ctx, args.name, dividerX - textX - 16);
    // Display names can carry emoji, which the plain fillText would drop.
    await drawTextWithEmojis({ ctx, text: name, x: textX, y: 92, emojiSize: 24 });

    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "level-up.png" });
}
