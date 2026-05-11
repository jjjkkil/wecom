# WeCom 被动回复消息能力改造计划

## 1. 目标与命名

参考手册：

1. 接收消息与事件概述：<https://developer.work.weixin.qq.com/document/path/90238>
2. 被动回复消息格式：<https://developer.work.weixin.qq.com/document/path/90241>
3. 事件格式：<https://developer.work.weixin.qq.com/document/path/90240>

本次改造统一命名：

 `passive_reply` 表示“被动回复消息”模式，而不是“只关心 XML 格式”。

核心目标：

1. 在收到事件后 5 秒窗口内执行一个“回包脚本”，并完成被动回复。
2. 回包超时或失败时必须有兜底策略，避免重试风暴。
3. 回包完成后，继续复用现有事件路由执行“后处理脚本”。
4. 当 `replyHandler` 超时并降级返回 `success` 时，事件仍可继续交给 `postReplyHandler`。
5. 当 `replyHandler` 明确判定后续无需处理时，可直接短路 `postReplyHandler`。

## 2. 约束与现状

当前回调链路：

1. [src/transport/http/request-handler.ts](src/transport/http/request-handler.ts)
2. [src/transport/agent-callback/request-handler.ts](src/transport/agent-callback/request-handler.ts)
3. [src/agent/handler.ts](src/agent/handler.ts)

当前问题：

1. 缺少严格的 5 秒窗口回包策略。
2. 事件路由与被动回复链路没有形成统一的双阶段机制。
3. 回包后脚本输出协议应直接复用当前事件路由脚本协议，避免新增第二套语义。

## 3. 设计总览

### 3.1 双阶段执行模型

阶段 A：回包阶段（5 秒窗口内）

1. 命中 route 且 `responseMode=passive_reply` 时，执行 `replyHandler` 脚本。
2. 脚本返回明文被动回复消息（XML 字符串）。
3. 平台执行加密签名并回包。
4. 若配置允许，`replyHandler` 可显式声明跳过后续 `postReplyHandler`。

阶段 B：后处理阶段（回包后异步）

1. 回包发送后，按现有 `eventRouting.routes` 配置执行 `postReplyHandler`。
2. `postReplyHandler` 的 stdout 直接复用当前路由脚本协议：`action`、`reply`、`chainToAgent`。
3. 平台按现有事件路由语义消费后处理脚本结果，不再额外引入 `nextAction`。
4. 即使阶段 A 因超时降级为 `success`，阶段 B 仍可继续执行，用于补偿处理或异步业务推进。
5. 若阶段 A 已显式短路且配置允许，则阶段 B 不执行。

### 3.2 动作与分流

回包阶段动作：

1. `success`：直接返回 success。
2. `passive_reply`：执行回包脚本并返回被动回复消息。

后处理阶段动作（复用当前路由脚本协议）：

1. `action=reply_text`：直接主动发送给用户。
2. `chainToAgent=true`：将结果继续传递给 AI 处理链。
3. `action=none` 且 `chainToAgent=false`：仅记录日志，不继续处理。
4. `action=reply_text` 且 `chainToAgent=true`：先回复用户，再继续传递给 AI。

## 4. 配置方案

在保持现有配置模型基础上扩展，不新增平行大配置：

1. 继续使用 `inboundPolicy.eventPolicy.allowedEventTypes` 做事件放通。
2. 继续使用 `eventRouting.routes` 做事件命中。
3. 继续使用 `scriptRuntime` 做脚本运行时。

建议配置示例：

```yaml
channels:
  wecom:
    accounts:
      default:
        agent:
          inboundPolicy:
            eventEnabled: true
            eventPolicy:
              allowedEventTypes:
                - template_card_event
                - click

          eventRouting:
            unmatchedAction: ignore
            routes:
              - id: template-card-submit
                when:
                  eventType: template_card_event
                replyHandler:
                  type: python_script
                  entry: ./scripts/wecom/reply-template-card.py
                  timeoutMs: 4500
                  responseMode: passive_reply # default | passive_reply
                  allowSkipPostReplyHandler: true
                postReplyHandler:
                  enabled: true
                  type: node_script
                  entry: ./scripts/wecom/post-template-card.js
                  timeoutMs: 15000

          scriptRuntime:
            enabled: true
            allowPaths:
              - ./scripts/wecom
            defaultTimeoutMs: 4500
```

字段语义：

1. `replyHandler.responseMode`
   - `default` 或不填：保持当前默认行为，不等待被动回复消息脚本输出。
   - `passive_reply`：进入 5 秒窗口回包路径，等待脚本返回被动回复消息。
2. `replyHandler.allowSkipPostReplyHandler`
  - `true`：允许 `replyHandler` 通过 stdout 显式跳过后续 `postReplyHandler`。
  - `false` 或不填：忽略脚本中的跳过意图，仍按原规则决定是否执行 `postReplyHandler`。
3. `postReplyHandler.enabled`
   - `true`：回包后异步执行后处理脚本。
   - `false`：不执行后处理脚本。

## 5. 脚本协议

### 5.1 replyHandler 输入输出

stdin 示例：

```json
{
  "version": "1.0",
  "phase": "reply",
  "accountId": "default",
  "eventType": "template_card_event",
  "responseMode": "passive_reply",
  "deadlineMs": 4500,
  "message": {
    "fromUser": "zhangsan",
    "toUser": "wwcorp",
    "msgType": "event",
    "eventKey": "approve_123",
    "raw": {
      "MsgType": "event",
      "Event": "template_card_event"
    }
  }
}
```

stdout 示例：

```json
{
  "ok": true,
  "responseMode": "passive_reply",
  "replyMessage": "<xml>...</xml>",
  "skipPostReplyHandler": true
}
```

继续执行后续 `postReplyHandler` 的示例：

```json
{
  "ok": true,
  "responseMode": "passive_reply",
  "replyMessage": "<xml>...</xml>",
  "skipPostReplyHandler": false
}
```

### 5.2 postReplyHandler 输入输出

该阶段直接复用当前事件路由脚本协议，和 [src/agent/script-runner.ts](src/agent/script-runner.ts) / [src/agent/event-router.ts](src/agent/event-router.ts) 保持一致。

stdin 示例：

```json
{
  "version": "1.0",
  "phase": "post_reply",
  "accountId": "default",
  "eventType": "template_card_event",
  "message": {
    "fromUser": "zhangsan",
    "eventKey": "approve_123"
  },
  "reply": {
    "sent": true,
    "responseMode": "passive_reply",
    "fallbackToSuccess": false,
    "reason": null
  }
}
```

当 `replyHandler` 超时并降级为 `success` 时，stdin 示例：

```json
{
  "version": "1.0",
  "phase": "post_reply",
  "accountId": "default",
  "eventType": "template_card_event",
  "message": {
    "fromUser": "zhangsan",
    "eventKey": "approve_123"
  },
  "reply": {
    "sent": false,
    "responseMode": "passive_reply",
    "fallbackToSuccess": true,
    "reason": "reply_timeout"
  }
}
```

当 `replyHandler` 已显式短路后续处理时，不会生成 `postReplyHandler` 的 stdin。

stdout 示例：

```json
{
  "ok": true,
  "action": "reply_text",
  "reply": {
    "text": "审批完成，结果已更新"
  },
  "chainToAgent": true
}
```

无回复、仅继续给 AI 的示例：

```json
{
  "ok": true,
  "action": "none",
  "chainToAgent": true
}
```

仅回复用户、不进入 AI 的示例：

```json
{
  "ok": true,
  "action": "reply_text",
  "reply": {
    "text": "审批完成，结果已更新"
  }
}
```

字段语义：

1. `action`
   - `none`：不直接回复用户。
   - `reply_text`：直接回复文本给用户。
2. `reply.text`
   - 当 `action=reply_text` 时生效。
3. `chainToAgent`
   - `true`：后处理脚本执行完后继续进入 AI 处理链。
   - `false`：不继续进入 AI。
4. `reply.sent`
   - `true`：本次已成功发出被动回复消息。
   - `false`：本次未发出被动回复消息，当前是降级 `success` 后继续执行后处理。
5. `reply.fallbackToSuccess`
   - `true`：说明 `replyHandler` 失败或超时，HTTP 已按兜底策略返回 `success`。
6. `reply.reason`
   - 记录降级原因，例如 `reply_timeout`、`reply_invalid_output`、`reply_sign_failed`。

`replyHandler` 输出字段语义：

1. `skipPostReplyHandler`
   - `true`：当前回包已足够，后续不再执行 `postReplyHandler`。
   - `false` 或不填：按原规则继续判断是否执行 `postReplyHandler`。
2. 该字段仅在 `replyHandler.allowSkipPostReplyHandler=true` 时生效。

说明：

1. `postReplyHandler` 不再定义 `nextAction`。
2. 平台直接复用当前事件路由脚本的消费逻辑。
3. 允许“先回复用户，再继续给 AI”。
4. `postReplyHandler` 必须能够识别“已正常回包”与“已降级 success”两种前置状态。
5. `replyHandler` 也可以在配置允许时直接终止后续 `postReplyHandler`。

## 6. 超时与兜底策略

回包阶段强约束：

1. 企业微信回包窗口为 5000ms。
2. `replyHandler.timeoutMs` 默认 4500ms，必须小于 5000ms。

兜底策略：

1. 回包脚本超时、异常退出、非 JSON、缺少 `replyMessage`、加密签名失败，统一降级为 `success`。
2. 统一记录审计日志：routeId、eventType、耗时、失败原因、是否降级。
3. 若已配置 `postReplyHandler.enabled=true`，则 `replyHandler` 超时降级为 `success` 后，事件仍继续进入 `postReplyHandler`。
4. 回包后脚本失败不影响已发送回包，也不影响已降级返回的 `success`，只记日志并按后续重试策略处理。
5. 若 `replyHandler` 返回 `skipPostReplyHandler=true` 且 `replyHandler.allowSkipPostReplyHandler=true`，则不执行 `postReplyHandler`。

## 7. 运行时流程

1. 验签解密，提取 `eventType`。
2. `allowedEventTypes` 判断是否放通。
3. `eventRouting.routes` 匹配命中 route。
4. 若 `replyHandler.responseMode=passive_reply`：
   - 执行回包脚本，等待 `replyMessage`。
   - 成功则加密签名并回包。
  - 失败则降级 `success`，并记录 reply fallback 状态。
5. 若配置 `postReplyHandler.enabled=true`：
  - 若 `replyHandler` 已显式请求跳过且配置允许，则直接结束，不执行 `postReplyHandler`。
  - 否则回包后异步执行后处理脚本；若上一步已降级 `success`，则带着 fallback 上下文继续执行。
  - 按当前路由脚本协议消费结果：`reply_text` / `chainToAgent` / `none`。

## 8. 改造范围

配置与类型：

1. [src/types/config.ts](src/types/config.ts)
   - 新增 `replyHandler.responseMode: default | passive_reply`
  - 新增 `replyHandler.allowSkipPostReplyHandler?: boolean`
   - 新增 `postReplyHandler` 结构
2. [src/config/schema.ts](src/config/schema.ts)
   - 同步 schema
3. [src/config/accounts.ts](src/config/accounts.ts)
   - 归一化 `replyHandler` 与 `postReplyHandler`

处理链路：

1. [src/agent/handler.ts](src/agent/handler.ts)
   - 接入 5 秒窗口回包脚本执行
   - 接入超时兜底降级
  - 回包后调度后处理脚本
  - 在 reply fallback 场景下继续透传事件给后处理脚本
  - 支持 replyHandler 显式短路 postReplyHandler
2. [src/agent/event-router.ts](src/agent/event-router.ts)
  - 将路由命中的后处理配置透传给 handler
  - 尽可能复用现有脚本协议解析结果结构
3. 新增建议文件：
   - src/transport/agent-callback/reply-script-executor.ts
   - src/transport/agent-callback/post-reply-script-executor.ts
   - src/transport/agent-callback/passive-reply-response.ts

## 9. 测试计划

单元测试：

1. `responseMode` 判定：`default` 与 `passive_reply`。
2. 超时兜底判定与错误分类。
3. `action` / `reply.text` / `chainToAgent` 分流与组合语义。
4. `reply.sent` / `fallbackToSuccess` / `reason` 的上下文透传。
5. `skipPostReplyHandler` 在开关开启/关闭时的行为差异。

集成测试：

1. 命中 `passive_reply` 路由，脚本 4500ms 内回包成功。
2. 回包脚本超时，降级 `success`。
3. 回包脚本超时，降级 `success` 后仍触发 `postReplyHandler`。
4. 回包后脚本返回 `action=reply_text`，用户收到主动消息。
5. 回包后脚本返回 `action=none` 且 `chainToAgent=true`，事件进入 AI 链路。
6. 回包后脚本返回 `reply_text` 且 `chainToAgent=true`，先回复用户再进入 AI。
7. 回包后脚本异常，不影响已发送回包，也不影响已降级返回的 `success`。
8. 回包脚本返回 `skipPostReplyHandler=true` 且开关开启时，不执行 `postReplyHandler`。
9. 回包脚本返回 `skipPostReplyHandler=true` 但开关关闭时，仍执行 `postReplyHandler`。

回归测试：

1. 非 `passive_reply` 路径行为不回归。
2. 原有 eventRouting 匹配逻辑不回归。

## 10. 验收标准

1. 配置层不再出现 `passive_xml`，统一为 `passive_reply`。
2. 回包阶段可在 5 秒窗口内执行脚本并完成被动回复。
3. 回包超时存在稳定兜底，统一降级 `success`。
4. `replyHandler` 超时降级为 `success` 后，事件仍可继续进入 `postReplyHandler`。
5. 回包后按事件路由执行脚本。
6. 后处理脚本结果按当前路由脚本协议消费，可直达用户、继续传递给 AI，或两者同时发生。
7. 全链路有审计日志可追踪。
8. 在配置开启时，`replyHandler` 可显式短路后续 `postReplyHandler`。

## 11. 实施顺序

1. 先改配置类型与 schema（`passive_xml` -> `passive_reply`）。
2. 再实现回包脚本执行器与超时兜底。
3. 然后实现回包后脚本执行器，并复用当前路由脚本协议消费逻辑。
4. 再补 replyHandler 对 postReplyHandler 的短路控制。
5. 最后补示例脚本和 README。