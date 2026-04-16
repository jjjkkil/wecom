import path from "node:path";
import { spawn } from "node:child_process";

import type {
  WecomAgentEventRouteHandlerConfig,
  WecomAgentScriptRuntimeConfig,
} from "../types/index.js";

export type AgentEventScriptEnvelope = {
  version: "1.0";
  channel: "wecom";
  accountId: string;
  receivedAt: number;
  message: {
    msgType: string;
    eventType: string;
    eventKey: string | null;
    changeType: string | null;
    fromUser: string;
    toUser: string | null;
    chatId: string | null;
    agentId: number | null;
    createTime: number | null;
    msgId: string | null;
    raw: Record<string, unknown>;
  };
  route: {
    matchedRuleId: string;
    handlerType: "node_script" | "python_script";
  };
};

export type AgentEventScriptResponse = {
  ok?: boolean;
  action?: "none" | "reply_text";
  reply?: {
    text?: string;
  };
  chainToAgent?: boolean;
  audit?: {
    tags?: string[];
  };
  error?: string;
};

export type AgentEventScriptExecutionMeta = {
  command: string;
  entryPath: string;
  durationMs: number;
  exitCode: number | null;
};

function resolveAllowedRoots(runtime: WecomAgentScriptRuntimeConfig): string[] {
  return (runtime.allowPaths ?? []).map((entry) => path.resolve(entry));
}

function resolveScriptEntry(entry: string): string {
  return path.resolve(entry);
}

function ensureScriptAllowed(entryPath: string, runtime: WecomAgentScriptRuntimeConfig): void {
  // 安全兜底：脚本执行必须显式开启
  if (runtime.enabled !== true) {
    throw new Error("script runtime is disabled");
  }
  // 安全兜底：必须配置允许目录，拒绝任意路径执行
  const roots = resolveAllowedRoots(runtime);
  if (roots.length === 0) {
    throw new Error("script runtime allowPaths is empty");
  }
  const allowed = roots.some((root) => entryPath === root || entryPath.startsWith(`${root}${path.sep}`));
  if (!allowed) {
    throw new Error(`script path is not allowed: ${entryPath}`);
  }
}

export async function runAgentEventScript(params: {
  runtime: WecomAgentScriptRuntimeConfig | undefined;
  handler: Extract<WecomAgentEventRouteHandlerConfig, { type: "node_script" | "python_script" }>;
  envelope: AgentEventScriptEnvelope;
}): Promise<{ response: AgentEventScriptResponse; meta: AgentEventScriptExecutionMeta }> {
  const runtime = params.runtime ?? {};
  const entryPath = resolveScriptEntry(params.handler.entry);
  ensureScriptAllowed(entryPath, runtime);

  // 优先使用 route 覆盖值，其次使用全局 runtime 默认值
  const timeoutMs = params.handler.timeoutMs ?? runtime.defaultTimeoutMs ?? 5000;
  const maxStdoutBytes = runtime.maxStdoutBytes ?? 262144;
  const maxStderrBytes = runtime.maxStderrBytes ?? 131072;
  const command = params.handler.type === "python_script"
    ? runtime.pythonCommand ?? "python3"
    : runtime.nodeCommand ?? "node";
  const startedAt = Date.now();

  return await new Promise<{ response: AgentEventScriptResponse; meta: AgentEventScriptExecutionMeta }>((resolve, reject) => {
    const child = spawn(command, [entryPath], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH ?? "",
      },
    });

    let stdout = "";
    let stderr = "";
    let stdoutExceeded = false;
    let stderrExceeded = false;
    let settled = false;
    let exitCode: number | null = null;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      // 超时强制终止，防止脚本阻塞事件处理链
      child.kill("SIGKILL");
      finish(() => reject(new Error(`script execution timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      const value = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      // 限制输出体积，避免异常脚本刷爆内存/日志
      if (Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(value, "utf8") > maxStdoutBytes) {
        stdoutExceeded = true;
        return;
      }
      stdout += value;
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const value = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (Buffer.byteLength(stderr, "utf8") + Buffer.byteLength(value, "utf8") > maxStderrBytes) {
        stderrExceeded = true;
        return;
      }
      stderr += value;
    });

    child.on("error", (err) => {
      finish(() => reject(err));
    });

    child.on("close", (code) => {
      exitCode = code;
      const meta: AgentEventScriptExecutionMeta = {
        command,
        entryPath,
        durationMs: Date.now() - startedAt,
        exitCode,
      };
      if (stdoutExceeded) {
        finish(() => reject(new Error("script stdout exceeded limit")));
        return;
      }
      if (stderrExceeded) {
        finish(() => reject(new Error("script stderr exceeded limit")));
        return;
      }
      if (code !== 0) {
        finish(() => reject(new Error(`script exited with code ${code}: ${stderr.trim() || stdout.trim()}`)));
        return;
      }
      const trimmed = stdout.trim();
      if (!trimmed) {
        // 空输出按无动作处理，减少脚本端样板代码
        finish(() => resolve({ response: { ok: true, action: "none" }, meta }));
        return;
      }
      try {
        // 脚本协议要求 stdout 必须是 JSON
        const parsed = JSON.parse(trimmed) as AgentEventScriptResponse;
        finish(() => resolve({ response: parsed, meta }));
      } catch (err) {
        finish(() => reject(new Error(`script output is not valid JSON: ${String(err)}`)));
      }
    });

    // 将完整 envelope 传给脚本，再关闭 stdin
    child.stdin.write(JSON.stringify(params.envelope));
    child.stdin.end();
  });
}