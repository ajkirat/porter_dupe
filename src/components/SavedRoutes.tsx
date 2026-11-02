"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PENDING_ROUTE_KEY, type SavedRoute } from "@/lib/routes";
import { errorText, supabase } from "@/lib/supabase";
import { useT } from "@/i18n";

// Account page: the customer's saved routes, with Book (two taps), Rename and Delete.
export default function SavedRoutes() {
  const { t } = useT();
  const router = useRouter();
  const [routes, setRoutes] = useState<SavedRoute[] | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase().from("saved_routes").select("*").order("created_at", { ascending: false });
    if (error) return setReady(false); // migration 0008 not applied yet
    setRoutes((data as SavedRoute[]) ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  if (!ready) return null;

  function book(r: SavedRoute) {
    try {
      sessionStorage.setItem(PENDING_ROUTE_KEY, r.id);
    } catch {}
    router.push("/");
  }

  async function rename(r: SavedRoute) {
    const label = prompt(t("Name this route"), r.label)?.trim();
    if (!label || label === r.label) return;
    const { error } = await supabase().from("saved_routes").update({ label: label.slice(0, 60) }).eq("id", r.id);
    if (error) setError(errorText(error));
    await load();
  }

  async function remove(r: SavedRoute) {
    if (!confirm(t("Delete \"{name}\"?", { name: r.label }))) return;
    const { error } = await supabase().from("saved_routes").delete().eq("id", r.id);
    if (error) setError(errorText(error));
    await load();
  }

  return (
    <div className="space-y-2 rounded-2xl border border-stone-200 p-4">
      <p className="font-semibold">{t("Saved routes")}</p>
      {routes === null && <p className="text-sm text-stone-500">{t("Loading…")}</p>}
      {routes?.length === 0 && <p className="text-sm text-stone-500">{t("Nothing saved yet. Tick “Save this route for next time” when you book, and it shows up here.")}</p>}
      {routes?.map((r) => (
        <div key={r.id} className="space-y-2 rounded-xl bg-stone-50 p-3">
          <div>
            <p className="font-medium">{r.label}</p>
            <p className="truncate text-xs text-stone-500">
              {r.pickup_address} → {r.drop_address}
            </p>
            {r.receiver_name && <p className="text-xs text-stone-500">{t("To")} {r.receiver_name}</p>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button className="btn btn-primary py-1.5 text-sm" onClick={() => book(r)}>
              {t("Book")}
            </button>
            <button className="btn py-1.5 text-sm" onClick={() => rename(r)}>
              {t("Rename")}
            </button>
            <button className="btn py-1.5 text-sm text-red-600" onClick={() => remove(r)}>
              {t("Delete")}
            </button>
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
