import { useEffect, useState } from 'react';
import type { WebSocketMessage } from '@/hooks/useWebSocket';

type ModelEntry = {
  id: string;
  name: string;
  parameterSize?: string;
  family?: string;
};

const STORAGE_KEY = 'zuberi:selected-model';
const CLEAR_GPU_VALUE = '__clear_gpu__';

type ModelSelectorProps = {
  send: (msg: WebSocketMessage) => void;
  isConnected: boolean;
  sessionKey: string;
  /** Models list populated from Ollama on KILO. */
  models: ModelEntry[];
  /** Called when user selects "Clear GPU". */
  onClearGpu?: () => void;
  /** Called when dropdown is opened — triggers model list refresh. */
  onOpen?: () => void;
};

export function ModelSelector({ send, isConnected, sessionKey, models, onClearGpu, onOpen }: ModelSelectorProps) {
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || '';
  });

  // Sync selection when models list changes
  useEffect(() => {
    if (models.length === 0) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    const matchesStored = stored && models.some((m) => m.id === stored);
    if (matchesStored) {
      setSelectedModel(stored);
    } else {
      setSelectedModel(models[0].id);
      localStorage.setItem(STORAGE_KEY, models[0].id);
    }
  }, [models]);

  const handleModelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;

    if (value === CLEAR_GPU_VALUE) {
      onClearGpu?.();
      return; // Don't update selection — keeps previous model selected
    }

    setSelectedModel(value);
    localStorage.setItem(STORAGE_KEY, value);

    send({
      type: 'req',
      id: crypto.randomUUID(),
      method: 'sessions.patch',
      params: {
        key: sessionKey,
        model: value,
      },
    });
  };

  const loading = isConnected && models.length === 0;

  return (
    <select
      value={selectedModel}
      onChange={handleModelChange}
      onFocus={onOpen}
      disabled={loading || models.length === 0}
      className="h-7 w-[140px] border border-[#4a4947] bg-[#2b2a28] px-2 text-xs text-[#b0afae] outline-none focus:ring-0 disabled:opacity-50"
    >
      {loading && <option value="">Loading...</option>}
      {!loading && models.length === 0 && <option value="">No models</option>}
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
      {models.length > 0 && (
        <option value={CLEAR_GPU_VALUE}>
          ⏏ Clear GPU
        </option>
      )}
    </select>
  );
}
