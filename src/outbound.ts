import type { ChannelOutboundAdapter, ChannelOutboundContext } from "openclaw/plugin-sdk";
import { WecomAgentDeliveryService } from "./capability/agent/index.js";
import { toWeComMarkdownV2 } from "./wecom_msg_adapter/markdown_adapter.js";
import {
  resolveWecomMergedMediaLocalRoots,
  resolveWecomMediaMaxBytes,
  resolveWecomAccount,
  resolveWecomAccountConflict,
  resolveWecomAccounts,
} from "./config/index.js";
import { getAccountRuntime, getBotWsPushHandle, getWecomRuntime } from "./runtime.js";
import { resolveScopedWecomTarget } from "./target.js";

function resolveOutboundAccountOrThrow(params: {
  cfg: ChannelOutboundContext["cfg"];
  accountId?: string | null;
}) {
  const resolvedAccounts = resolveWecomAccounts(params.cfg);
  const conflictAccountId = params.accountId?.trim() || resolvedAccounts.defaultAccountId;
  const conflict = resolveWecomAccountConflict({
    cfg: params.cfg,
    accountId: conflictAccountId,
  });
  if (conflict) {
    throw new Error(conflict.message);
  }

  const requestedAccountId = params.accountId?.trim();
  if (requestedAccountId) {
    if (!resolvedAccounts.accounts[requestedAccountId]) {
      throw new Error(
        `WeCom outbound account "${requestedAccountId}" not found. Configure channels.wecom.accounts.${requestedAccountId} or use an existing accountId.`,
      );
    }
  }
  return resolveWecomAccount({
    cfg: params.cfg,
    accountId: params.accountId,
  });
}

function resolveAgentConfigOrThrow(params: {
  cfg: ChannelOutboundContext["cfg"];
  accountId?: string | null;
}) {
  const account = resolveOutboundAccountOrThrow(params).agent;
  if (!account?.apiConfigured) {
    throw new Error(
      `WeCom outbound requires Agent mode for account=${params.accountId ?? "default"}. Configure channels.wecom.accounts.<accountId>.agent (or legacy channels.wecom.agent).`,
    );
  }
  if (typeof account.agentId !== "number" || !Number.isFinite(account.agentId)) {
    throw new Error(
      `WeCom outbound requires channels.wecom.accounts.<accountId>.agent.agentId (or legacy channels.wecom.agent.agentId) for account=${params.accountId ?? account.accountId}.`,
    );
  }
  // 注意：不要在日志里输出 corpSecret 等敏感信息
  getAccountRuntime(account.accountId)?.log.info?.(
    `[wecom-outbound] Using agent config: accountId=${account.accountId}, corpId=${account.corpId}, agentId=${account.agentId}`,
  );
  return account;
}

function isExplicitAgentTarget(raw: string | undefined): boolean {
  return /^wecom-agent:/i.test(String(raw ?? "").trim());
}

function resolveBotWsChatTarget(params: {
  to: string | undefined;
  accountId: string;
}): string | undefined {
  const scoped = resolveScopedWecomTarget(params.to, params.accountId);
  if (!scoped) {
    return undefined;
  }
  if (scoped.accountId && scoped.accountId !== params.accountId) {
    throw new Error(
      `WeCom outbound account mismatch: target belongs to account=${scoped.accountId}, current account=${params.accountId}.`,
    );
  }
  if (scoped.target.chatid) {
    return scoped.target.chatid;
  }
  if (scoped.target.touser) {
    return scoped.target.touser;
  }
  return undefined;
}

function shouldPreferBotWsOutbound(params: {
  cfg: ChannelOutboundContext["cfg"];
  accountId?: string | null;
  to: string | undefined;
}): { preferred: boolean; accountId: string } {
  const account = resolveOutboundAccountOrThrow({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  return {
    preferred:
      !isExplicitAgentTarget(params.to) &&
      Boolean(
        account.bot?.configured &&
        account.bot.primaryTransport === "ws" &&
        account.bot.wsConfigured,
      ),
    accountId: account.accountId,
  };
}

async function sendTextViaBotWs(params: {
  cfg: ChannelOutboundContext["cfg"];
  accountId?: string | null;
  to: string | undefined;
  text: string;
}): Promise<boolean> {
  const { preferred, accountId } = shouldPreferBotWsOutbound(params);
  if (!preferred) {
    return false;
  }
  const chatId = resolveBotWsChatTarget({
    to: params.to,
    accountId,
  });
  if (!chatId) {
    return false;
  }
  const handle = getBotWsPushHandle(accountId);
  if (!handle) {
    throw new Error(
      `WeCom outbound account=${accountId} is configured for Bot WS active push, but no live WS runtime is registered.`,
    );
  }
  if (!handle.isConnected()) {
    throw new Error(
      `WeCom outbound account=${accountId} is configured for Bot WS active push, but the WS transport is not connected.`,
    );
  }
  const markdownText = toWeComMarkdownV2(params.text);
  console.log(
    `[wecom-outbound] Sending Bot WS active message to target=${String(params.to ?? "")} chatId=${chatId} (len=${markdownText.length})`,
  );
  await handle.sendMarkdown(chatId, markdownText);
  console.log(`[wecom-outbound] Successfully sent Bot WS active message to ${chatId}`);
  return true;
}

async function sendMediaViaBotWs(params: {
  cfg: ChannelOutboundContext["cfg"];
  accountId?: string | null;
  to: string | undefined;
  mediaUrl: string;
  text?: string;
  mediaLocalRoots?: readonly string[];
}): Promise<{
  attempted: boolean;
  sent: boolean;
  reason?: string;
}> {
  const { preferred, accountId } = shouldPreferBotWsOutbound(params);
  if (!preferred) {
    return { attempted: false, sent: false };
  }
  const chatId = resolveBotWsChatTarget({
    to: params.to,
    accountId,
  });
  if (!chatId) {
    return { attempted: false, sent: false };
  }
  const handle = getBotWsPushHandle(accountId);
  if (!handle) {
    throw new Error(
      `WeCom outbound account=${accountId} is configured for Bot WS active push, but no live WS runtime is registered.`,
    );
  }
  if (!handle.isConnected()) {
    throw new Error(
      `WeCom outbound account=${accountId} is configured for Bot WS active push, but the WS transport is not connected.`,
    );
  }
  console.log(
    `[wecom-outbound] Sending Bot WS media to target=${String(params.to ?? "")} chatId=${chatId} media=${params.mediaUrl}`,
  );
  const effectiveMediaLocalRoots = resolveWecomMergedMediaLocalRoots({
    cfg: params.cfg,
    baseRoots: params.mediaLocalRoots,
  });
  const result = await handle.sendMedia({
    chatId,
    mediaUrl: params.mediaUrl,
    text: params.text,
    mediaLocalRoots: effectiveMediaLocalRoots,
    maxBytes: resolveWecomMediaMaxBytes(params.cfg, accountId),
  });
  if (result.ok) {
    console.log(`[wecom-outbound] Successfully sent Bot WS media to ${chatId}`);
    return { attempted: true, sent: true };
  }
  const reason = result.rejectReason || result.error || "unknown";
  console.warn(`[wecom-outbound] Bot WS media failed for ${chatId}: ${reason}`);
  return { attempted: true, sent: false, reason };
}

export const wecomOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunkerMode: "text",
  textChunkLimit: 20480,
  chunker: (text, limit) => {
    try {
      return getWecomRuntime().channel.text.chunkText(text, limit);
    } catch {
      return [text];
    }
  },
  sendText: async ({ cfg, to, text, accountId }: ChannelOutboundContext) => {
    // signal removed - not supported in current SDK
    // Defer Agent resolution until the Agent fallback path
    // sendTextViaBotWs() can already deliver without Agent mode

    // 体验优化：/new /reset 的“New session started”回执在 OpenClaw 核心里是英文固定文案，
    // 且通过 routeReply 走 wecom outbound（Agent 主动发送）。
    // 在 WeCom“双模式”场景下，这会造成：
    // - 用户在 Bot 会话发 /new，但却收到一条 Agent 私信回执（双重回复/错会话）。
    // 因此：
    // - Bot 会话目标：抑制该回执（Bot 会话里由 wecom 插件补中文回执）。
    // - Agent 会话目标（wecom-agent:）：允许发送，但改写成中文。
    let outgoingText = text;
    const trimmed = String(outgoingText ?? "").trim();
    const rawTo = typeof to === "string" ? to.trim().toLowerCase() : "";
    const isAgentSessionTarget = rawTo.startsWith("wecom-agent:");
    const looksLikeNewSessionAck = /new session started/i.test(trimmed) && /model:/i.test(trimmed);

    if (looksLikeNewSessionAck) {
      if (!isAgentSessionTarget) {
        // Suppress ack without agent resolution
        return { channel: "wecom", messageId: `suppressed-${Date.now()}`, timestamp: Date.now() };
      }

      const modelLabel = (() => {
        const m = trimmed.match(/model:\s*([^\n()]+)\s*/i);
        return m?.[1]?.trim();
      })();
      const rewritten = modelLabel ? `✅ 已开启新会话（模型：${modelLabel}）` : "✅ 已开启新会话。";
      outgoingText = rewritten;
    }

    let sentViaBotWs = false;
    let agent: any = null;

    try {
      sentViaBotWs = await sendTextViaBotWs({
        cfg,
        accountId,
        to,
        text: outgoingText,
      });
      if (!sentViaBotWs) {
        // Defer Agent resolution until needed for fallback
        agent = resolveAgentConfigOrThrow({ cfg, accountId });
        getAccountRuntime(agent.accountId)?.log.info?.(
          `[wecom-outbound] Sending text to target=${String(to ?? "")} (len=${outgoingText.length})`,
        );
        const deliveryService = new WecomAgentDeliveryService(agent);
        await deliveryService.sendText({
          to,
          text: outgoingText,
        });
        console.log(`[wecom-outbound] Successfully sent Agent text to ${String(to ?? "")}`);
      }
    } catch (err) {
      if (agent) {
        getAccountRuntime(agent.accountId)?.log.error?.(
          `[wecom-outbound] Failed to send text to ${String(to ?? "")}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      throw err;
    }

    return {
      channel: "wecom",
      messageId: `${sentViaBotWs ? "bot-ws" : "agent"}-${Date.now()}`,
      timestamp: Date.now(),
    };
  },
  sendMedia: async ({
    cfg,
    to,
    text,
    mediaUrl,
    accountId,
    mediaLocalRoots,
  }: ChannelOutboundContext) => {
    // signal removed - not supported in current SDK
    if (!mediaUrl) {
      throw new Error("WeCom outbound requires mediaUrl.");
    }

    const botWs = await sendMediaViaBotWs({
      cfg,
      accountId,
      to,
      text,
      mediaUrl,
      mediaLocalRoots,
    });
    if (botWs.sent) {
      return {
        channel: "wecom",
        messageId: `bot-ws-media-${Date.now()}`,
        timestamp: Date.now(),
      };
    }
    if (botWs.attempted) {
      throw new Error(
        `WeCom Bot WS media delivery failed for ${String(to ?? "")}: ${botWs.reason ?? "unknown"}`,
      );
    }

    const agent = resolveAgentConfigOrThrow({ cfg, accountId });
    const deliveryService = new WecomAgentDeliveryService(agent);

    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    // 判断是 URL 还是本地文件路径
    const isRemoteUrl = /^https?:\/\//i.test(mediaUrl);

    if (isRemoteUrl) {
      const res = await fetch(mediaUrl, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) {
        throw new Error(`Failed to download media: ${res.status}`);
      }
      buffer = Buffer.from(await res.arrayBuffer());
      contentType = res.headers.get("content-type") || "application/octet-stream";
      const urlPath = new URL(mediaUrl).pathname;
      filename = urlPath.split("/").pop() || "media";
    } else {
      // 本地文件路径
      const fs = await import("node:fs/promises");
      const path = await import("node:path");

      buffer = await fs.readFile(mediaUrl);
      filename = path.basename(mediaUrl);

      // 根据扩展名推断 content-type
      const ext = path.extname(mediaUrl).slice(1).toLowerCase();
      const mimeTypes: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        bmp: "image/bmp",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        amr: "audio/amr",
        mp4: "video/mp4",
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ppt: "application/vnd.ms-powerpoint",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        txt: "text/plain",
        csv: "text/csv",
        tsv: "text/tab-separated-values",
        md: "text/markdown",
        json: "application/json",
        xml: "application/xml",
        yaml: "application/yaml",
        yml: "application/yaml",
        zip: "application/zip",
        rar: "application/vnd.rar",
        "7z": "application/x-7z-compressed",
        tar: "application/x-tar",
        gz: "application/gzip",
        tgz: "application/gzip",
        rtf: "application/rtf",
        odt: "application/vnd.oasis.opendocument.text",
      };
      contentType = mimeTypes[ext] || "application/octet-stream";
      console.log(
        `[wecom-outbound] Reading local file: ${mediaUrl}, ext=${ext}, contentType=${contentType}`,
      );
    }

    console.log(
      `[wecom-outbound] Sending media to ${String(to ?? "")} (filename=${filename}, contentType=${contentType})`,
    );

    try {
      await deliveryService.sendMedia({
        to,
        text,
        buffer,
        filename,
        contentType,
      });
      console.log(`[wecom-outbound] Successfully sent media to ${String(to ?? "")}`);
    } catch (err) {
      console.error(`[wecom-outbound] Failed to send media to ${String(to ?? "")}:`, err);
      throw err;
    }

    return {
      channel: "wecom",
      messageId: `${botWs.attempted ? "agent-fallback-media" : "agent-media"}-${Date.now()}`,
      timestamp: Date.now(),
    };
  },
};
