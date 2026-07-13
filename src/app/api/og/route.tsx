import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Get parameters with defaults
    const title = searchParams.get("title") || "Amish Secrets";
    const author = searchParams.get("author") || "Marco Benedetti";
    const accent = searchParams.get("accent") || "#C9840D";

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "space-between",
            background: "linear-gradient(160deg, #FFFDF9 0%, #FFF8EE 100%)",
            padding: "80px",
            boxSizing: "border-box",
            position: "relative",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {/* Ambient Glow */}
          <div
            style={{
              position: "absolute",
              top: "-150px",
              right: "-150px",
              width: "500px",
              height: "500px",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
              display: "flex",
            }}
          />

          {/* Left Decorative Accent Line */}
          <div
            style={{
              position: "absolute",
              left: "0",
              top: "0",
              bottom: "0",
              width: "12px",
              backgroundColor: accent,
              display: "flex",
            }}
          />

          {/* Top Row: Brand & Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                backgroundColor: "#2C2016",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: "bold",
                fontSize: "24px",
              }}
            >
              C
            </div>
            <div
              style={{
                fontSize: "22px",
                fontWeight: 900,
                color: "#2C2016",
                letterSpacing: "-0.05em",
                textTransform: "uppercase",
              }}
            >
              Courssy.
            </div>
            <div
              style={{
                marginLeft: "24px",
                padding: "6px 16px",
                borderRadius: "99px",
                backgroundColor: `${accent}18`,
                border: `1px solid ${accent}30`,
                color: accent,
                fontSize: "14px",
                fontWeight: "bold",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "flex",
              }}
            >
              Metodo Completo
            </div>
          </div>

          {/* Middle: Title */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              maxWidth: "950px",
              marginTop: "40px",
              marginBottom: "40px",
            }}
          >
            <div
              style={{
                fontSize: "64px",
                fontWeight: 800,
                lineHeight: "1.15",
                color: "#1A1208",
                letterSpacing: "-0.02em",
                wordBreak: "break-word",
                display: "flex",
              }}
            >
              {title}
            </div>
          </div>

          {/* Bottom Row: Author & Trust badge */}
          <div
            style={{
              display: "flex",
              width: "100%",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: "16px", color: "#8E8377", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Autore
              </div>
              <div style={{ fontSize: "28px", fontWeight: "bold", color: "#2C2016", marginTop: "4px" }}>
                {author}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 24px",
                borderRadius: "16px",
                backgroundColor: "rgba(255, 255, 255, 0.6)",
                border: "1px solid rgba(0, 0, 0, 0.05)",
              }}
            >
              <div
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: accent,
                  display: "flex",
                }}
              />
              <span style={{ fontSize: "16px", fontWeight: "bold", color: "#5C4E43" }}>
                Accesso Istantaneo • Garanzia 30 Giorni
              </span>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e) {
    const error = e as Error;
    return new Response(`Failed to generate Open Graph image: ${error.message || String(e)}`, {
      status: 500,
    });
  }
}
