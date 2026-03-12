import { formatErrorMessage } from "openclaw/plugin-sdk";
import { generateReqId, type WsFrame, type BaseMessage, type EventMessage, type WSClient } from "@wecom/aibot-node-sdk";

import type { ReplyHandle, ReplyPayload } from "../../types/index.js";

const PLACEHOLDER_KEEPALIVE_MS = 3000;

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

export function createBotWsReplyHandle(params: {
  client: WSClient;
  frame: WsFrame<BaseMessage | EventMessage>;
  accountId: string;
  placeholderContent?: string;
  autoSendPlaceholder?: boolean;
  onDeliver?: () => void;
  onFail?: (error: unknown) => void;
}): ReplyHandle {
  let streamId: string | undefined;
  const resolveStreamId = () => {
    streamId ||= generateReqId("stream");
    return streamId;
  };

  const placeholderText = params.placeholderContent?.trim() || "⏳ 正在思考中...\n\n";
  let streamSettled = false;
  let placeholderInFlight = false;
  let placeholderKeepalive: ReturnType<typeof setInterval> | undefined;

  const stopPlaceholderKeepalive = () => {
    if (!placeholderKeepalive) return;
    clearInterval(placeholderKeepalive);
    placeholderKeepalive = undefined;
  };

  const settleStream = () => {
    streamSettled = true;
    stopPlaceholderKeepalive();
  };

  const sendPlaceholder = () => {
    if (streamSettled || placeholderInFlight) return;
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

  if (params.autoSendPlaceholder !== false) {
    sendPlaceholder();
    placeholderKeepalive = setInterval(() => {
      sendPlaceholder();
    }, PLACEHOLDER_KEEPALIVE_MS);
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
      if (payload.isReasoning) return;

      const text = payload.text?.trim();
      if (!text) return;

      settleStream();
      try {
        await params.client.replyStream(params.frame, resolveStreamId(), text, info.kind === "final");
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
      settleStream();
      if (isTerminalReplyError(error)) {
        params.onFail?.(error);
        return;
      }
      const message = formatErrorMessage(error);
      try {
        await params.client.replyStream(params.frame, resolveStreamId(), `WeCom WS reply failed: ${message}`, true);
      } catch (sendError) {
        params.onFail?.(sendError);
        return;
      }
      params.onFail?.(error);
    },
  };
}
