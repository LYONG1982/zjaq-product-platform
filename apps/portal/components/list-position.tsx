"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
export function ListPosition() {
  const path = usePathname(),
    query = useSearchParams().toString();
  useEffect(() => {
    const key = "zj-scroll:" + path + "?" + query;
    let position: string | null = null;
    try {
      position = sessionStorage.getItem(key);
    } catch {
      /* Storage may be unavailable. */
    }
    let leaving = false;
    const frame = requestAnimationFrame(() => {
      const top = Number(position);
      if (position && Number.isFinite(top) && top >= 0) window.scrollTo(0, top);
    });
    const save = () => {
      if (leaving) return;
      try {
        sessionStorage.setItem(key, String(window.scrollY));
      } catch {
        /* Browsing remains available. */
      }
    };
    const leave = (event: MouseEvent) => {
      if (
        event.button ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target ||
        anchor.hasAttribute("download")
      )
        return;
      const next = new URL(anchor.href);
      if (
        next.pathname === window.location.pathname &&
        next.search === window.location.search
      )
        return;
      save();
      leaving = true;
    };
    const pop = () => {
      save();
      leaving = true;
    };
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    window.addEventListener("popstate", pop);
    document.addEventListener("click", leave, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("popstate", pop);
      document.removeEventListener("click", leave, true);
    };
  }, [path, query]);
  return null;
}
