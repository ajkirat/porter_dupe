import { APP_NAME } from "@/lib/brand";

export default function Logo({ className = "", suffix }: { className?: string; suffix?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${className}`}>
      <svg viewBox="0 0 512 512" className="h-[1.1em] w-[1.1em]" aria-hidden>
        <rect width="512" height="512" rx="112" fill="#ea580c" />
        <path d="M256 96c-70 0-126 54-126 122 0 88 126 198 126 198s126-110 126-198c0-68-56-122-126-122z" fill="#fff" />
        <circle cx="256" cy="218" r="46" fill="#ea580c" />
      </svg>
      {APP_NAME}
      {suffix && <span className="font-medium text-stone-500">{suffix}</span>}
    </span>
  );
}
