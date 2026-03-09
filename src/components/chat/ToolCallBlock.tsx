/**
 * ToolCallBlock — renders a toolCall content block.
 * Shows tool name + collapsible argument details.
 */
import { useState } from 'react';
import { Terminal, ChevronRight, ChevronDown } from 'lucide-react';

type ToolCallBlockProps = {
  toolName: string;
  args?: Record<string, unknown>;
};

export function ToolCallBlock({ toolName, args }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const hasArgs = args && Object.keys(args).length > 0;

  return (
    <div className="tool-block tool-block--call">
      <button
        className="tool-block-header"
        onClick={() => hasArgs && setExpanded(!expanded)}
        style={{ cursor: hasArgs ? 'pointer' : 'default' }}
        type="button"
      >
        <Terminal size={14} className="tool-block-icon" />
        <span className="tool-block-name">{toolName}</span>
        {hasArgs && (
          <span className="tool-block-chevron">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
      </button>
      {expanded && hasArgs && (
        <pre className="tool-block-detail">
          {JSON.stringify(args, null, 2)}
        </pre>
      )}
    </div>
  );
}
