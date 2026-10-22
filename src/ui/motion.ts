"use client";

import { useSyncExternalStore } from "react";

// Reduced motion = the system preference OR the in-page Motion toggle (data-motion="off" on <html>).
const MQ = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(MQ);
  mq.addEventListener("change", cb);
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => {
    mq.removeEventListener("change", cb);
    mo.disconnect();
  };
}

const read = () => window.matchMedia(MQ).matches || document.documentElement.dataset.motion === "off";

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

export const MOTION_KEY = "lifeos.motion";

export function setMotion(on: boolean) {
  if (on) delete document.documentElement.dataset.motion;
  else document.documentElement.dataset.motion = "off";
  try {
    localStorage.setItem(MOTION_KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
}
