import { ImageResponse } from "next/og";
import { FROG_SVG_MARKUP } from "@/components/brand/frog-mascot";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/config";

export const alt = `${BRAND_NAME} — game boosting for LoL, Valorant, Overwatch 2 & Marvel Rivals`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const frog = `data:image/svg+xml;base64,${Buffer.from(FROG_SVG_MARKUP).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#0F141A",
          backgroundImage:
            "radial-gradient(60% 60% at 20% 0%, rgba(63,196,110,0.28), transparent)",
          padding: "80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          <img src={frog} width={148} height={148} alt="" />
          <div style={{ fontSize: 92, fontWeight: 800, color: "#F5F7F5", letterSpacing: "-2px" }}>
            {BRAND_NAME}
          </div>
        </div>
        <div style={{ marginTop: "36px", fontSize: 44, color: "#7FE0A3", fontWeight: 600 }}>
          {BRAND_TAGLINE}
        </div>
        <div style={{ marginTop: "16px", fontSize: 30, color: "#9AA6A0" }}>
          LoL · Valorant · Overwatch 2 · Marvel Rivals
        </div>
      </div>
    ),
    { ...size },
  );
}
