#!/usr/bin/env python3
import json
import sys


def main() -> int:
    # 从 stdin 读取平台注入的事件 envelope（JSON）
    try:
        payload = json.load(sys.stdin)
    except Exception:
        # 输入异常时返回可读错误，避免脚本抛异常导致无输出
        json.dump(
            {
                "ok": False,
                "action": "reply_text",
                "reply": {"text": "事件脚本解析输入失败，请联系管理员。"},
                "chainToAgent": True,
            },
            sys.stdout,
            ensure_ascii=False,
        )
        return 0

    message = payload.get("message", {}) if isinstance(payload, dict) else {}
    event_type = str(message.get("eventType") or "unknown")
    event_key = str(message.get("eventKey") or "")
    from_user = str(message.get("fromUser") or "")

    # 这里给出联调用的回显文本，业务可改为真正逻辑
    lines = [
        "已收到菜单事件",
        f"eventType={event_type}",
        f"eventKey={event_key or '<empty>'}",
    ]
    if from_user:
        lines.append(f"fromUser={from_user}")
    lines.append("")
    lines.append("你可以在 openclaw 配置里把这个 eventKey 路由到具体业务脚本。")

    json.dump(
        {
            "ok": True,
            "action": "reply_text",
            "reply": {"text": "\n".join(lines)},
            "chainToAgent": False,
            "audit": {"tags": ["menu", "click", event_type]},
        },
        sys.stdout,
        ensure_ascii=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
