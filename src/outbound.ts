import type { ChannelOutboundAdapter, ChannelOutboundContext } from "openclaw/plugin-sdk";

import { resolveWecomAccount, resolveWecomAccountConflict, resolveWecomAccounts } from "./config/index.js";
import { WecomAgentDeliveryService } from "./capability/agent/index.js";
import { getBotWsPushHandle, getWecomRuntime } from "./app/index.js";

async function sendTextViaBotWs(accountId: string, to: string | { chatid?: string; touser?: string; toparty?: string; totag?: string }, text: string) {
  const pushHandle = getBotWsPushHandle(accountId);
  if (!pushHandle?.isConnected()) {
    return false;
  }

  const chatId = typeof to === "string" ? to : to.chatid || to.touser;
  if (!chatId) return false;

  await pushHandle.sendMarkdown(chatId, text);
  return true;
}

function resolveAgentConfigOrThrow(params: {
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
  const account = resolveWecomAccount({
    cfg: params.cfg,
    accountId: params.accountId,
  }).agent;
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
  console.log(`[wecom-outbound] Using agent config: accountId=${account.accountId}, corpId=${account.corpId}, agentId=${account.agentId}`);
  return account;
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

    const agent = resolveAgentConfigOrThrow({ cfg, accountId });
    const deliveryService = new WecomAgentDeliveryService(agent);

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
    const looksLikeNewSessionAck =
      /new session started/i.test(trimmed) && /model:/i.test(trimmed);

    if (looksLikeNewSessionAck) {
      if (!isAgentSessionTarget) {
        console.log(`[wecom-outbound] Suppressed command ack to avoid Bot/Agent double-reply (len=${trimmed.length})`);
        return { channel: "wecom", messageId: `suppressed-${Date.now()}`, timestamp: Date.now() };
      }

      const modelLabel = (() => {
        const m = trimmed.match(/model:\s*([^\n()]+)\s*/i);
        return m?.[1]?.trim();
      })();
      const rewritten = modelLabel ? `✅ 已开启新会话（模型：${modelLabel}）` : "✅ 已开启新会话。";
      console.log(`[wecom-outbound] Rewrote command ack for agent session (len=${rewritten.length})`);
      outgoingText = rewritten;
    }

    console.log(`[wecom-outbound] Sending text to target=${String(to ?? "")} (len=${outgoingText.length})`);

    try {
      const sentViaWs = await sendTextViaBotWs(agent.accountId, to, outgoingText);
      if (sentViaWs) {
        console.log(`[wecom-outbound] Successfully sent text via Bot WS to ${String(to ?? "")}`);
      } else {
        await deliveryService.sendText({
          to,
          text: outgoingText,
        });
        console.log(`[wecom-outbound] Successfully sent text via Agent API to ${String(to ?? "")}`);
      }
    } catch (err) {
      console.error(`[wecom-outbound] Failed to send text to ${String(to ?? "")}:`, err);
      throw err;
    }

    return {
      channel: "wecom",
      messageId: `sent-${Date.now()}`,
      timestamp: Date.now(),
    };
  },
  sendMedia: async ({ cfg, to, text, mediaUrl, accountId }: ChannelOutboundContext) => {
    // signal removed - not supported in current SDK

    const agent = resolveAgentConfigOrThrow({ cfg, accountId });
    const deliveryService = new WecomAgentDeliveryService(agent);
    if (!mediaUrl) {
      throw new Error("WeCom outbound requires mediaUrl.");
    }

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
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
        webp: "image/webp", bmp: "image/bmp", mp3: "audio/mpeg", wav: "audio/wav",
        amr: "audio/amr", mp4: "video/mp4", pdf: "application/pdf", doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        txt: "text/plain", csv: "text/csv", tsv: "text/tab-separated-values", md: "text/markdown", json: "application/json",
        xml: "application/xml", yaml: "application/yaml", yml: "application/yaml",
        zip: "application/zip", rar: "application/vnd.rar", "7z": "application/x-7z-compressed",
        tar: "application/x-tar", gz: "application/gzip", tgz: "application/gzip",
        rtf: "application/rtf", odt: "application/vnd.oasis.opendocument.text",
      };
      contentType = mimeTypes[ext] || "application/octet-stream";
      console.log(`[wecom-outbound] Reading local file: ${mediaUrl}, ext=${ext}, contentType=${contentType}`);
    }

    console.log(`[wecom-outbound] Sending media to ${String(to ?? "")} (filename=${filename}, contentType=${contentType})`);

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
      messageId: `agent-media-${Date.now()}`,
      timestamp: Date.now(),
    };
  },
};
