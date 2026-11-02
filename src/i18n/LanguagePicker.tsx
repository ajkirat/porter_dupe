"use client";

import { LANGUAGES, useT } from "./index";

// Three buttons: English, Hindi, Kannada. Shown on the login screen and in Profile.
export default function LanguagePicker({ className = "" }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <div className={`flex gap-2 ${className}`} role="group" aria-label="Language">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${lang === l.code ? "border-brand bg-orange-50 text-brand" : "border-stone-300 bg-white text-stone-700"}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
