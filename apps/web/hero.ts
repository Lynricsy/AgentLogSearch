import { heroui } from "@heroui/react"

// HeroUI 主题配置：light 主题使用暖纸色 + teal 强调色，dark 主题使用深色背景 + 亮 teal
// @plugin "../hero.ts" 从 globals.css 加载此配置
export default heroui({
  defaultTheme: "light",
  themes: {
    light: {
      colors: {
        background: "#f5f4ef",
        foreground: "#1f2933",
        divider: "#d8d1c3",
        content1: "#fffdf8",
        content2: "#f5f4ef",
        content3: "#ebe7dd",
        content4: "#d8d1c3",
        primary: { DEFAULT: "#0f766e", foreground: "#ffffff" },
        default: { DEFAULT: "#667085", foreground: "#ffffff" },
        success: { DEFAULT: "#16a34a", foreground: "#ffffff" },
        warning: { DEFAULT: "#a16207", foreground: "#ffffff" },
        danger: { DEFAULT: "#dc2626", foreground: "#ffffff" },
      },
      layout: {
        radius: { small: "0.5rem", medium: "0.75rem", large: "1rem" },
        borderWidth: { small: "1px", medium: "1px", large: "1px" },
      },
    },
    dark: {
      colors: {
        background: "#0a0a0a",
        foreground: "#ededed",
        divider: "#2a2a2a",
        content1: "#1a1a1a",
        content2: "#141414",
        content3: "#222222",
        content4: "#2a2a2a",
        primary: { DEFAULT: "#14b8a6", foreground: "#0a0a0a" },
        default: { DEFAULT: "#a1a1aa", foreground: "#0a0a0a" },
        success: { DEFAULT: "#22c55e", foreground: "#0a0a0a" },
        warning: { DEFAULT: "#eab308", foreground: "#0a0a0a" },
        danger: { DEFAULT: "#ef4444", foreground: "#ffffff" },
      },
      layout: {
        radius: { small: "0.5rem", medium: "0.75rem", large: "1rem" },
        borderWidth: { small: "1px", medium: "1px", large: "1px" },
      },
    },
  },
})
