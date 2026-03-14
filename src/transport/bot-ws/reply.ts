import { formatErrorMessage } from "openclaw/plugin-sdk";
import { generateReqId, type WsFrame, type BaseMessage, type EventMessage, type WSClient } from "@wecom/aibot-node-sdk";

import type { ReplyHandle, ReplyPayload } from "../../types/index.js";

const PLACEHOLDER_KEEPALIVE_MS = 3000;
const MAX_KEEPALIVE_MS = 120 * 1000; // Force stop keepalive after 120s if ignored

function isInvalidReqIdError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const errcode = "errcode" in error ? Number(error.errcode) : undefined;
  const errmsg = "errmsg" in error ? String(error.errmsg ?? "") : "";
  return errcode === 846605 || errmsg.includes("invalid req_id");
}

function isExpiredStreamUpdateError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const errcode = "errcode" in error ? Number(error.errcode) : undefined;
  const errmsg = "errmsg" in error ? String(error.errmsg ?? "").toLowerCase() : "";
  return errcode === 846608 || errmsg.includes("stream message update expired");
}

/** SDK rejects with a plain Error whose message contains "ack timeout" when
 * the WeCom server does not acknowledge a reply within 5 s.  Once timed out
 * the reqId slot is released; further replies on the same reqId will fail. */
function isAckTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("ack timeout");
}

function isTerminalReplyError(error: unknown): boolean {
  return isInvalidReqIdError(error) || isExpiredStreamUpdateError(error) || isAckTimeoutError(error);
}

// Global registry to track active keepalives by peerId
interface ActiveKeepalive {
  reqId: string;
  stop: () => void;
}
const activeKeepalivesByPeer = new Map<string, Set<ActiveKeepalive>>();

export function createBotWsReplyHandle(params: {
  client: WSClient;
  frame: WsFrame<BaseMessage | EventMessage>;
  accountId: string;
  inboundKind: string;
  placeholderContent?: string;
  autoSendPlaceholder?: boolean;
  onDeliver?: () => void;
  onFail?: (error: unknown) => void;
}): ReplyHandle {
  let streamId: string | undefined;
  let accumulatedText = "";
  const resolveStreamId = () => {
    streamId ||= generateReqId("stream");
    return streamId;
  };

  const placeholderText = params.placeholderContent?.trim() || "⏳ 正在思考中...\n\n";
  let streamSettled = false;
  let placeholderInFlight = false;
  let placeholderKeepalive: ReturnType<typeof setInterval> | undefined;
  let placeholderTimeout: ReturnType<typeof setTimeout> | undefined;

  // Extract peerId for clustering handles
  const body = params.frame.body as any;
  const peerId = String(
    (body?.chattype === "group" ? body?.chatid || body?.from?.userid : body?.from?.userid) || "unknown"
  );
  const reqId = params.frame.headers.req_id || "unknown";

  const isEvent = params.inboundKind === "welcome" || params.inboundKind === "event" || params.inboundKind === "template-card-event";

  const stopPlaceholderKeepalive = () => {
    if (placeholderKeepalive) {
      clearInterval(placeholderKeepalive);
      placeholderKeepalive = undefined;
    }
    if (placeholderTimeout) {
      clearTimeout(placeholderTimeout);
      placeholderTimeout = undefined;
    }
    
    // Remove from registry
    const keepalives = activeKeepalivesByPeer.get(peerId);
    if (keepalives) {
      for (const ka of keepalives) {
        if (ka.reqId === reqId) {
          keepalives.delete(ka);
        }
      }
      if (keepalives.size === 0) {
        activeKeepalivesByPeer.delete(peerId);
      }
    }
  };

  const settleStream = () => {
    if (streamSettled) return;
    streamSettled = true;
    stopPlaceholderKeepalive();
  };

  const sendPlaceholder = () => {
    if (streamSettled || placeholderInFlight || isEvent) return;
    placeholderInFlight = true;
    params.client.replyStream(params.frame, resolveStreamId(), placeholderText, false)
      .catch((error) => {
        if (!isTerminalReplyError(error)) {
          return;
        }
        settleStream();
        params.onFail?.(error);
      })
      .finally(() => {
        placeholderInFlight = false;
      });
  };

  const notifyPeerActive = () => {
    // A genuine reply or reasoning is happening on THIS handle.
    // It means the core SDK has chosen this handle to deliver the response.
    // We can safely terminate all other orphaned keepalives for this peer to prevent infinite loops.
    const keepalives = activeKeepalivesByPeer.get(peerId);
    if (keepalives) {
      for (const ka of keepalives) {
        if (ka.reqId !== reqId) {
          ka.stop();
        }
      }
    }
  };

  if (params.autoSendPlaceholder !== false && !isEvent) {
    sendPlaceholder();
    placeholderKeepalive = setInterval(() => {
      sendPlaceholder();
    }, PLACEHOLDER_KEEPALIVE_MS);
    
    // Safety net: force stop keepalive after MAX_KEEPALIVE_MS 
    // in case the message is completely ignored by the core and never triggers deliver/fail
    placeholderTimeout = setTimeout(() => {
      stopPlaceholderKeepalive();
    }, MAX_KEEPALIVE_MS);

    // Register keepalive
    let keepalives = activeKeepalivesByPeer.get(peerId);
    if (!keepalives) {
      keepalives = new Set();
      activeKeepalivesByPeer.set(peerId, keepalives);
    }
    keepalives.add({ reqId, stop: stopPlaceholderKeepalive });
  }

  return {
    context: {
      transport: "bot-ws",
      accountId: params.accountId,
      reqId: params.frame.headers.req_id,
      raw: {
        transport: "bot-ws",
        command: params.frame.cmd,
        headers: params.frame.headers,
        body: params.frame.body,
        envelopeType: "ws",
      },
    },
    deliver: async (payload: ReplyPayload, info) => {
      // Mark this chat as active on this handle
      notifyPeerActive();

      if (payload.isReasoning) {
        // We reset the safety timeout if reasoning is actively streaming
        if (placeholderTimeout && !isEvent) {
          clearTimeout(placeholderTimeout);
          placeholderTimeout = setTimeout(() => {
            stopPlaceholderKeepalive();
          }, MAX_KEEPALIVE_MS);
        }
        return;
      }

      const text = payload.text?.trim();
      if (!text) return;

      if (info.kind === "block") {
        accumulatedText = accumulatedText ? `${accumulatedText}\n${text}` : text;
      }

      const outboundText =
        info.kind === "final"
          ? accumulatedText
            ? text
              ? `${accumulatedText}\n${text}`
              : accumulatedText
            : text
          : accumulatedText || text;

      // Event frames do not support streaming chunks
      if (isEvent && info.kind !== "final") {
        return;
      }

      settleStream();
      try {
        if (params.inboundKind === "welcome") {
          await params.client.replyWelcome(params.frame, {
            msgtype: "text",
            text: { content: outboundText },
          });
        } else if (isEvent) {
          // Send push message for other events
          await params.client.sendMessage(peerId, {
            msgtype: "markdown",
            markdown: { content: outboundText },
          });
        } else {
          await params.client.replyStream(
            params.frame,
            resolveStreamId(),
            outboundText,
            info.kind === "final",
          );
        }
      } catch (error) {
        if (isTerminalReplyError(error)) {
          params.onFail?.(error);
          return;
        }
        throw error;
      }
      params.onDeliver?.();
    },
    fail: async (error: unknown) => {
      notifyPeerActive();
      settleStream();
      if (isTerminalReplyError(error)) {
        params.onFail?.(error);
        return;
      }
      const message = formatErrorMessage(error);
      const text = `WeCom WS reply failed: ${message}`;
      
      try {
        if (params.inboundKind === "welcome") {
            await params.client.replyWelcome(params.frame, { msgtype: "text", text: { content: text }});
        } else if (isEvent) {
            await params.client.sendMessage(peerId, {
              msgtype: "markdown",
              markdown: { content: text },
            });
        } else {
            await params.client.replyStream(params.frame, resolveStreamId(), text, true);
        }
      } catch (sendError) {
        params.onFail?.(sendError);
        return;
      }
      params.onFail?.(error);
    },
  };
}
