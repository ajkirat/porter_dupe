"use client";

import { STATUS_LABEL, type JobStatus } from "@/lib/types";
import { useT } from "@/i18n";

const STYLES: Record<JobStatus, string> = {
  requested: "bg-amber-100 text-amber-800",
  assigned: "bg-amber-100 text-amber-800",
  accepted: "bg-blue-100 text-blue-800",
  picked_up: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-stone-200 text-stone-600",
};

export default function StatusBadge({ status }: { status: JobStatus }) {
  const { t } = useT();
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>{t(STATUS_LABEL[status])}</span>;
}
