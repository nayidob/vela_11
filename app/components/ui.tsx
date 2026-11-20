"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TRIAGE_LABEL, type DataSource, type Triage } from "@/lib/types";

/** Crescent moon cradling a medical cross: night-time home care. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="1 4 26 26" aria-hidden="true">
      <path d="M11.635 5.235A12 12 0 1 0 25.765 19.365 10 10 0 0 1 11.635 5.235Z" fill="#F5B942" />
      <rect x="18" y="6.5" width="4" height="11" rx="1.2" fill="#0E9384" />
      <rect x="14.5" y="10" width="11" height="4" rx="1.2" fill="#0E9384" />
    </svg>
  );
}

export function TriagePill({ t, lg }: { t: Triage; lg?: boolean }) {
  return (
    <span className={`triage${lg ? " lg" : ""}`} data-t={t}>
      {TRIAGE_LABEL[t]}
    </span>
  );
}

export function Source({ s }: { s?: DataSource }) {
  if (!s) return null;
  return (
    <span className="source" data-s={s}>
      {s}
    </span>
  );
}

export function usePoll<T>(url: string | null, ms = 1500) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;
  useEffect(() => {
    if (!url) {
      setData(null);
      return;
    }
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (stop || urlRef.current !== url) return;
        if (r.ok) {
          setData(await r.json());
          setError(null);
        } else setError(`${r.status}`);
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
      if (!stop) timer = setTimeout(tick, document.hidden ? ms * 4 : ms);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [url, ms]);
  return { data, error };
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const fmt = (ts: number, sec = false) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    second: sec ? "2-digit" : undefined,
    hour12: false,
  }).format(ts);

export const clockBogota = fmt;

export function NightClock() {
  const now = useNow(1000);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="night-clock" suppressHydrationWarning>
      {mounted ? fmt(now) : "--:--"}
      <span>Medellín</span>
    </div>
  );
}

const NAV = [
  { href: "/", label: "Dispatch board" },
  { href: "/demo", label: "Live call" },
  { href: "/call", label: "Patient line" },
  { href: "/setup", label: "Setup" },
];

export function TopBar({ right }: { right?: React.ReactNode }) {
  const path = usePathname();
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <LogoMark />
        Vela Night Care <small>Medellín dispatch</small>
      </Link>
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="topbar-right">
        {right}
        <NightClock />
      </div>
    </header>
  );
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="toast" role="status">
      {text}
    </div>
  );
}
