import { useEffect, useState } from "react";

// Development-only switch between the current two themes (public site and
// member app styled differently) and the unified preview — see the
// "Unified-theme PREVIEW" block at the end of index.css. Remembered per
// browser so it survives moving between the site and the app. Remove it,
// and the losing CSS, once a theme is chosen.
const KEY = "abri-theme-preview";

function readStored() {
  try {
    return localStorage.getItem(KEY) === "unified" ? "unified" : "current";
  } catch {
    return "current";
  }
}

function ThemePreviewSwitch() {
  const [mode, setMode] = useState(readStored);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "unified") root.dataset.themePreview = "unified";
    else delete root.dataset.themePreview;
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      // Private browsing: the switch still works, it just isn't remembered.
    }
  }, [mode]);

  return (
    <div className="fixed bottom-4 left-4 z-50 inline-flex items-center gap-1 rounded-full border border-grey-300 bg-white p-1 text-xs shadow-md dark:border-border dark:bg-card">
      <span className="px-2 font-semibold text-grey-600 dark:text-muted-foreground">Theme</span>
      {[
        ["current", "Current"],
        ["unified", "Unified"],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setMode(value)}
          className={`rounded-full px-3 py-1 font-semibold ${mode === value ? "bg-ink text-yellow dark:bg-grey-700" : "text-grey-600 dark:text-muted-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export { ThemePreviewSwitch };
