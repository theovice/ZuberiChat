import { useCallback, useRef } from 'react';
import { Plus, X, FileText, Image, Film, Music, Archive, File } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type QueuedFile = {
  id: string;
  file: File;
  name: string;
  size: number;
  /** 'pending' → 'uploading' → 'done' | 'error' */
  status: 'pending' | 'uploading' | 'done' | 'error';
  /** Local workspace path after upload completes */
  localPath?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext))
    return <Image size={14} />;
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext))
    return <Film size={14} />;
  if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext))
    return <Music size={14} />;
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext))
    return <Archive size={14} />;
  if (['txt', 'md', 'json', 'csv', 'xml', 'yaml', 'toml', 'log'].includes(ext))
    return <FileText size={14} />;
  return <File size={14} />;
}

// ---------------------------------------------------------------------------
// AttachButton — the "+" trigger (Claude Code style)
// ---------------------------------------------------------------------------
type AttachButtonProps = {
  onFiles: (files: FileList) => void;
};

export function AttachButton({ onFiles }: AttachButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onFiles(e.target.files);
        // Reset so the same file can be re-selected
        e.target.value = '';
      }
    },
    [onFiles],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={handleClick}
        aria-label="Attach files"
        title="Attach files"
        className="attach-btn flex items-center justify-center rounded-md transition-colors"
        style={{ width: 28, height: 28 }}
      >
        <Plus size={18} />
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// FileChips — row of queued file badges (Claude Code style: icon + name + ×)
// ---------------------------------------------------------------------------
type FileChipsProps = {
  files: QueuedFile[];
  onRemove: (id: string) => void;
};

export function FileChips({ files, onRemove }: FileChipsProps) {
  if (files.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-1.5"
      style={{ paddingBottom: 8, paddingTop: 2 }}
    >
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-1.5 rounded text-xs"
          style={{
            padding: '4px 8px',
            maxWidth: 200,
            background: 'var(--surface-interactive)',
            color: 'var(--accent-primary)',
            opacity: f.status === 'error' ? 0.5 : 1,
          }}
        >
          {fileIcon(f.name)}
          <span
            className="truncate"
            style={{ maxWidth: 140 }}
            title={f.name}
          >
            {f.name}
          </span>
          {f.status === 'uploading' && (
            <span style={{ fontSize: '0.65rem', color: 'var(--ember)' }}>
              ...
            </span>
          )}
          <button
            type="button"
            onClick={() => onRemove(f.id)}
            className="file-chip-remove ml-0.5 transition-colors"
            aria-label={`Remove ${f.name}`}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
