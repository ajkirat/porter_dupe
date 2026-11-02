"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import { setSoundOn, soundOn } from "@/lib/sound";

// Sounds on or off, remembered on this phone.
export default function SoundToggle() {
  const { t } = useT();
  const [on, setOn] = useState(true);
  // The saved choice lives on this phone, so it is read after the page loads.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOn(soundOn()), []);
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 p-4">
      <span>
        <b className="block">{t("Sounds")}</b>
        <span className="text-xs text-stone-500">{t("Short tones and a buzz when something happens.")}</span>
      </span>
      <input
        type="checkbox"
        className="h-6 w-6"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          setSoundOn(e.target.checked);
        }}
      />
    </label>
  );
}
