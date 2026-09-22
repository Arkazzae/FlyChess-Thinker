/**
 * FlyChess: a chess site shell around one opponent, a fruit-fly connectome.
 */

import { useCallback, useEffect, useState } from "react";
import { useSettingsStore } from "@/state/settings";
import { useUiStore } from "@/state/ui";
import { useBotMove } from "@/hooks/useBotMove";
import { usePremove } from "@/hooks/usePremove";
import { useGameLifecycle } from "@/hooks/useGameLifecycle";
import { resumeAudio, setSoundsEnabled, setVolume } from "@/sounds";
import { Sidebar } from "@/components/shell/Sidebar";
import { Toast } from "@/components/shell/Toast";
import { Preloader } from "@/components/shell/Preloader";
import { PlayPage } from "@/components/play/PlayPage";
import { SettingsDialog } from "@/components/play/SettingsDialog";
import { BrainPage } from "@/components/brain/BrainPage";
import { useTranslation } from "@/i18n";
import "@/brain/clock";
import "@/styles/board.css";
import "@/styles/app.css";

export function App() {
  const view = useUiStore((s) => s.view);
  const sound = useSettingsStore((s) => s.sound);
  const volume = useSettingsStore((s) => s.volume);
  // Re-render the whole shell when the language changes.
  const { t, locale } = useTranslation();
  useEffect(() => {
    document.title = t("app.title");
  }, [locale, t]);

  useBotMove();
  usePremove();
  useGameLifecycle();

  useEffect(() => setSoundsEnabled(sound), [sound]);
  useEffect(() => setVolume(volume), [volume]);

  // The preloader downloads the brain, pieces, sounds and fonts before the game appears.
  const [loading, setLoading] = useState(true);
  const finishLoading = useCallback(() => setLoading(false), []);

  return (
    <div className="app" onPointerDown={resumeAudio}>
      {loading && <Preloader onDone={finishLoading} />}
      <Sidebar />
      <main className="app__main">{view === "brain" ? <BrainPage /> : <PlayPage />}</main>
      <SettingsDialog />
      <Toast />
    </div>
  );
}
