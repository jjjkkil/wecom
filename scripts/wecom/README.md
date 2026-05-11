# WeCom 事件脚本示例

本目录提供可直接运行的 WeCom Agent 事件路由脚本示例。

## 文件说明

- `menu-click-help.js`：Node.js 菜单点击事件示例。
- `menu-click-help.py`：Python 菜单点击事件示例。

## 输入协议

脚本从 `stdin` 接收一份 JSON envelope。当前结构如下：

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
    "agentId": 1000001,
    "createTime": 1760000000,
    "msgId": "1234567890",
    "raw": {
      "ToUserName": "wwxxxx",
      "FromUserName": "zhangsan",
      "MsgType": "event",
      "Event": "click",
      "EventKey": "MENU_HELP",
      "AgentID": "1000001"
    }
  },
  "route": {
    "matchedRuleId": "menu_help_click",
    "handlerType": "node_script"
  }
}
```

### 输入字段说明

- `version`：协议版本，当前固定为 `1.0`。
- `channel`：渠道标识，当前固定为 `wecom`。
- `accountId`：命中的企微账号 ID。
- `receivedAt`：路由层接收事件时的毫秒时间戳。
- `message.msgType`：消息类型，事件场景一般是 `event`。
- `message.eventType`：事件类型（例如 `click`、`change_contact`）。
- `message.eventKey`：事件键，可能为空。
- `message.changeType`：二级事件类型，仅部分事件存在（例如 `change_contact`）。
- `message.fromUser`：发送者 UserId。
- `message.toUser`：接收方 corpId。
- `message.chatId`：群聊 ID，单聊可能为 `null`。
- `message.agentId`：应用 AgentID。
- `message.createTime`：企微事件时间戳（秒）。
- `message.msgId`：消息 ID，某些事件可能为 `null`。
- `message.raw`：完整原始对象（XML 解析结果），新增字段会优先在这里透传。
- `route.matchedRuleId`：命中的路由规则 ID。
- `route.handlerType`：当前执行器类型（`node_script` 或 `python_script`）。

## 输出协议

脚本需要向 `stdout` 输出一份 JSON。当前支持的关键字段：

- `ok`：可选，布尔值，表示脚本是否成功处理。
- `action`：可选，当前支持 `none` 或 `reply_text`。
- `reply.text`：当 `action=reply_text` 时使用，作为回复内容。
- `chainToAgent`：可选，脚本侧动态决定是否继续进入默认 Agent（AI）流程；最终结果还会与 handler 配置里的 `chainToAgent` 做合并，只要任一方为 `true` 就会继续。
- `audit.tags`：可选，审计标签数组。
- `error`：可选，错误信息。

### 示例 1：直接回复并终止默认流程

```json
{
  "ok": true,
  "action": "reply_text",
  "reply": { "text": "已收到 MENU_HELP" },
  "chainToAgent": false
}
```

### 示例 2：不回复，继续默认流程

```json
{
  "ok": true,
  "action": "none",
  "chainToAgent": true
}
```

### `chainToAgent` 补充说明

- 这里的 `chainToAgent` 只代表脚本返回的动态结果，不是唯一决策来源。
- 如果路由 handler 中也配置了 `"chainToAgent": true`，那么即使脚本返回 `false`，最终仍会继续进入默认 Agent 流程。
- 如果要让脚本完全决定是否继续，handler 里不要写 `chainToAgent`。

### 示例 3：失败回包（可选）

```json
{
  "ok": false,
  "action": "reply_text",
  "reply": { "text": "处理失败，请稍后重试" },
  "chainToAgent": false,
  "error": "invalid params"
}
```

## 注意事项

- 输出必须是严格 JSON。
- 不要在 `stdout` 混入调试日志；调试信息请写到 `stderr`。
- 非 0 退出码或非法 JSON 会被视为 handler 执行失败。
- 脚本路径必须落在 `scriptRuntime.allowPaths` 允许目录内。
- 脚本应尽量快速返回，避免触发超时（由 `timeoutMs/defaultTimeoutMs` 控制）。
