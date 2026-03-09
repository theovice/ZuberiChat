/**
 * Message types for Zuberi chat — supports both plain text and structured OpenClaw content blocks.
 */

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'toolCall'; toolName: string; args?: Record<string, unknown>; id?: string }
  | { type: 'toolResult'; toolName: string; text: string; id?: string };

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  blocks?: ContentBlock[];
};
