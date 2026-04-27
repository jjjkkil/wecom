import { extractAgentId, extractMsgId } from "../shared/xml-parser.js";
import type {
  ResolvedAgentAccount,
  WecomAgentPostReplyHandlerConfig,
  WecomAgentEventRouteConfig,
  WecomAgentInboundMessage,
} from "../types/index.js";
import type { WecomRuntimeAuditEvent } from "../types/runtime-context.js";
import { runAgentEventScript, type AgentEventScriptEnvelope } from "./script-runner.js";

type ExecutableScriptHandler = WecomAgentPostReplyHandlerConfig;

export type AgentInboundEventRouteResult = {
  handled: boolean;
  chainToAgent: boolean;
  replyText?: string;
  matchedRouteId?: string;
  reason: string;
  error?: string;
};

export type ResolvedAgentInboundEventRoute = {
  matched: boolean;
  route?: WecomAgentEventRouteConfig;
  matchedRouteId?: string;
  eventKey: string;
  changeType: string;
  reason: string;
  chainToAgent: boolean;
};

// 统一比较口径：事件类型按小写处理
function normalizeLower(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

// 事件键值按原大小写保留，仅做首尾清理
function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function testPatternSafe(params: {
  pattern: string;
  value: string;
  onInvalidPattern?: (errorMessage: string) => void;
}): boolean {
  try {
    return new RegExp(params.pattern).test(params.value);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    params.onInvalidPattern?.(message);
    // 配置了非法正则时按“不匹配”处理，避免中断 webhook 主流程
    return false;
  }
}

function matchesRoute(params: {
  route: WecomAgentEventRouteConfig;
  eventType: string;
  changeType: string;
  eventKey: string;
  onInvalidPattern?: (errorMessage: string) => void;
}): boolean {
  // 三层匹配：eventType -> changeType/eventKey（含 prefix/regex）
  const when = params.route.when ?? {};

  if (when.eventType && normalizeLower(when.eventType) !== params.eventType) return false;
  if (when.changeType && normalizeLower(when.changeType) !== params.changeType) return false;
  if (when.eventKey && normalizeText(when.eventKey) !== params.eventKey) return false;
  if (when.eventKeyPrefix && !params.eventKey.startsWith(normalizeText(when.eventKeyPrefix))) return false;
  if (when.eventKeyPattern && !testPatternSafe({
    pattern: when.eventKeyPattern,
    value: params.eventKey,
    onInvalidPattern: params.onInvalidPattern,
  })) return false;

  return true;
}

function buildScriptEnvelope(params: {
  accountId: string;
  msgType: string;
  eventType: string;
  eventKey: string;
  changeType: string;
  fromUser: string;
  toUser?: string;
  chatId?: string;
  msg: WecomAgentInboundMessage;
  matchedRuleId: string;
  handlerType: "node_script" | "python_script";
  phase?: "post_reply";
  reply?: {
    sent: boolean;
    responseMode: "passive_reply";
    fallbackToSuccess: boolean;
    reason: string | null;
  };
}): AgentEventScriptEnvelope {
  // 透传给外部脚本：标准化字段 + 原始 XML 解析对象 raw
  const rawAgentId = extractAgentId(params.msg);
  const numericAgentId = typeof rawAgentId === "number"
    ? rawAgentId
    : Number.isFinite(Number(rawAgentId)) ? Number(rawAgentId) : null;

  return {
    version: "1.0",
    channel: "wecom",
    phase: params.phase,
    accountId: params.accountId,
    receivedAt: Date.now(),
    message: {
      msgType: params.msgType,
      eventType: params.eventType,
      eventKey: params.eventKey || null,
      changeType: params.changeType || null,
      fromUser: params.fromUser,
      toUser: params.toUser ?? null,
      chatId: params.chatId ?? null,
      agentId: numericAgentId,
      createTime: typeof params.msg.CreateTime === "number" ? params.msg.CreateTime : Number.isFinite(Number(params.msg.CreateTime)) ? Number(params.msg.CreateTime) : null,
      msgId: extractMsgId(params.msg) ?? null,
      raw: { ...(params.msg as Record<string, unknown>) },
    },
    route: {
      matchedRuleId: params.matchedRuleId,
      handlerType: params.handlerType,
    },
    reply: params.reply,
  };
}

function resolveExecutableHandler(route: WecomAgentEventRouteConfig): ExecutableScriptHandler | undefined {
  return route.postReplyHandler?.enabled === true ? route.postReplyHandler : undefined;
}

export function resolveAgentInboundEventRoute(params: {
  agent: ResolvedAgentAccount;
  msgType: string;
  eventType: string;
  fromUser: string;
  chatId?: string;
  msg: WecomAgentInboundMessage;
  log?: (msg: string) => void;
  auditSink?: (event: WecomRuntimeAuditEvent) => void;
}): ResolvedAgentInboundEventRoute {
  if (normalizeLower(params.msgType) !== "event") {
    return {
      matched: false,
      eventKey: "",
      changeType: "",
      reason: "not_event",
      chainToAgent: false,
    };
  }

  const routing = params.agent.config.eventRouting;
  const routes = routing?.routes ?? [];
  const changeType = normalizeLower(params.msg.ChangeType);
  const eventKey = normalizeText(params.msg.EventKey);
  // 路由采用“首个命中即执行”策略
  const matchedRoute = routes.find((route) => matchesRoute({
    route,
    eventType: params.eventType,
    changeType,
    eventKey,
    onInvalidPattern: (errorMessage) => {
      const routeId = route.id?.trim() || "anonymous";
      params.log?.(
        `[wecom-agent] invalid eventKeyPattern in route routeId=${routeId} pattern=${route.when?.eventKeyPattern ?? ""} error=${errorMessage}`,
      );
      params.auditSink?.({
        transport: "agent-callback",
        category: "runtime-error",
        messageId: extractMsgId(params.msg) ?? undefined,
        summary: `invalid route eventKeyPattern routeId=${routeId}`,
        raw: {
          transport: "agent-callback",
          envelopeType: "xml",
          body: params.msg,
        },
        error: `routeId=${routeId} pattern=${route.when?.eventKeyPattern ?? ""} error=${errorMessage}`,
      });
    },
  }));

  if (!matchedRoute) {
    // 未命中时由 unmatchedAction 决定：忽略 or 继续默认 AI 流程
    if (routing?.unmatchedAction === "forwardToAgent") {
      return {
        matched: false,
        eventKey,
        changeType,
        reason: "unmatched_event_forwardToAgent",
        chainToAgent: true,
      };
    }
    return {
      matched: false,
      eventKey,
      changeType,
      reason: "unmatched_event_ignored",
      chainToAgent: false,
    };
  }

  const matchedRouteId = matchedRoute.id?.trim() || `${params.eventType || "event"}:${eventKey || "default"}`;
  params.log?.(`[wecom-agent] event route matched routeId=${matchedRouteId} event=${params.eventType} eventKey=${eventKey || "N/A"}`);
  return {
    matched: true,
    route: matchedRoute,
    matchedRouteId,
    eventKey,
    changeType,
    reason: "matched_event_route",
    chainToAgent: false,
  };
}

export async function routeAgentInboundEvent(params: {
  agent: ResolvedAgentAccount;
  msgType: string;
  eventType: string;
  fromUser: string;
  chatId?: string;
  msg: WecomAgentInboundMessage;
  log?: (msg: string) => void;
  auditSink?: (event: WecomRuntimeAuditEvent) => void;
  resolvedRoute?: ResolvedAgentInboundEventRoute;
  postReplyContext?: {
    sent: boolean;
    responseMode: "passive_reply";
    fallbackToSuccess: boolean;
    reason: string | null;
  };
}): Promise<AgentInboundEventRouteResult> {
  const resolvedRoute = params.resolvedRoute ?? resolveAgentInboundEventRoute({
    agent: params.agent,
    msgType: params.msgType,
    eventType: params.eventType,
    msg: params.msg,
    log: params.log,
    auditSink: params.auditSink,
  });

  if (!resolvedRoute.matched) {
    return {
      handled: resolvedRoute.reason === "unmatched_event_ignored",
      chainToAgent: resolvedRoute.chainToAgent,
      reason: resolvedRoute.reason,
    };
  }

  const matchedRoute = resolvedRoute.route!;
  const matchedRouteId = resolvedRoute.matchedRouteId!;
  const eventKey = resolvedRoute.eventKey;
  const changeType = resolvedRoute.changeType;
  const executableHandler = resolveExecutableHandler(matchedRoute);

  if (!executableHandler) {
    return {
      handled: true,
      chainToAgent: false,
      matchedRouteId,
      reason: "route_without_handler",
    };
  }

  if (executableHandler.type === "builtin") {
    // 内置 handler：当前仅实现 echo，用于联调和最小可用场景
    if ((executableHandler.name ?? "echo") === "echo") {
      const replyText = [`event=${params.eventType}`,
        eventKey ? `eventKey=${eventKey}` : "",
        changeType ? `changeType=${changeType}` : "",
      ].filter(Boolean).join(" ");
      return {
        handled: true,
        chainToAgent: executableHandler.chainToAgent === true,
        replyText,
        matchedRouteId,
        reason: "builtin_echo",
      };
    }
  }

  if (executableHandler.type !== "node_script" && executableHandler.type !== "python_script") {
    return {
      handled: true,
      chainToAgent: false,
      matchedRouteId,
      reason: "unsupported_handler",
    };
  }

  try {
    // 外部脚本 handler：通过 stdin 输入 envelope，stdout 返回 JSON 协议
    const { response: scriptResponse, meta } = await runAgentEventScript({
      runtime: params.agent.config.scriptRuntime,
      handler: executableHandler,
      envelope: buildScriptEnvelope({
        accountId: params.agent.accountId,
        msgType: params.msgType,
        eventType: params.eventType,
        eventKey,
        changeType,
        fromUser: params.fromUser,
        toUser: typeof params.msg.ToUserName === "string" ? params.msg.ToUserName : undefined,
        chatId: params.chatId,
        msg: params.msg,
        matchedRuleId: matchedRouteId,
        handlerType: executableHandler.type,
        phase: params.postReplyContext ? "post_reply" : undefined,
        reply: params.postReplyContext,
      }),
    });

    params.auditSink?.({
      transport: "agent-callback",
      category: "inbound",
      messageId: extractMsgId(params.msg) ?? undefined,
      summary:
        `event route script ok routeId=${matchedRouteId} handler=${executableHandler.type} ` +
        `event=${params.eventType} durationMs=${meta.durationMs} exitCode=${meta.exitCode ?? "null"}`,
      raw: {
        transport: "agent-callback",
        envelopeType: "xml",
        body: params.msg,
      },
    });

    return {
      handled: true,
      chainToAgent:
        scriptResponse.chainToAgent === true || executableHandler.chainToAgent === true,
      replyText: scriptResponse.action === "reply_text" ? scriptResponse.reply?.text : undefined,
      matchedRouteId,
      reason: `script_${executableHandler.type}`,
    };
  } catch (err) {
    // 脚本失败时不抛出到上层，转为“已处理 + 审计错误”，避免中断 webhook 主流程
    const message = err instanceof Error ? err.message : String(err);
    params.log?.(
      `[wecom-agent] event route script failed routeId=${matchedRouteId} handler=${executableHandler.type} error=${message}`,
    );
    params.auditSink?.({
      transport: "agent-callback",
      category: "runtime-error",
      messageId: extractMsgId(params.msg) ?? undefined,
      summary: `event route script failed routeId=${matchedRouteId} handler=${executableHandler.type} event=${params.eventType}`,
      raw: {
        transport: "agent-callback",
        envelopeType: "xml",
        body: params.msg,
      },
      error: message,
    });
    return {
      handled: true,
      chainToAgent: false,
      matchedRouteId,
      reason: `script_${executableHandler.type}_error`,
      error: message,
    };
  }
}