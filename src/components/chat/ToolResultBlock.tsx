/**
 * ToolResultBlock — renders a toolResult content block.
 * Shows tool name + result text (collapsible if >5 lines).
 */
import { useState } from 'react';
import { CheckCircle, ChevronRight, ChevronDown } from 'lucide-react';

type ToolResultBlockProps = {
  toolName: string;
  text: string;
};

export function ToolResultBlock({ toolName, text }: ToolResultBlockProps) {
  const lineCount = text.split('\n').length;
  const isLong = lineCount > 5;
  const [expanded, setExpanded] = useState(!isLong);

  return (
    <div className="tool-block tool-block--result">
      <button
        className="tool-block-header"
        onClick={() => isLong && setExpanded(!expanded)}
        style={{ cursor: isLong ? 'pointer' : 'default' }}
        type="button"
      >
        <CheckCircle size={14} className="tool-block-icon tool-block-icon--result" />
        <span className="tool-block-name">{toolName}</span>
        {isLong && (
          <span className="tool-block-chevron">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
      </button>
      {expanded && (
        <pre className="tool-block-detail">
          {text}
        </pre>
      )}
      {!expanded && isLong && (
        <pre className="tool-block-detail tool-block-detail--truncated">
          {text.split('\n').slice(0, 3).join('\n')}
          {'\n...'}
        </pre>
      )}
    </div>
  );
}
