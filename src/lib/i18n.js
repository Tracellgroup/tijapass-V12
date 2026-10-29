// Language: every visible text is written as L("English", "Kiswahili").
// `npm run extract-text` collects all pairs into docs/translations.csv for translator review (UX-01).
let current = "en";
try {
  current = localStorage.getItem("tijapass-v12-lang") || "sw";
} catch {
  current = "sw";
}

export const getLang = () => current;
export function setLang(lang) {
  current = lang === "en" ? "en" : "sw";
  try {
    localStorage.setItem("tijapass-v12-lang", current);
  } catch {
    /* storage unavailable */
  }
  if (typeof document !== "undefined") document.documentElement.lang = current;
}

export const L = (en, sw) => (current === "sw" ? sw ?? en : en);

// Pick the right language from an object such as { en: "...", sw: "..." }.
export const tl = (obj) => (!obj ? "" : current === "sw" ? obj.sw ?? obj.en : obj.en ?? obj.sw);
