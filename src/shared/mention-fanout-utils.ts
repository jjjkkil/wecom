/**
 * Shared utilities for group mention fanout processing
 * Used by both webhook and WS bot transports
 */

import { getAccountRuntime } from "../app/index.js";
import type { WecomWebhookTarget } from "../types/runtime-context.js";
import type { ResolvedBotAccount } from "../types/index.js";

export function resolveFanoutEnabled(config: any): boolean {
  const enabled = config?.channels?.wecom?.routing?.fanoutMentionsInGroup;
  return enabled === true;
}

const DEFAULT_FANOUT_DEDUPE_WINDOW_MS = 120_000;
const MIN_FANOUT_DEDUPE_WINDOW_MS = 1_000;
const MAX_FANOUT_DEDUPE_WINDOW_MS = 1_800_000;

export function resolveFanoutDedupeWindowMs(config: any): number {
  const raw = config?.channels?.wecom?.routing?.fanoutDedupeWindowMs;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_FANOUT_DEDUPE_WINDOW_MS;
  }
  const normalized = Math.trunc(parsed);
  return Math.max(
    MIN_FANOUT_DEDUPE_WINDOW_MS,
    Math.min(MAX_FANOUT_DEDUPE_WINDOW_MS, normalized),
  );
}

export function buildFanoutDeliveryDedupeKey(params: {
  sourceAccountId: string;
  targetAccountId: string;
  peerId: string;
  senderId: string;
  messageId?: string;
  reqId?: string;
}): string {
  const messageIdentity = String(params.messageId ?? "").trim() || String(params.reqId ?? "").trim() || "no-msg";
  return [
    String(params.sourceAccountId ?? "").trim(),
    String(params.targetAccountId ?? "").trim(),
    String(params.peerId ?? "").trim(),
    String(params.senderId ?? "").trim(),
    messageIdentity,
  ].join("|");
}

export function summarizeTextForLog(text: string, maxChars = 180): string {
  const compact = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars)}...(truncated)`;
}

export function extractMentionedAccountIds(params: {
  text: string;
  aliasToAccountId: Map<string, string>;
}): string[] {
  const text = String(params.text ?? "");
  if (params.aliasToAccountId.size === 0 || !text.trim()) return [];

  const found = new Set<string>();
  // Patterns for mention detection:
  // 1. <@id> format - commonly used in structured mentions
  // 2. @name format followed by space (e.g., "@红机器人 " or "@bot-red ")
  // 3. wecom:alias format for explicit namespacing
  const patterns = [
    /<@([^>\s]{1,64})>/g,
    /@([^\s@，。！？、；：,.!?;:]{1,64})(?=\s)/g,  // @ followed by name, must have space after
    /\bwecom:([^\s,;:!?，。！？、；：]{1,64})\b/g,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = String(match[1] ?? "").trim().toLowerCase();
      const resolved = params.aliasToAccountId.get(raw);
      if (resolved) {
        found.add(resolved);
      }
    }
  }

  return Array.from(found);
}

export function buildMentionAliasLookup(config: any): Map<string, string> {
  const lookup = new Map<string, string>();
  const accounts = config?.channels?.wecom?.accounts ?? {};
  for (const [accountIdRaw, accountCfg] of Object.entries(accounts)) {
    const accountId = String(accountIdRaw ?? "").trim();
    if (!accountId) continue;
    const aliases = new Set<string>();
    aliases.add(accountId);

    const name = String((accountCfg as any)?.name ?? "").trim();
    if (name) aliases.add(name);

    const bot = (accountCfg as any)?.bot ?? {};
    const aibotid = String(bot?.aibotid ?? "").trim();
    if (aibotid) aliases.add(aibotid);
    for (const botId of Array.isArray(bot?.botIds) ? bot.botIds : []) {
      const v = String(botId ?? "").trim();
      if (v) aliases.add(v);
    }

    for (const alias of aliases) {
      lookup.set(alias.toLowerCase(), accountId);
    }
  }
  return lookup;
}
