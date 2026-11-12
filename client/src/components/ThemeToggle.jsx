import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/useTheme.js";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "light" ? "dark" : "light";
  const Icon = theme === "light" ? Moon : Sun;

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      <Icon size={17} aria-hidden="true" />
      <span className="theme-toggle-label">{theme === "light" ? "Dark" : "Light"}</span>
    </button>
  );
}
