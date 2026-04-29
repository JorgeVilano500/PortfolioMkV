import { ImageResponse } from "next/og"

export const alt = "JAVA.dev — Jorge Alejandro Vilanova"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OGImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: "#0a0a0f",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    justifyContent: "flex-end",
                    padding: "80px",
                    fontFamily: "sans-serif",
                    position: "relative",
                }}
            >
                {/* Purple glow accent */}
                <div
                    style={{
                        position: "absolute",
                        top: -80,
                        right: -80,
                        width: 520,
                        height: 520,
                        borderRadius: "50%",
                        background:
                            "radial-gradient(circle, rgba(124,109,255,0.35) 0%, transparent 70%)",
                        display: "flex",
                    }}
                />
                {/* Small glow bottom-left */}
                <div
                    style={{
                        position: "absolute",
                        bottom: 40,
                        left: 40,
                        width: 300,
                        height: 300,
                        borderRadius: "50%",
                        background:
                            "radial-gradient(circle, rgba(124,109,255,0.12) 0%, transparent 70%)",
                        display: "flex",
                    }}
                />

                {/* Label */}
                <div
                    style={{
                        fontSize: 13,
                        letterSpacing: "0.25em",
                        textTransform: "uppercase",
                        color: "#7c6dff",
                        fontWeight: 700,
                        marginBottom: 24,
                        display: "flex",
                    }}
                >
                    Full Stack Developer
                </div>

                {/* Name */}
                <div
                    style={{
                        fontSize: 80,
                        fontWeight: 900,
                        color: "#f0eeff",
                        lineHeight: 1.05,
                        marginBottom: 28,
                        display: "flex",
                        letterSpacing: "-2px",
                    }}
                >
                    JAVA.dev
                </div>

                {/* Tagline */}
                <div
                    style={{
                        fontSize: 22,
                        color: "#6b6880",
                        maxWidth: 600,
                        lineHeight: 1.6,
                        display: "flex",
                        marginBottom: 60,
                    }}
                >
                    Interactive apps, clean code, and interfaces worth remembering.
                </div>

                {/* Status pill */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: "#13121c",
                        border: "1px solid #2a2840",
                        borderRadius: 99,
                        padding: "10px 20px",
                    }}
                >
                    <div
                        style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "#34d399",
                            display: "flex",
                        }}
                    />
                    <span
                        style={{
                            color: "#34d399",
                            fontSize: 14,
                            fontWeight: 600,
                            display: "flex",
                        }}
                    >
                        Open to opportunities · California, USA
                    </span>
                </div>
            </div>
        ),
        { ...size }
    )
}
