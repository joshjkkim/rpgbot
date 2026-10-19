"use client";

/*
 * Look-alikes of Discord messages, for showing what the bot posts without a
 * screenshot that goes stale: the features page and the dashboard previews.
 */

// Discord's own dark-theme colours, so the mock reads as Discord at a glance.
export const D = {
  bg: "#313338", panel: "#2b2d31", text: "#dbdee1", muted: "#949ba4",
  grey: "#4e5058", green: "#248046", red: "#da373c", blurple: "#5865f2",
};

export function DiscordMessage({ children, time = "Today at 21:14" }: { children: React.ReactNode; time?: string }) {
  return (
    <div className="w-full max-w-[460px] rounded-md p-4 font-sans text-[15px] leading-snug shadow-[0_2px_10px_rgb(0_0_0/0.5)]" style={{ background: D.bg, color: D.text }}>
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a 64px pixel-art PNG */}
        <img src="/logo.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full bg-black/40 [image-rendering:pixelated]" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="font-medium text-white">havocish</span>
            <span className="rounded-[3px] px-1 text-[10px] font-semibold leading-4 text-white" style={{ background: D.blurple }}>APP</span>
            <span className="text-xs" style={{ color: D.muted }}>{time}</span>
          </p>
          <div className="mt-1.5 rounded-md border-l-4 p-3" style={{ background: D.panel, borderColor: "#8a6a2e" }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DButton({ children, colour = "grey", onClick, disabled, wide }: {
  children: React.ReactNode; colour?: "grey" | "green" | "red" | "blurple"; onClick?: () => void; disabled?: boolean; wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-8 rounded-[3px] px-3 text-sm font-medium text-white transition-[filter] enabled:hover:brightness-110 disabled:cursor-default ${wide ? "w-full" : ""}`}
      style={{ background: D[colour], opacity: disabled && !onClick ? 1 : undefined }}
    >
      {children}
    </button>
  );
}

export const Sub = ({ children }: { children: React.ReactNode }) => <p className="text-xs" style={{ color: D.muted }}>{children}</p>;
