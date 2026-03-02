import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Check for updates on app launch and expose state to the UI.
 * Returns `updateAvailable` (boolean) and `triggerUpdate` (callback)
 * so the titlebar can render an indicator dot and let the user click it.
 */
export function useUpdater() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const updateRef = useRef<Update | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      try {
        const update = await check();
        if (cancelled || !update) return;

        console.log(
          `[updater] Update available: v${update.version} (current: v${update.currentVersion})`
        );
        updateRef.current = update;
        setUpdateAvailable(true);
      } catch (err) {
        // Expected in dev or before first release — log at debug level
        console.debug("[updater] Update check failed:", err);
      }
    }

    // Delay the check slightly so the app UI renders first
    const timer = setTimeout(checkForUpdate, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const triggerUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;

    const yes = window.confirm(
      `A new version of Zuberi is available (v${update.version}). Download and install now?`
    );
    if (!yes) return;

    console.log("[updater] Downloading update...");
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          console.log(
            `[updater] Download started (${event.data.contentLength ?? "unknown"} bytes)`
          );
          break;
        case "Progress":
          console.log(
            `[updater] Downloaded ${event.data.chunkLength} bytes`
          );
          break;
        case "Finished":
          console.log("[updater] Download finished");
          break;
      }
    });

    console.log("[updater] Relaunching...");
    await relaunch();
  }, []);

  return { updateAvailable, triggerUpdate };
}
