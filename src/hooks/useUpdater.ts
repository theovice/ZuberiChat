import { useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Silently check for updates on app launch.
 * If an update is found, prompts via native confirm dialog,
 * then downloads, installs, and relaunches the app.
 */
export function useUpdater() {
  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      try {
        const update = await check();
        if (cancelled || !update) return;

        console.log(
          `[updater] Update available: v${update.version} (current: v${update.currentVersion})`
        );

        const yes = window.confirm(
          `A new version of Zuberi is available (v${update.version}). Download and install now?`
        );
        if (!yes || cancelled) return;

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

        if (cancelled) return;
        console.log("[updater] Relaunching...");
        await relaunch();
      } catch (err) {
        // Silent failure — don't bother the user if update check fails
        console.warn("[updater] Update check failed:", err);
      }
    }

    // Delay the check slightly so the app UI renders first
    const timer = setTimeout(checkForUpdate, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
}
