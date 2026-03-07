import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface VersionInfo {
  version: string;
  commit: string;
  builtAt: string;
}

interface VersionPollerResult {
  updateAvailable: boolean;
  availableVersion: string | null;
}

/** Compare two semver strings numerically. Returns 1 if a > b, -1 if a < b, 0 if equal. */
function compareSemver(a: string, b: string): number {
  const parseVersion = (v: string): number[] => {
    const cleaned = v.replace(/^v/i, "");
    return cleaned.split(".").map((part) => {
      const n = parseInt(part, 10);
      return isNaN(n) ? -1 : n;
    });
  };

  const aParts = parseVersion(a);
  const bParts = parseVersion(b);

  // If any part failed to parse, return 0 (no comparison possible)
  if (aParts.some((n) => n < 0) || bParts.some((n) => n < 0)) {
    return 0;
  }

  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

const POLL_INTERVAL_MS = 60_000;

export function useVersionPoller(): VersionPollerResult {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const installedRef = useRef<VersionInfo | null>(null);
  const disabledRef = useRef(false);

  useEffect(() => {
    // Prevent duplicate intervals across strict-mode double-mounts
    if (intervalRef.current !== null) return;

    let cancelled = false;

    async function init() {
      // Step 1: Get installed version (once)
      try {
        const installed = await invoke<VersionInfo>("get_installed_version");
        installedRef.current = installed;
        console.log("[VersionPoller] Installed:", installed.version, installed.commit);
      } catch (err) {
        console.warn("[VersionPoller] get_installed_version failed, disabling feature:", err);
        disabledRef.current = true;
        return;
      }

      // Step 2: Start polling
      if (!cancelled) {
        pollOnce(); // immediate first poll
        intervalRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);
      }
    }

    async function pollOnce() {
      if (disabledRef.current || !installedRef.current) return;

      try {
        const repo = await invoke<VersionInfo>("read_repo_version");
        const installed = installedRef.current;

        const cmp = compareSemver(repo.version, installed.version);
        if (cmp === 0 && repo.version === installed.version) {
          // Versions equal — check if parse succeeded (cmp would be 0 for parse failures too)
          // Versions truly equal — check commit
          if (repo.commit !== installed.commit) {
            setUpdateAvailable(true);
            setAvailableVersion(repo.version);
          } else {
            setUpdateAvailable(false);
            setAvailableVersion(null);
          }
        } else if (cmp > 0) {
          // Repo version is newer
          setUpdateAvailable(true);
          setAvailableVersion(repo.version);
        } else {
          // Installed is same or newer (or parse failed)
          setUpdateAvailable(false);
          setAvailableVersion(null);
        }
      } catch (err) {
        // repo_unavailable — stay silent, no UI
        console.warn("[VersionPoller] read_repo_version failed:", err);
        setUpdateAvailable(false);
        setAvailableVersion(null);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return { updateAvailable, availableVersion };
}
