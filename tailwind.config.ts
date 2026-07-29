import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FAF8F5",
        surface: "#FFFFFF",
        ink: "#1C1A17",
        muted: "#7A736B",
        line: "#E8E3DC",
        accent: "#4A5D4E",
        "accent-soft": "#EDF1EC",
        warning: "#B4552D",
        "warning-soft": "#FBF0EA",
        disabled: "#B8B2A9",
        "disabled-soft": "#EFEBE5",
        quiet: "#F7F5F1",
      },
      borderRadius: { card: "12px", control: "10px" },
      fontFamily: {
        sans: ["Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "sans-serif"],
      },
    },
  },
};

export default config;
