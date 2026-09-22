/**
 * The fly mascot as SVG markup: one source for the React avatar (FlyMascot) and the
 * static public/avatars/fly.svg (scripts/build-fly-avatar.ts). Animated with CSS:
 * the fly hovers, blinks, looks around and twitches its antennae; its wings flutter
 * now and then and buzz while `.is-thinking` is set on an ancestor; `.fly-still` keeps it
 * calm unless it is thinking. Each level of the fly has its own accessory.
 */

export type FlyVariant = "plain" | "odruch" | "plan" | "mysl" | "odruch4" | "plan4" | "mysl4";

/**
 * Accessories drawn over the body. fly-v6: a lightning bolt (Reflex), a game plan (Planner), glasses
 * (Thinker). The older fly-v4: a propeller cap (Rookie), a scroll (Scribe), a monocle (Elder).
 */
function accessory(variant: FlyVariant): string {
  if (variant === "odruch4") {
    return `<g class="fly-acc">
      <path d="M100 22 V12" stroke="#2b1d10" stroke-width="3" stroke-linecap="round"/>
      <g class="fly-prop"><ellipse cx="88" cy="11" rx="12" ry="4" fill="#81b64c" stroke="#2b1d10" stroke-width="2"/>
        <ellipse cx="112" cy="11" rx="12" ry="4" fill="#e0a33a" stroke="#2b1d10" stroke-width="2"/></g>
      <circle cx="100" cy="11" r="3" fill="#2b1d10"/>
      <path d="M78 47 Q100 14 122 47 Z" fill="#e2422f" stroke="#2b1d10" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M92 24 Q88 34 88 45 M108 24 Q112 34 112 45" stroke="#ffd23f" stroke-width="5" fill="none"/>
      <path d="M76 47 H124" stroke="#2b1d10" stroke-width="4" stroke-linecap="round"/>
    </g>`;
  }
  if (variant === "plan4") {
    return `<g class="fly-acc">
      <rect x="72" y="132" width="56" height="36" fill="#f3e2bf" stroke="#6b4318" stroke-width="2.5"/>
      <path d="M80 142 H118 M80 150 H112 M80 158 H116" stroke="#6b4318" stroke-width="2" stroke-linecap="round" opacity=".75"/>
      <rect x="64" y="128" width="12" height="44" rx="6" fill="#d9c08e" stroke="#6b4318" stroke-width="2.5"/>
      <rect x="124" y="128" width="12" height="44" rx="6" fill="#d9c08e" stroke="#6b4318" stroke-width="2.5"/>
      <path d="M58 144 C62 140 66 138 70 140 M142 144 C138 140 134 138 130 140" fill="none" stroke="#4a3320" stroke-width="3.2" stroke-linecap="round"/>
    </g>`;
  }
  if (variant === "mysl4") {
    return `<g class="fly-acc">
      <path d="M150 78 C160 96 156 118 146 132" fill="none" stroke="#d9a441" stroke-width="2.5" stroke-dasharray="2 4" stroke-linecap="round"/>
      <circle cx="124" cy="66" r="27" fill="#fff4dc" fill-opacity=".14" stroke="#2b1d10" stroke-width="7"/>
      <circle cx="124" cy="66" r="27" fill="none" stroke="#d9a441" stroke-width="4"/>
      <path d="M110 52 l10 -10 M115 60 l14 -14" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".75"/>
    </g>`;
  }
  if (variant === "odruch") {
    return `<g class="fly-acc">
      <g stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55">
        <path d="M22 96 L6 96"/><path d="M26 112 L4 112"/><path d="M22 128 L10 128"/>
      </g>
      <path d="M160 2 L144 26 L155 26 L149 44 L170 18 L159 18 L167 2 Z" fill="#ffd23f" stroke="#b57b00" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M158 7 L151 18" stroke="#fff6c8" stroke-width="2" stroke-linecap="round" opacity=".8"/>
    </g>`;
  }
  if (variant === "plan") {
    const cells = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if ((r + c) % 2) cells.push(`<rect x="${82 + c * 9}" y="${144 + r * 9}" width="9" height="9" fill="#7a9a58"/>`);
    }
    return `<g class="fly-acc">
      <rect x="72" y="126" width="56" height="66" rx="6" fill="#b07a3c" stroke="#6b4318" stroke-width="2.5"/>
      <rect x="77" y="136" width="46" height="51" rx="2" fill="#fbf6e9"/>
      <rect x="82" y="144" width="36" height="36" fill="#eeeed2"/>
      ${cells.join("")}
      <path d="M86 176 C92 164 100 160 110 150" fill="none" stroke="#e0352b" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 5"/>
      <path d="M104 148 L112 148 L111 156" fill="none" stroke="#e0352b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="90" y="121" width="20" height="10" rx="3" fill="#9aa3ad" stroke="#5b636c" stroke-width="2"/>
      <path d="M66 150 C70 146 74 142 76 138 M134 150 C130 146 126 142 124 138" fill="none" stroke="#4a3320" stroke-width="3.2" stroke-linecap="round"/>
    </g>`;
  }
  if (variant === "mysl") {
    return `<g class="fly-acc">
      <circle cx="76" cy="66" r="27" fill="#dff4ff" fill-opacity=".12" stroke="#23180f" stroke-width="4.5"/>
      <circle cx="124" cy="66" r="27" fill="#dff4ff" fill-opacity=".12" stroke="#23180f" stroke-width="4.5"/>
      <path d="M103 62 Q100 56 97 62" fill="none" stroke="#23180f" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M49 62 L38 56 M151 62 L162 56" stroke="#23180f" stroke-width="4" stroke-linecap="round"/>
      <path d="M60 50 L70 44 M108 50 L118 44" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
    </g>`;
  }
  return "";
}

export const FLY_CSS = `
.fly-svg { overflow: visible; }
.fly-svg .fly-hover { animation: fly-hover 3.2s ease-in-out infinite; }
.fly-svg .fly-wing { transform-box: view-box; }
.fly-svg .fly-wing--l { transform-origin: 86px 106px; animation: fly-flutter-l 4.6s ease-in-out infinite; }
.fly-svg .fly-wing--r { transform-origin: 114px 106px; animation: fly-flutter-r 4.6s ease-in-out infinite; }
.fly-svg .fly-eye { transform-box: fill-box; transform-origin: 50% 50%; animation: fly-blink 5.3s infinite; }
.fly-svg .fly-eye--r { animation-delay: .04s; }
.fly-svg .fly-glint { animation: fly-look 7s ease-in-out infinite; }
.fly-svg .fly-antenna { transform-box: view-box; animation: fly-twitch 2.8s ease-in-out infinite; }
.fly-svg .fly-antenna--l { transform-origin: 92px 50px; }
.fly-svg .fly-antenna--r { transform-origin: 108px 50px; animation-delay: .35s; }
.fly-svg .fly-glow { opacity: 0; transition: opacity .4s; }
.is-thinking .fly-svg .fly-wing--l { animation: fly-buzz-l .07s linear infinite alternate; }
.is-thinking .fly-svg .fly-wing--r { animation: fly-buzz-r .07s linear infinite alternate; }
.is-thinking .fly-svg .fly-wing-blade { opacity: .55; }
.is-thinking .fly-svg .fly-antenna { animation-duration: .5s; }
.is-thinking .fly-svg .fly-hover { animation-duration: 1.1s; }
.is-thinking .fly-svg .fly-glow { opacity: 1; animation: fly-pulse 1s ease-in-out infinite; }
.fly-svg .fly-prop { transform-box: fill-box; transform-origin: 50% 50%; animation: fly-spin .9s linear infinite; }
.is-thinking .fly-svg .fly-prop { animation-duration: .25s; }
@keyframes fly-hover { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes fly-flutter-l {
  0%, 70%, 100% { transform: rotate(0deg); }
  73% { transform: rotate(26deg); } 76% { transform: rotate(-4deg); } 79% { transform: rotate(22deg); }
  82% { transform: rotate(-3deg); } 85% { transform: rotate(12deg); } 88% { transform: rotate(0deg); }
}
@keyframes fly-flutter-r {
  0%, 70%, 100% { transform: rotate(0deg); }
  73% { transform: rotate(-26deg); } 76% { transform: rotate(4deg); } 79% { transform: rotate(-22deg); }
  82% { transform: rotate(3deg); } 85% { transform: rotate(-12deg); } 88% { transform: rotate(0deg); }
}
@keyframes fly-buzz-l { from { transform: rotate(-6deg); } to { transform: rotate(34deg); } }
@keyframes fly-buzz-r { from { transform: rotate(6deg); } to { transform: rotate(-34deg); } }
@keyframes fly-blink { 0%, 93%, 100% { transform: scaleY(1); } 95.5% { transform: scaleY(.12); } }
@keyframes fly-look {
  0%, 20%, 100% { transform: translate(0, 0); } 28%, 45% { transform: translate(3px, 1px); }
  55%, 72% { transform: translate(-3px, 1.5px); } 80% { transform: translate(0, -1px); }
}
@keyframes fly-twitch { 0%, 60%, 100% { transform: rotate(0deg); } 68% { transform: rotate(-9deg); } 76% { transform: rotate(5deg); } 84% { transform: rotate(-3deg); } }
@keyframes fly-pulse { 50% { opacity: .45; } }
@keyframes fly-spin { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(-1); } }
.fly-still:not(.is-thinking) .fly-svg * { animation: none !important; }
@media (prefers-reduced-motion: reduce) {
  .fly-svg *, .is-thinking .fly-svg * { animation: none !important; }
}
`;

const LEGS = [
  "M86 112 C72 112 62 104 52 108 L44 116",
  "M86 120 C70 124 60 126 52 136 L48 146",
  "M88 128 C78 138 72 148 70 160 L68 170",
];

function mirror(path: string): string {
  return path.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${200 - Number(x)} ${y}`);
}

/** SVG markup. `id` keeps gradient ids unique when several flies share a page. */
export function flySvg(id: string, { style = false, title, variant = "plain" }: { style?: boolean; title?: string; variant?: FlyVariant } = {}): string {
  const u = (name: string) => `${id}-${name}`;
  const wing = (side: "l" | "r") => {
    const blade = "M86 104 C70 104 40 118 28 142 C18 162 24 180 40 180 C58 180 74 158 82 136 C86 124 88 112 88 106 Z";
    const veins = "M86 106 C68 116 46 136 34 162 M86 108 C74 124 60 146 50 174 M87 110 C82 128 74 150 64 170";
    const d = side === "l" ? blade : mirror(blade);
    const v = side === "l" ? veins : mirror(veins);
    return `<g class="fly-wing fly-wing--${side}">
      <path class="fly-wing-blade" d="${d}" fill="url(#${u("wing")})" stroke="#c9b89a" stroke-opacity=".75" stroke-width="1.2"/>
      <path d="${v}" fill="none" stroke="#b09a78" stroke-opacity=".55" stroke-width="1" stroke-linecap="round"/>
      <path d="${d}" fill="url(#${u("sheen")})" opacity=".55"/>
    </g>`;
  };
  const legs = [...LEGS, ...LEGS.map(mirror)]
    .map((d) => `<path d="${d}" fill="none" stroke="#4a3320" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join("");
  const eye = (side: "l" | "r", cx: number) => `
    <g class="fly-eye fly-eye--${side}">
      <ellipse cx="${cx}" cy="66" rx="23" ry="25" fill="url(#${u("eye")})"/>
      <ellipse cx="${cx}" cy="66" rx="23" ry="25" fill="url(#${u("facets")})" opacity=".5"/>
      <ellipse cx="${cx}" cy="66" rx="23" ry="25" fill="none" stroke="#6e1410" stroke-opacity=".5" stroke-width="1.5"/>
      <g class="fly-glint">
        <ellipse cx="${cx - 8}" cy="55" rx="7" ry="5" fill="#fff" opacity=".85" transform="rotate(-25 ${cx - 8} 55)"/>
        <circle cx="${cx + 7}" cy="74" r="2.6" fill="#fff" opacity=".55"/>
      </g>
    </g>`;
  return `<svg class="fly-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img"${title ? ` aria-label="${title}"` : ' aria-hidden="true"'}>
  ${style ? `<style>${FLY_CSS}</style>` : ""}
  <defs>
    <linearGradient id="${u("wing")}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffaf0" stop-opacity=".85"/>
      <stop offset="1" stop-color="#e8dcc4" stop-opacity=".35"/>
    </linearGradient>
    <linearGradient id="${u("sheen")}" x1="0" y1="0" x2="1" y2="1">
      <stop offset=".2" stop-color="#fff3c8" stop-opacity="0"/>
      <stop offset=".5" stop-color="#fff3c8" stop-opacity=".6"/>
      <stop offset=".8" stop-color="#fff3c8" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="${u("eye")}" cx=".38" cy=".3" r=".8">
      <stop offset="0" stop-color="#ff8f7a"/>
      <stop offset=".45" stop-color="#e0352b"/>
      <stop offset="1" stop-color="#8c1712"/>
    </radialGradient>
    <pattern id="${u("facets")}" width="5" height="4.4" patternUnits="userSpaceOnUse">
      <circle cx="2.5" cy="2.2" r="1.3" fill="#5e0d09"/>
    </pattern>
    <radialGradient id="${u("head")}" cx=".5" cy=".35" r=".7">
      <stop offset="0" stop-color="#f3c97a"/>
      <stop offset="1" stop-color="#b98232"/>
    </radialGradient>
    <radialGradient id="${u("thorax")}" cx=".45" cy=".3" r=".75">
      <stop offset="0" stop-color="#d9a24e"/>
      <stop offset="1" stop-color="#8a5a22"/>
    </radialGradient>
    <linearGradient id="${u("abdomen")}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#b98232"/>
      <stop offset=".45" stop-color="#f0c46e"/>
      <stop offset="1" stop-color="#a06d28"/>
    </linearGradient>
    <clipPath id="${u("abclip")}"><ellipse cx="100" cy="150" rx="25" ry="32"/></clipPath>
    <radialGradient id="${u("glow")}" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#f2c14e" stop-opacity=".7"/>
      <stop offset="1" stop-color="#f2c14e" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <g class="fly-hover">
    <ellipse class="fly-glow" cx="100" cy="66" rx="66" ry="46" fill="url(#${u("glow")})"/>
    ${legs}
    ${wing("l")}${wing("r")}
    <ellipse cx="100" cy="150" rx="25" ry="32" fill="url(#${u("abdomen")})"/>
    <g clip-path="url(#${u("abclip")})" fill="#5a3818" opacity=".75">
      <rect x="70" y="140" width="60" height="6" rx="3"/>
      <rect x="70" y="154" width="60" height="6.5" rx="3"/>
      <rect x="70" y="168" width="60" height="7" rx="3"/>
    </g>
    <ellipse cx="94" cy="138" rx="6" ry="10" fill="#fff" opacity=".18"/>
    <ellipse cx="100" cy="112" rx="28" ry="22" fill="url(#${u("thorax")})"/>
    <path d="M86 104 C92 98 108 98 114 104" fill="none" stroke="#6b4318" stroke-width="2" stroke-linecap="round" opacity=".6"/>
    <g fill="#4a2e12" opacity=".7">
      <circle cx="90" cy="112" r="1.4"/><circle cx="100" cy="116" r="1.4"/><circle cx="110" cy="112" r="1.4"/>
      <circle cx="95" cy="122" r="1.2"/><circle cx="105" cy="122" r="1.2"/>
    </g>
    <path class="fly-antenna fly-antenna--l" d="M92 50 C88 40 82 34 74 32" fill="none" stroke="#5a3818" stroke-width="3" stroke-linecap="round"/>
    <path class="fly-antenna fly-antenna--r" d="M108 50 C112 40 118 34 126 32" fill="none" stroke="#5a3818" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="100" cy="74" rx="30" ry="25" fill="url(#${u("head")})"/>
    <g fill="#7a4e1c" opacity=".8"><circle cx="100" cy="54" r="2"/><circle cx="95" cy="58" r="1.6"/><circle cx="105" cy="58" r="1.6"/></g>
    ${eye("l", 76)}${eye("r", 124)}
    <path d="M94 90 Q100 96 106 90" fill="none" stroke="#6b4318" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M100 94 L100 101" stroke="#6b4318" stroke-width="3" stroke-linecap="round"/>
    ${accessory(variant)}
  </g>
</svg>`;
}
