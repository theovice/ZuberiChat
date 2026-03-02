import { useEffect, useState } from 'react';

type GpuInfo = {
  modelName: string | null;
  vramBytes: number | null;
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function GpuStatus() {
  const [gpu, setGpu] = useState<GpuInfo>({ modelName: null, vramBytes: null });

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      fetch('http://localhost:11434/api/ps')
        .then((res) => res.json())
        .then((data: { models?: { name: string; size_vram?: number }[] }) => {
          if (cancelled) return;
          const loaded = data.models?.[0];
          if (loaded) {
            setGpu({ modelName: loaded.name, vramBytes: loaded.size_vram ?? null });
          } else {
            setGpu({ modelName: null, vramBytes: null });
          }
        })
        .catch(() => {
          if (!cancelled) setGpu({ modelName: null, vramBytes: null });
        });
    };

    poll();
    const id = setInterval(poll, 5000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex items-center gap-1.5 text-[10px] text-[#807e7c]">
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: gpu.modelName ? '#4ade80' : '#6b7280' }}
      />
      <span className="truncate whitespace-nowrap">
        {gpu.modelName
          ? `${gpu.modelName}${gpu.vramBytes != null ? ` \u00b7 ${formatBytes(gpu.vramBytes)}` : ''}`
          : 'No model loaded'}
      </span>
    </div>
  );
}
