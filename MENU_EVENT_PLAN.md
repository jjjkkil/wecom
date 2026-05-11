# WeCom 菜单事件可配置回调功能规划（PLAN）

## 1. 背景与目标

当前插件对 Agent 入站 `event` 使用固定白名单，未覆盖企业微信“菜单事件”全量场景（如 `click`、`view`、`scancode_push`、`location_select` 等）。

目标是把“是否放行 event、放行哪些 eventType、由谁处理”从代码硬编码改为可配置：

1. 支持在 OpenClaw 配置中声明是否启用 `event` 处理。
2. 在 `event` 内支持按 `eventType` 白名单（例如只放行 `click`、`scancode_push`）。
3. 每个事件可绑定处理器（内置 handler / 外部 TS/JS / 外部 Python）。
4. 默认安全：不配置即保持现有行为兼容，不自动放通新增事件。

## 2. 需求范围

### 2.1 本期（MVP）

1. 菜单点击类事件可配置放通：
   - `click`
   - `view`
   - `view_miniprogram`
   - `scancode_push`
   - `scancode_waitmsg`
   - `pic_sysphoto`
   - `pic_photo_or_album`
   - `pic_weixin`
   - `location_select`
2. 配置驱动白名单：`eventEnabled` + `eventType`。
3. 事件分发器：按匹配规则将事件交给指定处理器。
4. 脚本处理器能力：
   - Node 脚本（TS/JS，先支持 JS，TS 通过 tsx/ts-node 作为可选）
   - Python 脚本
5. 统一执行输入输出协议（JSON stdin/stdout），并把接收到的 event 参数透传给外部脚本。
6. 最小可观测能力：审计日志、超时、退出码、错误摘要。

### 2.2 后续增强（非 MVP）

1. 脚本热更新和缓存。
2. 并发/速率限制（按事件类型或账号维度）。
3. 幂等增强（事件去重键可配置）。
4. 回调重试策略（指数退避 + 死信）。
5. handler 沙箱隔离（容器/受限用户执行）。

## 3. 设计原则

1. 兼容优先：未新增配置时，行为与当前版本一致。
2. 显式放通：只处理配置明确允许的类型。
3. 最小权限：外部脚本执行能力默认关闭或仅允许受信目录。
4. 可追踪：每次分发都可在日志中定位“为什么放通/为什么拒绝/由谁处理”。
5. 可替换：处理器接口稳定，后续可新增 webhook/queue 等执行后端。

## 3.1 事件格式盘点（基于文档 90240）

按文档事件目录统计，建议全部纳入“可配置支持范围”，默认采用 deny by default（不放通）。

### A. 一级事件格式数量

共 17 类一级事件格式：

1. 成员关注及取消关注事件
2. 进入应用
3. 上报地理位置
4. 异步任务完成事件推送
5. 通讯录变更事件
6. 菜单事件
7. 审批状态通知事件
8. 企业互联共享应用事件回调
9. 上下游共享应用事件回调
10. 模板卡片事件推送
11. 通用模板卡片右上角菜单事件推送
12. 长期未使用应用停用预警事件
13. 长期未使用应用临时停用事件
14. 长期未使用应用重新启用事件
15. 应用低活跃预警事件
16. 低活跃应用事件
17. 低活跃应用活跃恢复事件

### B. Event 字段可枚举值数量

共 26 个 Event 值（建议全部支持配置）：

1. subscribe
2. unsubscribe
3. enter_agent
4. LOCATION
5. batch_job_result
6. change_contact
7. click
8. view
9. view_miniprogram
10. scancode_push
11. scancode_waitmsg
12. pic_sysphoto
13. pic_photo_or_album
14. pic_weixin
15. location_select
16. open_approval_change
17. share_agent_change
18. share_chain_change
19. template_card_event
20. template_card_menu_event
21. inactive_alert
22. close_inactive_agent
23. reopen_inactive_agent
24. low_active_alert
25. low_active
26. active_restored

### C. 含 ChangeType 的展开数量

如果把 `change_contact` 按 `ChangeType` 展开，建议按“二级事件”管理，共 7 种：

1. create_user
2. update_user
3. delete_user
4. create_party
5. update_party
6. delete_party
7. update_tag

因此，配置层可支持的“可路由事件项”建议按 32 项预算：

1. 26 个 Event 值
2. 其中 change_contact 再细分 7 个 ChangeType（路由维度）

### D. 配置建议（用于实现）

1. 第一层：`eventEnabled`（开关，先解决“支持 event”）。
2. 第二层：`eventType`（即 Event，用于主白名单和主路由）。
3. 第三层：`changeType` 或 `eventKey`。
   - `changeType`：仅当 `eventType=change_contact` 时启用。
   - `eventKey`：菜单事件精细路由，支持精确值/前缀/正则。
4. `messageType` 级别白名单作为后续扩展，不纳入本期 MVP 必选项。

## 4. 配置模型草案

建议在 `channels.wecom.accounts.<accountId>.agent` 下新增：

```yaml
channels:
  wecom:
    accounts:
      default:
        agent:
               # 1) event 入站白名单配置（MVP）
          inboundPolicy:
                  eventEnabled: true
            eventPolicy:
              mode: allowlist
              allowedEventTypes:
                - subscribe
                - enter_agent
                - click
                - view
                - view_miniprogram
                - scancode_push
                - scancode_waitmsg
                - pic_sysphoto
                - pic_photo_or_album
                - pic_weixin
                - location_select

          # 2) 事件分发配置
          eventRouting:
            unmatchedAction: ignore # ignore | forwardToAgent
            routes:
              - when:
                  eventType: click
                  eventKey: "MENU_HELP"
                handler:
                  type: node_script
                  entry: "./scripts/wecom/menu-click-help.js"
                  timeoutMs: 5000
              - when:
                  eventType: scancode_push
                handler:
                  type: python_script
                  entry: "./scripts/wecom/scancode_handler.py"
                  timeoutMs: 8000

          # 3) 脚本执行安全设置
          scriptRuntime:
            enabled: true
            allowPaths:
              - "./scripts/wecom"
            maxStdoutBytes: 262144
            maxStderrBytes: 131072
            defaultTimeoutMs: 5000
            pythonCommand: "python3"
            nodeCommand: "node"
```

## 5. 分发与执行架构

### 5.1 处理链路

1. 接收并解析 XML（现有能力）。
2. 生成标准入站上下文 `InboundEventContext`。
3. 先走 `inboundPolicy` 判定：
   - 非 `event` 消息保持现状（按现有逻辑处理）。
   - `eventEnabled=false` => 拒绝 event。
   - `eventType` 不允许 => 拒绝。
4. 命中后进入 `eventRouting`：
   - 按 routes 顺序匹配（首个命中即执行）。
   - 未命中走 `unmatchedAction`。
5. 执行 handler：
   - `builtin`：调用内置函数。
   - `node_script`：子进程执行 Node 脚本。
   - `python_script`：子进程执行 Python 脚本。
6. 汇总 handler 结果，决定：
   - 是否回复用户。
   - 是否继续默认消息流水线。
   - 是否仅记录审计并结束。

### 5.2 统一处理器返回协议（建议）

外部脚本输入（stdin）必须包含完整事件参数，至少包括标准字段 + 原始字段：

```json
{
   "version": "1.0",
   "channel": "wecom",
   "accountId": "default",
   "receivedAt": 1760000000000,
   "message": {
      "msgType": "event",
      "eventType": "click",
      "eventKey": "MENU_HELP",
      "changeType": null,
      "fromUser": "zhangsan",
      "toUser": "wwxxxx",
      "chatId": null,
      "agentId": 1000002,
      "createTime": 1760000000,
      "msgId": null,
      "raw": {
         "ToUserName": "wwxxxx",
         "FromUserName": "zhangsan",
         "MsgType": "event",
         "Event": "click",
         "EventKey": "MENU_HELP",
         "AgentID": "1000002"
      }
   },
   "route": {
      "matchedRuleId": "menu_help_click",
      "handlerType": "node_script"
   }
}
```

说明：

1. `message.raw` 为原始 XML 解析结果（扁平对象），用于外部脚本读取任意参数。
2. `message` 顶层为标准化字段，降低脚本解析成本。
3. 对菜单事件扩展字段（如 `ScanCodeInfo`、`SendPicsInfo`、`SendLocationInfo`）需原样放入 `message.raw`。
4. 后续新增事件字段无需改协议版本，直接在 `message.raw` 增量透传。

外部脚本从 stdout 返回 JSON：

```json
{
  "ok": true,
  "action": "reply_text",
  "reply": {
    "text": "已收到菜单点击: MENU_HELP"
  },
  "chainToAgent": false,
  "audit": {
    "tags": ["menu", "click"]
  }
}
```

字段建议：

1. `ok`: boolean，处理是否成功。
2. `action`: `none | reply_text | reply_markdown | call_internal`。
3. `reply`: 回复负载。
4. `chainToAgent`: 是否继续走默认 AI 会话。
5. `audit`: 附加审计标签。
6. `error`: 失败时错误消息。

### 5.3 参数透传要求（强约束）

1. 所有外部 handler（Node/Python）都必须收到完整 event 参数，不允许只传 `eventType/eventKey`。
2. 参数透传应包含：基础字段、事件字段、扩展子结构、原始解析对象。
3. 当字段缺失时保留 `null` 或空对象，不要静默删除键，避免脚本分支判断失效。
4. 当入站不是 `event` 时，仍保持统一 envelope 结构，便于未来复用。

## 6. 代码改造建议

### 6.1 配置与类型

1. 扩展配置类型：
   - `src/types/config.ts`
   - `src/config/schema.ts`
2. 增加默认值与兼容合并逻辑：
   - `src/config/runtime-config.ts`

### 6.2 入站过滤改造

1. 将当前 `shouldProcessAgentInboundMessage` 的硬编码白名单改为：
   - 先判断 `inboundPolicy.eventEnabled`
   - 对 `event` 再读 `eventPolicy.allowedEventTypes`
2. 保留现有关键保护逻辑：
   - `sys` 发送者保护
   - 缺失 sender 保护
   - 已有去重保护

### 6.3 新增事件分发器

建议新增模块：

1. `src/agent/event-router.ts`
   - 路由匹配
   - handler 选择
2. `src/agent/handler-runner.ts`
   - builtin / node / python 统一执行
   - 超时、stdout/stderr 限流
   - stdin 注入标准 envelope（含完整 event 参数）
3. `src/agent/handler-protocol.ts`
   - 输入输出协议定义

### 6.4 在主处理流程接入

在 `src/agent/handler.ts` 的 `event` 分支：

1. 在放通后优先调用事件分发器。
2. 分发器返回 `handled=true` 且 `chainToAgent=false` 时，终止默认 AI 流程。
3. 需要默认流程时继续原有 `processAgentMessage`。

## 7. 安全与风险控制

1. 默认关闭脚本执行，需显式 `scriptRuntime.enabled=true`。
2. 仅允许执行 `allowPaths` 下脚本，防止任意路径执行。
3. 进程级超时，超时强制 kill。
4. 限制 stdout/stderr 最大字节，防止日志/内存膨胀。
5. 子进程不继承敏感环境变量（可配置白名单透传）。
6. 记录审计：账号、eventType、eventKey、handler、耗时、退出码。

## 8. 测试计划

### 8.1 单元测试

1. `inboundPolicy` 判定测试：
   - eventEnabled/eventType allow/deny 组合。
2. `eventRouting` 匹配测试：
   - eventType + changeType/eventKey 优先级。
3. handler runner 测试：
   - 正常输出
   - 非法 JSON
   - 超时
   - 非 0 退出码
   - stdin 中包含完整 event 参数与 raw 字段

### 8.2 集成测试

1. 构造 `click`、`view`、`scancode_push` XML 回调，验证完整链路。
2. 验证 `unmatchedAction` 两种模式。
3. 验证配置缺失时与当前版本行为一致。
4. 验证外部脚本可读取 `ScanCodeInfo/SendPicsInfo/SendLocationInfo` 等扩展参数。

### 8.3 回归测试

1. `subscribe` / `enter_agent` 现有行为不回归。
2. 文档/日程等现有 `doc_*`、`wedoc_*`、`smartsheet_*` 事件不回归。

## 9. 里程碑与交付

### M1：配置化放通（1~2 天）

1. 完成配置 schema/type 扩展。
2. `shouldProcessAgentInboundMessage` 改为 `eventEnabled + eventType` 配置驱动。
3. 增加单元测试。

### M2：事件分发器（2~3 天）

1. 实现 route 匹配和 builtin handler。
2. 接入主处理流程。
3. 增加集成测试。

### M3：外部脚本执行（2~3 天）

1. Node/Python runner。
2. 超时和输出限制。
3. 审计字段补齐。

### M4：文档与示例（1 天）

1. README 增加配置示例与安全建议。
2. 增加 `scripts/wecom` 示例脚本。

#### M4 已落地内容（2026-04-10）

1. 已在 README 增加 Agent 事件路由章节，包含：
   - 三层配置示例（`eventEnabled -> eventType -> changeType/eventKey`）
   - Node/Python handler 配置样例
   - stdin/stdout 协议说明
   - 安全建议
2. 已新增可运行示例脚本：
   - `scripts/wecom/menu-click-help.js`
   - `scripts/wecom/menu-click-help.py`
   - `scripts/wecom/README.md`
3. 现状说明：
   - M1 已完成：event 配置化放通
   - M2 已完成：事件路由与 builtin handler
   - M3 已完成：Node/Python runner + 超时/输出限制 + 审计
   - M4 已完成：文档和示例交付

## 10. 首批内置 handler 建议

1. `menu_click_echo`：回显 `eventType` + `eventKey`，用于联调。
2. `menu_click_route_to_prompt`：将菜单键映射成固定提示词进入默认 pipeline。
3. `menu_click_call_script`：作为脚本执行桥接器。

## 11. 兼容性策略

1. 旧配置无 `inboundPolicy` 时，使用“兼容默认白名单”（与当前一致）。
2. 新配置启用后，按配置优先生效。
3. 对未识别配置字段仅告警不崩溃。

## 11.1 为什么先不做 messageType 白名单

1. 当前痛点集中在 `event` 被整体过滤，最小改动是先引入 `eventEnabled`。
2. 现有 `text/image/file/...` 已在当前链路可处理，本期不需要额外开关干预。
3. 先做 event 维度可显著降低配置复杂度与回归风险。
4. 后续若出现“非 event 类型也需要细粒度开关”的需求，再增补 messageType 白名单。

## 12. 开放问题（需确认）

1. 菜单事件 `view/view_miniprogram` 是否默认只审计不触发回复？
2. 脚本 handler 是否允许访问网络，是否需要开关控制？
3. 是否需要在每个 route 上支持 `retryPolicy`？
4. 是否需要支持 webhook handler（HTTP 回调）作为第三类外部处理器？

---

该规划优先保证“可配置放通 + 可扩展处理 + 安全默认值”。
如果确认此方案，可按 M1 开始先落地配置化白名单，再逐步引入路由与脚本执行能力。
