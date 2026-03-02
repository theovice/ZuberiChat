import { useState } from 'react';
import type { WebSocketMessage } from '@/hooks/useWebSocket';

type ModeOption = {
  label: string;
  value: string;
};

const MODE_OPTIONS: ModeOption[] = [
  { label: 'Auto accept edits', value: 'off' },
  { label: 'Ask permissions', value: 'on-miss' },
  { label: 'Always ask', value: 'always' },
];

const STORAGE_KEY = 'zuberi:exec-mode';

type ModeSelectorProps = {
  send: (msg: WebSocketMessage) => void;
  sessionKey: string;
};

export function ModeSelector({ send, sessionKey }: ModeSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || 'off';
  });

  const handleModeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedMode(value);
    localStorage.setItem(STORAGE_KEY, value);

    send({
      type: 'req',
      id: crypto.randomUUID(),
      method: 'sessions.patch',
      params: {
        key: sessionKey,
        execAsk: value,
      },
    });
  };

  return (
    <select
      value={selectedMode}
      onChange={handleModeChange}
      className="h-8 w-[180px] border border-[#4a4947] bg-[#2b2a28] px-2 text-xs text-[#b0afae] outline-none focus:ring-0"
    >
      {MODE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
