import { invoke } from "@tauri-apps/api/core";

export async function ensureOllama(): Promise<boolean> {
  try {
    return await invoke<boolean>("ensure_ollama");
  } catch (err) {
    console.error("[Ollama] ensure_ollama failed", err);
    return false;
  }
}

export async function launchOllama(): Promise<boolean> {
  try {
    await invoke("launch_ollama");
    // Poll briefly for it to come up
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 700));
      const live = await invoke<boolean>("check_ollama_live");
      if (live) return true;
    }
    return false;
  } catch (err) {
    console.error("[Ollama] launch_ollama failed", err);
    return false;
  }
}
