import json
import sys

payload = json.load(sys.stdin)
message = payload.get("message", {})
event_type = message.get("eventType", "unknown")
event_key = message.get("eventKey") or ""
change_type = message.get("changeType") or ""

json.dump({
    "ok": True,
    "action": "reply_text",
    "reply": {
        "text": f"python:{event_type}:{event_key}:{change_type}"
    },
    "chainToAgent": False
}, sys.stdout)
