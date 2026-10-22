import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/** The link preview for Discord, Reddit, X and search: the logo, the name, and a real profile card. */
export const alt = "havocish, a Discord RPG bot";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const asData = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;
  // Literal paths, so the build traces just these two files.
  const [icon, card] = (await Promise.all([
    readFile(join(process.cwd(), "app", "icon.png")),
    readFile(join(process.cwd(), "public", "showcase", "profile.png")),
  ])).map(asData);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 36, background: "#14110d", color: "#e8dcc0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img src={icon} width={96} height={96} alt="" style={{ imageRendering: "pixelated" }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 72, fontWeight: 700, color: "#d9b25f" }}>havocish</div>
            <div style={{ fontSize: 30, color: "#a89a7c" }}>A Discord RPG you design yourself</div>
          </div>
        </div>
        <img src={card} width={880} height={336} alt="" />
      </div>
    ),
    size,
  );
}
