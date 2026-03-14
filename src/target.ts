/**
 * WeCom Target Resolver (企业微信目标解析器)
 * 
 * 解析 OpenClaw 的 `to` 字段（原始目标字符串），将其转换为企业微信支持的具体接收对象。
 * 支持显式前缀 (party:, tag: 等) 和基于规则的启发式推断。
 * 
 * **关于“目标发送”与“消息记录”的对应关系 (Target vs Inbound):**
 * - **发送 (Outbound)**: 支持一对多广播 (Party/Tag)。
 *   例如发送给 `party:1`，消息会触达该部门下所有成员。
 * - **接收 (Inbound)**: 总是来自具体的 **用户 (User)** 或 **群聊 (Chat)**。
 *   当成员回复部门广播消息时，可以视为一个新的单聊会话或在该成员的现有单聊中回复。
 *   因此，Outbound Target (如 Party) 与 Inbound Source (User) 不需要也不可能 1:1 强匹配。
 *   广播是“发后即忘” (Fire-and-Forget) 的通知模式，而回复是具体的会话模式。
 */

export interface WecomTarget {
    touser?: string;
    toparty?: string;
    totag?: string;
    chatid?: string;
}

export interface ScopedWecomTarget {
    accountId?: string;
    target: WecomTarget;
    rawTarget: string;
}

/**
 * Parses a raw target string into a WeComTarget object.
 * 解析原始目标字符串为 WeComTarget 对象。
 * 
 * 逻辑:
 * 1. 先检查显式类型前缀 (user:, group:, party:, tag:) —— 优先匹配，不受命名空间前缀影响
 * 2. 移除标准命名空间前缀 (wecom:, qywx: 等)
 * 3. 再次检查类型前缀（处理 wecom:user:xxx 格式）
 * 4. 启发式回退 (无前缀时):
 *    - 以 "wr" 或 "wc" 开头 -> Chat ID (群聊)
 *    - 纯数字 -> 默认 User ID (用户)，避免误判部门导致 81013 错误
 *    - 其他 -> User ID (用户)
 * 
 * @param raw - The raw target string (e.g. "party:1", "zhangsan", "wecom:user:0404777")
 */
export function resolveWecomTarget(raw: string | undefined, options?: { preferUserForDigits?: boolean }): WecomTarget | undefined {
    if (!raw?.trim()) return undefined;

    const trimmed = raw.trim();

    // 1. 先检查原始字符串中的类型前缀（处理 user:0404777 无前缀格式）
    // 这样即使没有 wecom: 前缀，也能正确识别类型
    if (/^user:/i.test(trimmed)) {
        return { touser: trimmed.replace(/^user:/i, "").trim() };
    }
    if (/^group:/i.test(trimmed) || /^chat:/i.test(trimmed)) {
        return { chatid: trimmed.replace(/^(group:|chat:)/i, "").trim() };
    }
    if (/^party:/i.test(trimmed) || /^dept:/i.test(trimmed)) {
        return { toparty: trimmed.replace(/^(party:|dept:)/i, "").trim() };
    }
    if (/^tag:/i.test(trimmed)) {
        return { totag: trimmed.replace(/^tag:/i, "").trim() };
    }

    // 2. Remove standard namespace prefixes (移除标准命名空间前缀)
    let clean = trimmed.replace(/^(wecom-agent|wecom|wechatwork|wework|qywx):/i, "");

    // 3. 再次检查类型前缀（处理 wecom:user:0404777 格式）
    if (/^user:/i.test(clean)) {
        return { touser: clean.replace(/^user:/i, "").trim() };
    }
    if (/^group:/i.test(clean) || /^chat:/i.test(clean)) {
        return { chatid: clean.replace(/^(group:|chat:)/i, "").trim() };
    }
    if (/^party:/i.test(clean) || /^dept:/i.test(clean)) {
        return { toparty: clean.replace(/^(party:|dept:)/i, "").trim() };
    }
    if (/^tag:/i.test(clean)) {
        return { totag: clean.replace(/^tag:/i, "").trim() };
    }

    // 4. Heuristics (启发式规则)

    // Chat ID typically starts with 'wr' or 'wc'
    // 群聊 ID 通常以 'wr' (外部群) 或 'wc' 开头
    if (/^(wr|wc)/i.test(clean)) {
        return { chatid: clean };
    }

    // Pure digits: Default to Party (纯数字默认为部门)
    // 原因：1) 定时任务可能直接配置 to: "1" 发送给根部门
    //      2) 企业微信官方文档示例使用纯数字表示部门
    //      3) 用户 ID 应该使用显式前缀 "user:xxx"
    // 如果需要发送给用户，请使用 "user:0404777" 格式
    if (/^\d+$/.test(clean)) {
        return { toparty: clean };
    }

    // Default to User (默认为用户)
    return { touser: clean };
}

export function resolveScopedWecomTarget(raw: string | undefined, defaultAccountId?: string): ScopedWecomTarget | undefined {
    if (!raw?.trim()) return undefined;

    const trimmed = raw.trim();
    const agentScoped = trimmed.match(/^wecom-agent:([^:]+):(.+)$/i);
    if (agentScoped) {
        const accountId = agentScoped[1]?.trim() || defaultAccountId;
        const rawTarget = agentScoped[2]?.trim() || "";
        // Agent scoped targets are almost always users in a conversation context.
        // In this scope, we prefer treating numeric IDs as User IDs to avoid 81013 errors.
        const target = resolveWecomTarget(rawTarget, { preferUserForDigits: true });
        return target ? { accountId, target, rawTarget } : undefined;
    }

    const target = resolveWecomTarget(trimmed);
    return target
        ? {
            accountId: defaultAccountId,
            target,
            rawTarget: trimmed,
        }
        : undefined;
}
