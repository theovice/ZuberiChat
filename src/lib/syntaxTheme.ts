/**
 * Custom syntax highlighting theme for Zuberi.
 * Warm-tinted dark theme matching the obsidian/ember aesthetic.
 * Based on Atom One Dark but shifted toward warm tones.
 */

export const zuberiDark: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': {
    color: '#e6dbcb',
    background: 'none',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    wordWrap: 'normal',
    lineHeight: '1.5',
    tabSize: 2,
    hyphens: 'none',
  },
  'pre[class*="language-"]': {
    color: '#e6dbcb',
    background: 'var(--surface-1)',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    wordWrap: 'normal',
    lineHeight: '1.5',
    tabSize: 2,
    hyphens: 'none',
    padding: '14px 16px',
    margin: 0,
    overflow: 'auto',
  },

  // Comments — warm muted
  comment: { color: '#6a6560', fontStyle: 'italic' },
  prolog: { color: '#6a6560' },
  doctype: { color: '#6a6560' },
  cdata: { color: '#6a6560' },

  // Punctuation
  punctuation: { color: '#9a958e' },

  // Namespace
  namespace: { opacity: 0.7 },

  // Tags, selectors — warm amber
  tag: { color: '#e0904a' },
  selector: { color: '#e0904a' },
  'attr-name': { color: '#d4a45a' },

  // Strings — warm green
  string: { color: '#a8c472' },
  'template-string': { color: '#a8c472' },
  char: { color: '#a8c472' },
  builtin: { color: '#a8c472' },
  inserted: { color: '#a8c472' },

  // Numbers, booleans — warm orange
  number: { color: '#d4955a' },
  boolean: { color: '#d4955a' },
  constant: { color: '#d4955a' },
  symbol: { color: '#d4955a' },

  // Keywords — warm coral/ember
  keyword: { color: '#d4806a' },
  atrule: { color: '#d4806a' },
  'attr-value': { color: '#d4806a' },

  // Functions — warm gold
  function: { color: '#e0c070' },
  'class-name': { color: '#e0c070' },

  // Regex, important — warm red
  regex: { color: '#c87060' },
  important: { color: '#c87060', fontWeight: 'bold' },

  // Variables — warm cream
  variable: { color: '#d4c8b0' },
  property: { color: '#d4c8b0' },

  // Operators
  operator: { color: '#9a958e' },

  // Entity
  entity: { color: '#d4a45a', cursor: 'help' },

  // Deleted
  deleted: { color: '#c87060' },

  // Bold, italic
  bold: { fontWeight: 'bold' },
  italic: { fontStyle: 'italic' },
};
