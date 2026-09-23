/** Hand-drawn interface icons: colourful for navigation, single-colour for controls. */

type P = { size?: number; className?: string };

export const IconGithub = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

export const IconPlay = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 3.5a5 5 0 0 1 3.2 8.85c1.9 1.1 3 2.9 3 4.9 0 .9-.2 1.7-.6 2.4h-11.2c-.4-.7-.6-1.5-.6-2.4 0-2 1.1-3.8 3-4.9A5 5 0 0 1 16 3.5Z" fill="#f2e3cf" />
    <path d="M8.5 21.5h15c.8 0 1.5.7 1.5 1.5v1.2c0 .8-.7 1.5-1.5 1.5h-15c-.8 0-1.5-.7-1.5-1.5V23c0-.8.7-1.5 1.5-1.5Z" fill="#d9c2a3" />
    <path d="M6.5 26h19c.8 0 1.5.7 1.5 1.5v.5c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-.5c0-.8.7-1.5 1.5-1.5Z" fill="#b99b75" />
    <path d="M3 13.5c2.4-1.5 5-1.7 6.8-.6-.5 2.3-2.3 4.1-5.1 4.8" fill="none" stroke="#e2b85f" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconBrain = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <path d="M12.5 5.5c-2.3 0-4 1.6-4.3 3.6-2.1.4-3.7 2.2-3.7 4.4 0 1 .3 1.9.9 2.6-.6.8-.9 1.7-.9 2.7 0 2.1 1.4 3.9 3.4 4.4.4 2.3 2.4 4 4.7 4 1.2 0 2.4-.5 3.2-1.3V6.9c-.8-.9-2-1.4-3.3-1.4Z" fill="#f2a07a" />
    <path d="M19.5 5.5c2.3 0 4 1.6 4.3 3.6 2.1.4 3.7 2.2 3.7 4.4 0 1-.3 1.9-.9 2.6.6.8.9 1.7.9 2.7 0 2.1-1.4 3.9-3.4 4.4-.4 2.3-2.4 4-4.7 4-1.2 0-2.4-.5-3.2-1.3V6.9c.8-.9 2-1.4 3.3-1.4Z" fill="#e27a55" />
    <g stroke="#7a3a20" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity=".75">
      <path d="M9 13.5c1.5 0 2.6 1 2.6 2.5M8.5 19.5c1.7-.3 3 .6 3.5 2M20.5 10.5c-1.3.3-2 1.5-1.8 2.8M23 17c-1.5-.2-2.8.8-3 2.3" />
    </g>
    <circle cx="25.5" cy="6.5" r="2.2" fill="#a3d160" />
    <circle cx="25.5" cy="6.5" r="4" fill="#a3d160" opacity=".25" />
  </svg>
);

export const IconFlag = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M5 2.5a1 1 0 0 1 1 1V4h11.2c.8 0 1.2.9.7 1.5L15 9l2.9 3.5c.5.6.1 1.5-.7 1.5H6v7.5a1 1 0 1 1-2 0v-18a1 1 0 0 1 1-1Z" />
  </svg>
);

export const IconUndo = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M9.6 4.3a1 1 0 0 1 0 1.4L7.3 8H14a7 7 0 0 1 0 14h-3a1 1 0 1 1 0-2h3a5 5 0 0 0 0-10H7.3l2.3 2.3a1 1 0 1 1-1.4 1.4l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 1.4 0Z" transform="translate(0 -1)" />
  </svg>
);

export const IconBulb = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M12 5a6 6 0 0 0-3.6 10.8c.6.5 1 1.1 1 1.8V18h5.2v-.4c0-.7.4-1.3 1-1.8A6 6 0 0 0 12 5Zm-2.6 14.5h5.2v.7c0 1-.8 1.8-1.8 1.8h-1.6c-1 0-1.8-.8-1.8-1.8Z" />
    <path d="M12 1v1.6M4.2 4.2l1.1 1.1M19.8 4.2l-1.1 1.1M1.5 11.5h1.6M20.9 11.5h1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const IconDownload = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v11m0 0 4-4m-4 4-4-4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);

export const IconGear = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.8c.1.6.1 1.3 0 1.9l2 1.8-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9L3.9 13l2-1.8a6 6 0 0 1 0-1.9l-2-1.8 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9ZM12 8.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4Z" transform="translate(0 1)" />
  </svg>
);

export const IconFlip = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 3v15m0 0-3.5-3.5M7 18l3.5-3.5M17 21V6m0 0-3.5 3.5M17 6l3.5 3.5" />
  </svg>
);

export const IconChevron = ({ size = 18, dir = "left" }: P & { dir?: "left" | "right" | "first" | "last" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    {dir === "left" && <path d="m15 5-7 7 7 7" />}
    {dir === "right" && <path d="m9 5 7 7-7 7" />}
    {dir === "first" && <path d="M6 5v14m12-14-7 7 7 7" />}
    {dir === "last" && <path d="M18 5v14M6 5l7 7-7 7" />}
  </svg>
);

export const IconExpand = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </svg>
);

/** Brand wordmark; collapses to "FC" in the narrow sidebar. */
export const Logo = () => (
  <span className="logo">
    <span className="logo__word">Fly<b>Chess</b><small>.bzz</small></span>
    <span className="logo__short" aria-hidden="true">F<b>C</b></span>
  </span>
);

/** The brain as a badge: a slowly moving gradient behind a line brain, livelier while the fly thinks. */
export const BrainBadge = ({ size = 30, live = false }: P & { live?: boolean }) => (
  <span className={`brain-badge${live ? " is-live" : ""}`} style={{ width: size, height: size }} aria-hidden="true">
    <svg viewBox="0 0 32 32" fill="none" stroke="#fffaf0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 7.5c-1-1.3-2.4-2-4-2-2.6 0-4.6 2-4.8 4.4C4.3 10.6 3 12.3 3 14.4c0 1.1.4 2.1 1 2.8-.6.8-1 1.8-1 2.9 0 2.4 1.8 4.3 4.1 4.6.5 2 2.3 3.3 4.4 3.3 1.4 0 2.6-.6 3.5-1.5Z" />
      <path d="M17 7.5c1-1.3 2.4-2 4-2 2.6 0 4.6 2 4.8 4.4 1.9.7 3.2 2.4 3.2 4.5 0 1.1-.4 2.1-1 2.8.6.8 1 1.8 1 2.9 0 2.4-1.8 4.3-4.1 4.6-.5 2-2.3 3.3-4.4 3.3-1.4 0-2.6-.6-3.5-1.5Z" />
      <path d="M9.5 13.5c1.6 0 2.8 1.1 2.8 2.7M9 20c1.7-.3 3 .6 3.5 2M22.5 12c-1.4.3-2.2 1.6-2 3M23 19.5c-1.5-.2-2.8.8-3 2.3" opacity=".8" />
    </svg>
  </span>
);
