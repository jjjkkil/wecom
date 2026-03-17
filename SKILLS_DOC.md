# OpenClaw 企业微信文档能力技能清单

> 企业微信文档 API 完整技能清单，包含 55+ 个 MCP Tools  
> 文档版本：2026-03-17 | 适用版本：OpenClaw WeChat Plugin v2.3.16+  
> 官方文档：https://developer.work.weixin.qq.com/document/path/95071

---

## 目录

1. [文档基础操作](#一文档基础操作) (6 个)
2. [文档权限管理](#二文档权限管理) (9 个)
3. [文档内容操作](#三文档内容操作) (3 个)
4. [在线表格操作](#四在线表格操作) (4 个)
5. [智能表格操作](#五智能表格操作) (25 个)
6. [收集表操作](#六收集表操作) (5 个)
7. [高级账号管理](#七高级账号管理) (3 个)
8. [字段类型对照表](#八字段类型对照表)
9. [使用示例](#九使用示例)
10. [注意事项](#十注意事项)

---

## 一、文档基础操作

### 1.1 创建文档

```json
{
  "name": "wecom_doc",
  "action": "create",
  "description": "创建文档/表格/智能表格，可设置初始内容和协作者",
  "parameters": {
    "docName": "string (必填) - 文档名称",
    "docType": "string (可选) - 文档类型：doc(文档)|spreadsheet(表格)|smart_table(智能表格)，默认 doc",
    "spaceId": "string (可选) - 文档空间 ID",
    "fatherId": "string (可选) - 父目录 fileid，根目录时等于 spaceId",
    "viewers": "array (可选) - 查看成员列表：[{userid: 'xxx'}]",
    "collaborators": "array (可选) - 协作者列表：[{userid: 'xxx', auth: 2}]",
    "init_content": "array (可选) - 初始内容数组：[{type: 'text', content: '内容'}]"
  },
  "returns": {
    "docId": "文档 ID",
    "url": "文档链接",
    "title": "文档标题",
    "resourceType": "资源类型"
  }
}
```

**限制**：
- `init_content` 第一个元素作为标题自动加粗
- 图片内容需要是完整的 URL

---

### 1.2 重命名文档

```json
{
  "name": "wecom_doc",
  "action": "rename",
  "description": "重命名文档",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "newName": "string (必填) - 新名称"
  }
}
```

---

### 1.3 复制文档

```json
{
  "name": "wecom_doc",
  "action": "copy",
  "description": "复制文档到新位置",
  "parameters": {
    "docId": "string (必填) - 源文档 ID",
    "newName": "string (可选) - 新文档名称，不填则使用原名",
    "spaceId": "string (可选) - 目标空间 ID",
    "fatherId": "string (可选) - 目标父目录 fileid"
  }
}
```

---

### 1.4 获取文档信息

```json
{
  "name": "wecom_doc",
  "action": "get_info",
  "description": "获取文档基本信息（名称、类型等）",
  "parameters": {
    "docId": "string (必填) - 文档 ID"
  },
  "returns": {
    "doc_name": "文档名称",
    "doc_type": "文档类型：3(文档)|4(表格)|10(智能表格)"
  }
}
```

---

### 1.5 获取分享链接

```json
{
  "name": "wecom_doc",
  "action": "share",
  "description": "获取文档分享链接",
  "parameters": {
    "docId": "string (必填) - 文档 ID"
  },
  "returns": {
    "shareUrl": "分享链接 URL"
  }
}
```

---

### 1.6 删除文档

```json
{
  "name": "wecom_doc",
  "action": "delete",
  "description": "删除文档或收集表（二选一）",
  "parameters": {
    "docId": "string (可选) - 文档 ID",
    "formId": "string (可选) - 收集表 ID"
  }
}
```

**注意**：`docId` 和 `formId` 必须提供一个

---

## 二、文档权限管理

### 2.1 获取文档权限

```json
{
  "name": "wecom_doc",
  "action": "get_auth",
  "description": "获取文档权限信息（查看成员、协作者、访问规则）",
  "parameters": {
    "docId": "string (必填) - 文档 ID"
  },
  "returns": {
    "docMembers": "查看成员列表",
    "coAuthList": "协作者列表",
    "accessRule": "访问规则配置"
  }
}
```

---

### 2.2 诊断文档权限

```json
{
  "name": "wecom_doc",
  "action": "diagnose_auth",
  "description": "诊断文档访问权限问题，分析为何分享链接无法访问",
  "parameters": {
    "docId": "string (必填) - 文档 ID"
  },
  "returns": {
    "internalAccessEnabled": "企业内访问是否开启",
    "externalAccessEnabled": "企业外访问是否开启",
    "requesterRole": "请求人角色：viewer|collaborator|none",
    "findings": "诊断发现数组",
    "recommendations": "建议数组"
  }
}
```

---

### 2.3 校验分享链接

```json
{
  "name": "wecom_doc",
  "action": "validate_share_link",
  "description": "校验分享链接可用性，分析链接为何打不开",
  "parameters": {
    "shareUrl": "string (必填) - 企业微信文档分享链接"
  },
  "returns": {
    "httpStatus": "HTTP 状态码",
    "userType": "访问身份",
    "padType": "页面类型",
    "findings": "诊断发现"
  }
}
```

---

### 2.4 设置加入规则

```json
{
  "name": "wecom_doc",
  "action": "set_join_rule",
  "description": "设置文档加入规则（企业内/外访问权限）",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "request": {
      "enable_corp_internal": "boolean - 是否开启企业内访问",
      "corp_internal_auth": "number - 企业内权限：1(只读)|2(编辑)",
      "enable_corp_external": "boolean - 是否开启企业外访问",
      "ban_share_external": "boolean - 是否禁止外部分享"
    }
  }
}
```

---

### 2.5 设置成员权限

```json
{
  "name": "wecom_doc",
  "action": "set_member_auth",
  "description": "设置文档通知范围及成员权限",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "request": {
      "notified_scope_type": "number (必填) - 通知范围类型",
      "notified_member_list": "array (可选) - 通知成员列表"
    }
  }
}
```

---

### 2.6 授予/撤销访问权限

```json
{
  "name": "wecom_doc",
  "action": "grant_access",
  "description": "批量授予或撤销文档访问权限（查看/协作）",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "viewers": "array (可选) - 查看成员列表：[{userid: 'xxx'}]",
    "collaborators": "array (可选) - 协作者列表：[{userid: 'xxx'}]",
    "removeViewers": "array (可选) - 移除查看成员",
    "removeCollaborators": "array (可选) - 移除协作者",
    "auth": "number (可选) - 权限级别：1(只读)|2(编辑)|7(管理)"
  }
}
```

**注意**：添加协作者时自动移除其 viewer 身份

---

### 2.7 添加协作者

```json
{
  "name": "wecom_doc",
  "action": "add_collaborators",
  "description": "添加文档协作者",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "collaborators": "array (必填) - 协作者列表：[{userid: 'xxx', partyid: 'xxx', tagid: 'xxx'}]",
    "auth": "number (可选) - 权限级别：1(只读)|2(编辑)，默认 2"
  }
}
```

---

### 2.8 设置安全设置

```json
{
  "name": "wecom_doc",
  "action": "set_safety_setting",
  "description": "设置文档安全设置（水印、复制、打印等）",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "request": {
      "watermark": "object (可选) - 水印设置",
      "disable_copy": "boolean (可选) - 禁止复制",
      "disable_print": "boolean (可选) - 禁止打印"
    }
  }
}
```

---

### 2.9 获取安全设置

```json
{
  "name": "wecom_doc",
  "action": "get_doc_security_setting",
  "description": "获取文档安全设置",
  "parameters": {
    "docId": "string (必填) - 文档 ID"
  }
}
```

---

## 三、文档内容操作

### 3.1 获取文档内容

```json
{
  "name": "wecom_doc",
  "action": "get_content",
  "description": "获取文档完整内容（包含版本号和文档树结构）",
  "parameters": {
    "docId": "string (必填) - 文档 ID"
  },
  "returns": {
    "version": "文档版本号",
    "document": "文档内容树（Node 结构，包含 begin/end/property/type/children）"
  }
}
```

---

### 3.2 更新文档内容

```json
{
  "name": "wecom_doc",
  "action": "update_content",
  "description": "批量更新文档内容（单次最多 30 个操作，超限自动分批）",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "requests": "array (必填) - 更新操作列表，每个操作只能包含一个字段",
    "version": "number (可选) - 文档版本号，用于并发控制"
  },
  "returns": {
    "batches": "分批数量（超过 30 个操作时自动分批）"
  }
}
```

**支持的操作类型**：
- `replace_text`: {text: "替换文本", ranges: [{start_index: 0, length: 5}]}
- `insert_text`: {text: "插入文本", location: {index: 10}}
- `insert_image`: {image_id: "图片 URL", location: {index: 20}, width: 100, height: 100}
- `insert_table`: {rows: 3, cols: 3, location: {index: 30}}
- `insert_paragraph`: {location: {index: 40}}
- `update_text_property`: {text_property: {bold: true}, ranges: [{start_index: 0, length: 5}]}

**限制**：
- `ranges` 数量 ≤ 10
- `insert_table`: 行数≤100, 列数≤60, 单元格总数≤1000
- `version` 与最新版本差值 ≤ 100

---

### 3.3 上传图片到文档

```json
{
  "name": "wecom_doc",
  "action": "upload_doc_image",
  "description": "上传图片到文档（获取 image_id 用于 insert_image）",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "file_path": "string (必填) - 本地图片路径或 URL"
  },
  "returns": {
    "url": "图片 URL",
    "width": "图片宽度",
    "height": "图片高度",
    "size": "文件大小"
  }
}
```

---

## 四、在线表格操作

### 4.1 获取表格属性

```json
{
  "name": "wecom_doc",
  "action": "get_sheet_properties",
  "description": "获取在线表格所有工作表属性",
  "parameters": {
    "docId": "string (必填) - 表格文档 ID"
  },
  "returns": {
    "properties": [
      {
        "sheet_id": "工作表 ID",
        "title": "工作表标题",
        "row_count": "行数",
        "column_count": "列数"
      }
    ]
  }
}
```

---

### 4.2 获取表格数据

```json
{
  "name": "wecom_doc",
  "action": "get_sheet_data",
  "description": "获取指定范围内的单元格数据（A1 表示法）",
  "parameters": {
    "docId": "string (必填) - 表格文档 ID",
    "sheetId": "string (必填) - 工作表 ID",
    "range": "string (必填) - 范围，如 A1:B5"
  },
  "returns": {
    "data": {
      "start_row": "起始行",
      "start_column": "起始列",
      "rows": [{
        "values": [{
          "cell_value": {"text": "内容"},
          "cell_format": {"text_format": {...}}
        }]
      }]
    }
  }
}
```

**限制**：行数≤1000, 列数≤200, 单元格总数≤10000

---

### 4.3 编辑表格数据

```json
{
  "name": "wecom_doc",
  "action": "edit_sheet_data",
  "description": "编辑表格单元格数据（支持 gridData 或 requests 两种模式）",
  "parameters": {
    "docId": "string (必填) - 表格文档 ID",
    "sheetId": "string (必填) - 工作表 ID",
    "startRow": "number (可选) - 起始行（从 0 开始），默认 0",
    "startColumn": "number (可选) - 起始列（从 0 开始），默认 0",
    "gridData": "object (可选) - 表格数据（与 requests 二选一）",
    "requests": "array (可选) - 批量操作列表（与 gridData 二选一，最多 5 个操作）"
  }
}
```

**gridData 格式**：
```json
{
  "rows": [
    {"values": [{"cell_value": {"text": "内容"}}]}
  ]
}
```

**requests 格式**：
```json
[
  {"update_range_request": {"sheet_id": "xxx", "grid_data": {...}}},
  {"delete_dimension_request": {"sheet_id": "xxx", "dimension": "ROW", "start_index": 1, "end_index": 5}}
]
```

**限制**：
- 单次批量操作 ≤ 5 个
- 行数≤1000, 列数≤200, 单元格总数≤10000

---

### 4.4 修改表格属性

```json
{
  "name": "wecom_doc",
  "action": "modify_sheet_properties",
  "description": "修改工作表属性（添加/删除工作表、更新区域、删除行列）",
  "parameters": {
    "docId": "string (必填) - 表格文档 ID",
    "requests": "array (必填) - 操作列表（最多 5 个）"
  }
}
```

**支持的操作**：
- `add_sheet_request`: {title: "新工作表", row_count: 10, column_count: 10}
- `delete_sheet_request`: {sheet_id: "要删除的工作表 ID"}
- `update_range_request`: {sheet_id: "...", grid_data: {...}}
- `delete_dimension_request`: {sheet_id: "...", dimension: "ROW|COLUMN", start_index: 1, end_index: 5}

**限制**：
- 单次操作 ≤ 5 个
- `add_sheet`: 列数≤200, 单元格总数≤10000
- `delete_dimension`: 左闭右开区间 [start_index, end_index)

---

## 五、智能表格操作

### 5.1 查询子表

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_get_sheets",
  "description": "查询智能表格所有子表信息",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheet_id": "string (可选) - 指定子表 ID 查询",
    "need_all_type_sheet": "boolean (可选) - 获取所有类型子表（包含仪表盘和说明页）"
  },
  "returns": {
    "sheet_list": [
      {
        "sheet_id": "子表 ID",
        "title": "子表名称",
        "is_visible": "是否可见",
        "type": "smartsheet|dashboard|external"
      }
    ]
  }
}
```

---

### 5.2 添加子表

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_add_sheet",
  "description": "添加智能表格子表（空白表格，无默认字段）",
  "parameters": {
    "docId": "string (必填) - 智能表格文档 ID",
    "title": "string (可选) - 子表标题，默认'智能表'",
    "index": "number (可选) - 子表下标（从 0 开始）"
  },
  "returns": {
    "properties": {
      "sheet_id": "生成的子表 ID（6 位随机）",
      "title": "子表标题",
      "index": "子表下标"
    }
  },
  "notes": [
    "重要：通过 add_sheet 创建的子表是空白的，无默认字段、无视图、无记录",
    "需要使用 add_fields 添加字段，add_view 添加视图，add_records 添加记录",
    "与 create 创建的智能表格不同（create 会创建带 5 个默认字段的模板表格）"
  ]
}
```

**重要说明**：

| 创建方式 | 默认字段 | 适用场景 |
|---------|---------|---------|
| `create` (docType=smart_table) | 5 个默认字段（人员、文本、数字、日期、单选） | 快速搭建，接受默认字段 |
| `smartsheet_add_sheet` | 无默认字段（完全空白） | 需要完全自定义字段 |

**默认字段限制**：
- ❌ **不能删除**默认字段（系统字段，删除会报错 `errcode 2000055`）
- ❌ **不能修改**默认字段的类型（会报错 `errcode 2022010/2022017`）
- ✅ **可以修改**默认字段的标题
- ✅ **可以添加**自定义字段

**推荐做法**：如果需要完全自定义字段，请使用 `smartsheet_add_sheet` 创建空白子表。

---

### 5.3 删除子表

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_del_sheet",
  "description": "删除智能表格子表",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID"
  }
}
```

---

### 5.4 更新子表

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_update_sheet",
  "description": "修改子表标题",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "title": "string (必填) - 新标题"
  }
}
```

---

### 5.5 添加视图

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_add_view",
  "description": "在子表中添加新视图",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "view_title": "string (必填) - 视图标题",
    "view_type": "string (必填) - 视图类型",
    "property": "object (可选) - 视图属性（sort_spec, filter_spec, group_spec 等）"
  },
  "returns": {
    "view": {
      "view_id": "视图 ID",
      "view_title": "视图标题",
      "view_type": "视图类型"
    }
  }
}
```

**view_type 可选值**：
- `VIEW_TYPE_GRID` - 表格视图
- `VIEW_TYPE_KANBAN` - 看板视图
- `VIEW_TYPE_GALLERY` - 画册视图
- `VIEW_TYPE_GANTT` - 甘特视图
- `VIEW_TYPE_CALENDAR` - 日历视图

**限制**：单表最多 200 个视图

---

### 5.6 更新视图

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_update_view",
  "description": "更新视图属性",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "view_id": "string (必填) - 视图 ID",
    "view_title": "string (可选) - 新视图标题",
    "property": "object (可选) - 视图属性（sort_spec, filter_spec, group_spec, color_config 等）"
  }
}
```

---

### 5.7 删除视图

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_del_view",
  "description": "删除一个或多个视图",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "view_ids": "array (必填) - 视图 ID 列表"
  }
}
```

---

### 5.8 查询视图

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_get_views",
  "description": "获取子表下所有视图信息（支持分页）",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "view_ids": "array (可选) - 指定视图 ID 列表",
    "offset": "number (可选) - 偏移量，默认 0",
    "limit": "number (可选) - 分页大小，最大 1000"
  },
  "returns": {
    "views": [...],
    "total": "视图总数",
    "has_more": "是否还有更多",
    "next": "下次查询的偏移量"
  }
}
```

---

### 5.9 添加字段

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_add_fields",
  "description": "在子表中添加一个或多个字段",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "fields": "array (必填) - 字段列表"
  },
  "returns": {
    "fields": [
      {
        "field_id": "生成的字段 ID",
        "field_title": "字段标题",
        "field_type": "字段类型"
      }
    ]
  }
}
```

**字段格式**：
```json
{
  "field_title": "字段标题",
  "field_type": "FIELD_TYPE_TEXT|FIELD_TYPE_NUMBER|...",
  "property_number": {"format_type": "FORMAT_TYPE_NUMBER"},
  "property_select": {"options": [{"text": "选项 1"}]}
}
```

**限制**：单表最多 150 个字段，每个编组最多 150 个字段

---

### 5.10 删除字段

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_del_fields",
  "description": "删除一个或多个字段",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "field_ids": "array (必填) - 字段 ID 列表"
  }
}
```

---

### 5.11 更新字段

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_update_fields",
  "description": "更新字段标题或属性（不能更新字段类型）",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "fields": "array (必填) - 字段列表"
  }
}
```

**字段格式**：
```json
{
  "field_id": "字段 ID",
  "field_title": "可选：新字段标题",
  "field_type": "字段类型（必须为原类型，不能修改）",
  "property_number": "可选：数字类型属性"
}
```

**⚠️ 重要限制**：
- ❌ **不能修改字段类型**（官方文档 doc2.txt 行 1158 明确说明）
- ❌ 尝试修改字段类型会报错：
  - `errcode 2022010`：无效字段类型
  - `errcode 2022017`：字段类型不匹配
- ✅ **可以修改**字段标题
- ✅ **可以修改**字段属性（如数字精度、选项列表等）
- ✅ 至少提供 `field_title` 或一个 `property_*` 属性

**如需不同类型的字段**：
1. 先用 `smartsheet_del_fields` 删除旧字段
2. 再用 `smartsheet_add_fields` 创建新字段类型的字段

---

### 5.12 查询字段

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_get_fields",
  "description": "获取子表下字段信息（支持分页）",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "view_id": "string (可选) - 视图 ID",
    "field_ids": "array (可选) - 字段 ID 列表",
    "field_titles": "array (可选) - 字段标题列表",
    "offset": "number (可选) - 偏移量",
    "limit": "number (可选) - 分页大小，最大 1000"
  },
  "returns": {
    "fields": [...],
    "total": "字段总数",
    "has_more": "是否还有更多",
    "next": "下次查询的偏移量"
  }
}
```

---

### 5.13 添加编组

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_add_group",
  "description": "添加字段编组",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "name": "string (必填) - 编组名称",
    "children": "array (可选) - 字段 ID 列表"
  }
}
```

**限制**：单表最多 150 个编组

---

### 5.14 删除编组

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_del_group",
  "description": "删除编组",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "field_group_id": "string (必填) - 编组 ID"
  }
}
```

---

### 5.15 更新编组

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_update_group",
  "description": "更新编组",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "field_group_id": "string (必填) - 编组 ID",
    "name": "string (可选) - 新编组名称",
    "children": "array (可选) - 字段 ID 列表"
  }
}
```

---

### 5.16 获取编组

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_get_groups",
  "description": "获取编组列表",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID"
  }
}
```

---

### 5.17 添加记录

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_add_records",
  "description": "添加一行或多行记录",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "key_type": "string (可选) - key 类型：CELL_VALUE_KEY_TYPE_FIELD_TITLE(默认)|CELL_VALUE_KEY_TYPE_FIELD_ID",
    "records": "array (必填) - 记录列表"
  },
  "returns": {
    "records": [...]
  }
}
```

**⚠️ 关键要求**：

1. **values 的 key 必须准确匹配字段标题或字段 ID**
   - 使用 `key_type: "CELL_VALUE_KEY_TYPE_FIELD_TITLE"` 时，key 为字段标题
   - 使用 `key_type: "CELL_VALUE_KEY_TYPE_FIELD_ID"` 时，key 为字段 ID
   - **推荐先调用 `smartsheet_get_fields` 获取准确的字段信息**

2. **不同字段类型需要不同的值格式**：

| 字段类型 | 值格式 | 示例 |
|---------|--------|------|
| 文本 (FIELD_TYPE_TEXT) | `[{type: "text", text: "内容"}]` | `[{type: "text", text: "张三"}]` |
| 数字 (FIELD_TYPE_NUMBER) | `double` | `123.45` |
| 复选框 (FIELD_TYPE_CHECKBOX) | `bool` | `true` |
| 日期 (FIELD_TYPE_DATE_TIME) | `string` (毫秒时间戳) | `"1715846245084"` |
| 图片 (FIELD_TYPE_IMAGE) | `[{id, title, image_url, width, height}]` | 见下方示例 |
| 文件 (FIELD_TYPE_ATTACHMENT) | `[{name, size, file_ext, file_id, file_url, file_type, doc_type}]` | 见下方示例 |
| 成员 (FIELD_TYPE_USER) | `[{user_id: "userid"}]` | `[{user_id: "zhangsan"}]` |
| 链接 (FIELD_TYPE_URL) | `[{type: "url", text: "文本", link: "https://..."}]` | 见下方示例 |
| 多选 (FIELD_TYPE_SELECT) | `[{id, text}]` | `[{id: "1", text: "选项 1"}]` |
| 单选 (FIELD_TYPE_SINGLE_SELECT) | `[{id, text}]` | `[{id: "1", text: "选项"}]` |
| 进度 (FIELD_TYPE_PROGRESS) | `double` (0-1) | `0.75` |
| 电话 (FIELD_TYPE_PHONE_NUMBER) | `string` | `"13800138000"` |
| 邮箱 (FIELD_TYPE_EMAIL) | `string` | `"test@example.com"` |
| 地理位置 (FIELD_TYPE_LOCATION) | `[{id, latitude, longitude, title}]` | 见下方示例 |
| 货币 (FIELD_TYPE_CURRENCY) | `double` | `100.50` |
| 百分数 (FIELD_TYPE_PERCENTAGE) | `double` (0-1) | `0.85` |
| 条码 (FIELD_TYPE_BARCODE) | `string` | `"6901234567890"` |

**完整示例**：
```json
{
  "docId": "DOC123",
  "sheetId": "SHEET456",
  "key_type": "CELL_VALUE_KEY_TYPE_FIELD_TITLE",
  "records": [{
    "values": {
      "姓名": [{"type": "text", "text": "张三"}],
      "年龄": 28,
      "是否党员": true,
      "入职日期": "1715846245084",
      "绩效": 0.9,
      "工资": 15000.50,
      "完成度": 0.85,
      "联系电话": "13800138000",
      "邮箱": "zhangsan@example.com",
      "条码": "6901234567890",
      "部门": [{"id": "1", "text": "技术部"}],
      "岗位": [{"id": "1", "text": "工程师"}, {"id": "2", "text": "架构师"}],
      "成员": [{"user_id": "lisi"}],
      "链接": [{"type": "url", "text": "企业微信", "link": "https://work.weixin.qq.com"}],
      "位置": [{"id": "14313005936863363130", "latitude": "23.10647", "longitude": "113.32446", "title": "广州塔"}]
    }
  }]
}
```

**特殊字段值格式示例**：

```json
// 图片
{"values": {"图片": [{
  "id": "img_001",
  "title": "产品照片",
  "image_url": "https://example.com/image.jpg",
  "width": 800,
  "height": 600
}]}}

// 文件
{"values": {"附件": [{
  "name": "产品说明书.pdf",
  "size": 1024000,
  "file_ext": "PDF",
  "file_id": "FILE123",
  "file_url": "https://example.com/file.pdf",
  "file_type": "50",
  "doc_type": "2"
}]}}

// 链接
{"values": {"官网": [{
  "type": "url",
  "text": "企业微信官网",
  "link": "https://work.weixin.qq.com"
}]}}

// 地理位置
{"values": {"办公地点": [{
  "id": "14313005936863363130",
  "latitude": "23.10647",
  "longitude": "113.32446",
  "source_type": 1,
  "title": "广州塔"
}]}}
```

**⚠️ 常见错误**：

| 错误码 | 原因 | 解决方案 |
|--------|------|---------|
| `errcode 40058` | 字段标题/ID 不匹配 | 先用 `get_fields` 获取准确字段信息 |
| `errcode 40058` | 值格式错误 | 对照上方表格使用正确格式 |
| `errcode 40058` | 缺少必填字段 | 检查 records 数组是否为空 |
| `errcode 2000055` | 尝试向系统字段添加数据 | 避免向创建时间、最后编辑时间等系统字段添加数据 |

**限制**：
- 单次添加建议 ≤ 500 行
- 不能向创建时间、最后编辑时间、创建人、最后编辑人四种系统字段添加数据

---

### 5.18 更新记录

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_update_records",
  "description": "更新一行或多行记录",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "key_type": "string (可选) - key 类型",
    "records": "array (必填) - 记录列表"
  },
  "returns": {
    "records": [...]
  }
}
```

**记录格式**：
```json
{
  "record_id": "记录 ID",
  "values": {
    "字段标题或字段 ID": [...]
  }
}
```

**限制**：单次更新建议≤500 行

---

### 5.19 删除记录

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_del_records",
  "description": "删除一行或多行记录",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "record_ids": "array (必填) - 记录 ID 列表"
  }
}
```

**限制**：单次删除建议≤500 行

---

### 5.20 查询记录

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_get_records",
  "description": "获取记录列表（支持筛选、排序、分页）",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "sheetId": "string (必填) - 子表 ID",
    "view_id": "string (可选) - 视图 ID",
    "record_ids": "array (可选) - 指定记录 ID 列表",
    "key_type": "string (可选) - key 类型",
    "field_titles": "array (可选) - 返回指定列（字段标题）",
    "field_ids": "array (可选) - 返回指定列（字段 ID）",
    "sort": "array (可选) - 排序设置：[{field_title: "...", desc: false}]",
    "offset": "number (可选) - 偏移量",
    "limit": "number (可选) - 分页大小，最大 1000",
    "ver": "number (可选) - 版本号",
    "filter_spec": "object (可选) - 过滤设置（不与 sort 同时使用）"
  },
  "returns": {
    "records": [...],
    "total": "记录总数",
    "has_more": "是否还有更多",
    "next": "下次查询的偏移量",
    "ver": "版本号"
  }
}
```

**限制**：单表最多 100000 行记录，15000000 个单元格

---

### 5.21 获取子表权限

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_get_sheet_priv",
  "description": "获取智能表格子表权限规则",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "type": "number (必填) - 权限类型：1(全员权限)|2(额外权限)",
    "rule_id_list": "array (可选) - 规则 ID 列表"
  }
}
```

---

### 5.22 更新子表权限

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_update_sheet_priv",
  "description": "更新子表权限规则",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "type": "number (必填) - 权限类型：1(全员权限)|2(额外权限)",
    "rule_id": "number (可选) - 规则 ID（type=2 时必填）",
    "name": "string (可选) - 规则名称（type=2 时有效）",
    "priv_list": "array (必填) - 权限列表"
  }
}
```

**注意**：type=1（全员权限）时不需要 rule_id/name

---

### 5.23 创建权限规则

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_create_rule",
  "description": "创建成员额外权限规则",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "name": "string (必填) - 规则名称"
  },
  "returns": {
    "rule_id": "生成的规则 ID"
  }
}
```

---

### 5.24 修改规则成员

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_mod_rule_member",
  "description": "修改权限规则的成员范围",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "rule_id": "number (必填) - 规则 ID",
    "add_member_range": "object (可选) - 添加成员范围",
    "del_member_range": "object (可选) - 删除成员范围"
  }
}
```

---

### 5.25 删除规则

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_delete_rule",
  "description": "删除权限规则",
  "parameters": {
    "docId": "string (必填) - 文档 ID",
    "rule_id_list": "array (必填) - 规则 ID 列表"
  }
}
```

---

## 六、收集表操作

### 6.1 创建收集表

```json
{
  "name": "wecom_doc",
  "action": "create_form",
  "description": "创建收集表（表单）",
  "parameters": {
    "formInfo": "object (必填) - 收集表信息",
    "spaceId": "string (可选) - 空间 ID",
    "fatherId": "string (可选) - 父目录 fileid"
  },
  "returns": {
    "formId": "收集表 ID",
    "title": "收集表标题"
  }
}
```

**formInfo 格式**：
```json
{
  "form_title": "标题",
  "form_desc": "描述",
  "form_header": "背景图链接",
  "form_question": {
    "items": [
      {
        "question_id": 1,
        "title": "问题标题",
        "pos": 1,
        "status": 1,
        "reply_type": 1,
        "must_reply": true,
        "note": "备注",
        "placeholder": "输入提示",
        "question_extend_setting": {},
        "option_item": [{"key": 1, "value": "选项", "status": 1}]
      }
    ]
  },
  "form_setting": {
    "fill_out_auth": 0,
    "fill_in_range": {"userids": ["xxx"], "departmentids": [1001]},
    "timed_repeat_info": {"enable": false, "remind_time": 1609459200},
    "allow_multi_fill": false,
    "can_anonymous": false,
    "can_notify_submit": false
  }
}
```

**限制**：
- 问题数量 ≤ 200
- 单选/多选/下拉列表必须提供 option_item
- `timed_repeat_info.enable=true` 时必须提供 `fill_in_range`

---

### 6.2 编辑收集表

```json
{
  "name": "wecom_doc",
  "action": "modify_form",
  "description": "编辑收集表（全量修改问题或设置）",
  "parameters": {
    "oper": "number (必填) - 操作类型：1(全量修改问题)|2(全量修改设置)",
    "formId": "string (必填) - 收集表 ID",
    "formInfo": "object (必填) - 收集表信息"
  }
}
```

**注意**：
- oper=1：必须提供完整的 form_question.items 数组（缺失的问题将被删除）
- oper=2：必须提供完整的 form_setting 对象（缺失的设置项将被重置）
- `timed_repeat_info` 与 `timed_finish` 互斥

---

### 6.3 获取收集表信息

```json
{
  "name": "wecom_doc",
  "action": "get_form_info",
  "description": "获取收集表详细信息",
  "parameters": {
    "formId": "string (必填) - 收集表 ID"
  },
  "returns": {
    "form_info": {
      "formid": "收集表 ID",
      "form_title": "标题",
      "form_question": {"items": [...]},
      "form_setting": {...},
      "repeated_id": ["周期 ID 列表"]
    }
  }
}
```

---

### 6.4 获取收集表答案

```json
{
  "name": "wecom_doc",
  "action": "get_form_answer",
  "description": "获取收集表提交的答案",
  "parameters": {
    "repeatedId": "string (必填) - 收集表周期 ID",
    "answerIds": "array (可选) - 答案 ID 列表，最多 100 个"
  },
  "returns": {
    "answer_list": [
      {
        "answer_id": 15,
        "user_name": "张三",
        "ctime": 1668430580,
        "reply": {
          "items": [
            {"question_id": 1, "text_reply": "答案"},
            {"question_id": 2, "option_reply": [2]}
          ]
        }
      }
    ]
  }
}
```

**限制**：answer_ids ≤ 100

---

### 6.5 获取收集表统计

```json
{
  "name": "wecom_doc",
  "action": "get_form_statistic",
  "description": "获取收集表统计信息",
  "parameters": {
    "requests": "array (必填) - 请求列表"
  },
  "returns": {
    "fill_cnt": 10,
    "fill_user_cnt": 8,
    "unfill_user_cnt": 5,
    "submit_users": [...],
    "unfill_users": [...]
  }
}
```

**请求格式**：
```json
{
  "repeated_id": "周期 ID",
  "req_type": 1,
  "start_time": 1667395287,
  "end_time": 1668418369,
  "limit": 20,
  "cursor": 1
}
```

**req_type 说明**：
- 1：仅获取统计结果
- 2：获取已提交列表（必须提供 start_time 和 end_time）
- 3：获取未提交列表

**限制**：limit ≤ 10000

---

## 七、高级账号管理

### 7.1 分配高级功能账号

```json
{
  "name": "wecom_doc",
  "action": "doc_assign_advanced_account",
  "description": "分配文档高级功能账号",
  "parameters": {
    "userid_list": "array (必填) - 成员 ID 列表"
  },
  "returns": {
    "jobid": "任务 ID"
  }
}
```

---

### 7.2 取消高级功能账号

```json
{
  "name": "wecom_doc",
  "action": "doc_cancel_advanced_account",
  "description": "取消文档高级功能账号",
  "parameters": {
    "userid_list": "array (必填) - 成员 ID 列表"
  },
  "returns": {
    "jobid": "任务 ID"
  }
}
```

---

### 7.3 获取高级账号列表

```json
{
  "name": "wecom_doc",
  "action": "doc_get_advanced_account_list",
  "description": "获取高级功能账号列表",
  "parameters": {
    "cursor": "number (可选) - 分页游标",
    "limit": "number (可选) - 每页数量，默认 100"
  },
  "returns": {
    "user_list": [...],
    "has_more": "是否还有更多"
  }
}
```

---

## 八、字段类型对照表

### 智能表格字段类型 (FieldType)

| 类型值 | 说明 | property 属性 |
|--------|------|--------------|
| FIELD_TYPE_TEXT | 文本 | - |
| FIELD_TYPE_NUMBER | 数字 | property_number |
| FIELD_TYPE_CHECKBOX | 复选框 | property_checkbox |
| FIELD_TYPE_DATE_TIME | 日期时间 | property_date_time |
| FIELD_TYPE_IMAGE | 图片 | property_image |
| FIELD_TYPE_ATTACHMENT | 文件 | property_attachment |
| FIELD_TYPE_USER | 成员 | property_user |
| FIELD_TYPE_URL | 超链接 | property_url |
| FIELD_TYPE_SELECT | 多选 | property_select |
| FIELD_TYPE_SINGLE_SELECT | 单选 | property_single_select |
| FIELD_TYPE_CREATED_USER | 创建人 | - |
| FIELD_TYPE_MODIFIED_USER | 最后编辑人 | - |
| FIELD_TYPE_CREATED_TIME | 创建时间 | property_created_time |
| FIELD_TYPE_MODIFIED_TIME | 最后编辑时间 | property_modified_time |
| FIELD_TYPE_PROGRESS | 进度 | property_progress |
| FIELD_TYPE_PHONE_NUMBER | 电话 | property_phone_number |
| FIELD_TYPE_EMAIL | 邮箱 | property_email |
| FIELD_TYPE_REFERENCE | 关联 | property_reference |
| FIELD_TYPE_LOCATION | 地理位置 | property_location |
| FIELD_TYPE_CURRENCY | 货币 | property_currency |
| FIELD_TYPE_WWGROUP | 企业微信群 | property_ww_group |
| FIELD_TYPE_AUTONUMBER | 自动编号 | property_auto_number |
| FIELD_TYPE_PERCENTAGE | 百分数 | property_percentage |
| FIELD_TYPE_BARCODE | 条码 | property_barcode |

---

### 收集表问题类型 (reply_type)

| 类型值 | 说明 | 扩展设置 |
|--------|------|---------|
| 1 | 文本 | text_setting |
| 2 | 单选 | radio_setting |
| 3 | 多选 | checkbox_setting |
| 5 | 位置 | location_setting |
| 9 | 图片 | image_setting |
| 10 | 文件 | file_setting |
| 11 | 日期 | date_setting |
| 14 | 时间 | time_setting |
| 15 | 下拉列表 | - |
| 16 | 体温 | temperature_setting |
| 17 | 签名 | - |
| 18 | 部门 | department_setting |
| 19 | 成员 | member_setting |
| 22 | 时长 | duration_setting |

---

## 九、使用示例

### 示例 1：创建文档并添加协作者

```json
{
  "name": "wecom_doc",
  "action": "create",
  "parameters": {
    "docName": "项目计划",
    "docType": "doc",
    "collaborators": [{"userid": "zhangsan"}, {"userid": "lisi"}],
    "init_content": [
      {"type": "text", "content": "项目计划文档"},  // 第 1 个元素作为标题，自动加粗并独占一行
      {"type": "text", "content": "一、项目目标"},  // 正文段落
      {"type": "text", "content": "二、项目进度"}   // 正文段落
    ]
  }
}
```

**init_content 格式说明**：

| 元素类型 | 格式 | 说明 |
|---------|------|------|
| 文本 | `{"type": "text", "content": "内容"}` 或直接字符串 | 第 1 个元素作为标题（自动加粗），后续作为正文段落 |
| 图片 | `{"type": "image", "url": "图片 URL"}` | 自动上传并插入到文档 |

**标题和正文格式**：
- ✅ **第 1 个元素**：自动作为标题，**加粗**并独占一行
- ✅ **后续元素**：作为正文段落，每个元素独立一段
- ✅ **图片**：自动上传到企业微信并插入到对应段落

**示例**：
```json
{
  "init_content": [
    "2024 年度销售报告",                    // 标题（加粗）
    {"type": "text", "content": "摘要"},     // 正文段落
    {"type": "image", "url": "https://..."}, // 图片
    {"type": "text", "content": "详细数据"}  // 正文段落
  ]
}
```

---

### 示例 2：批量更新文档内容

```json
{
  "name": "wecom_doc",
  "action": "update_content",
  "parameters": {
    "docId": "DOCID123",
    "requests": [
      {"replace_text": {"text": "新标题", "ranges": [{"start_index": 0, "length": 5}]}},
      {"insert_text": {"text": "新增段落", "location": {"index": 10}}},
      {"insert_image": {"image_id": "https://...", "location": {"index": 20}}}
    ]
  }
}
```

---

### 示例 3：智能表格添加记录

```json
{
  "name": "wecom_doc",
  "action": "smartsheet_add_records",
  "parameters": {
    "docId": "DOCID456",
    "sheetId": "SHEET789",
    "records": [
      {
        "values": {
          "姓名": [{"type": "text", "text": "张三"}],
          "年龄": [28],
          "部门": [{"type": "text", "text": "技术部"}],
          "入职日期": ["1715846245084"],
          "绩效": [0.9],
          "是否转正": [true]
        }
      }
    ]
  }
}
```

---

### 示例 4：创建收集表

```json
{
  "name": "wecom_doc",
  "action": "create_form",
  "parameters": {
    "formInfo": {
      "form_title": "员工满意度调查",
      "form_question": {
        "items": [
          {
            "question_id": 1,
            "title": "您的部门",
            "pos": 1,
            "reply_type": 15,
            "must_reply": true,
            "option_item": [
              {"key": 1, "value": "技术部"},
              {"key": 2, "value": "产品部"},
              {"key": 3, "value": "市场部"}
            ]
          },
          {
            "question_id": 2,
            "title": "满意度评分",
            "pos": 2,
            "reply_type": 2,
            "must_reply": true,
            "option_item": [
              {"key": 1, "value": "非常满意"},
              {"key": 2, "value": "满意"},
              {"key": 3, "value": "一般"},
              {"key": 4, "value": "不满意"}
            ]
          }
        ]
      }
    }
  }
}
```

---

## 十、注意事项

### 10.1 智能表格重要限制

#### 默认字段限制

**创建方式对比**：

| 创建方式 | API | 默认字段 | 能否删除 | 能否修改类型 |
|---------|-----|---------|---------|------------|
| 创建智能表格文档 | `create` (docType=smart_table) | 5 个（人员、文本、数字、日期、单选） | ❌ 不能 | ❌ 不能 |
| 添加空白子表 | `smartsheet_add_sheet` | 无 | N/A | N/A |

**系统默认字段（5 个）**：
- ❌ **不能删除**（删除会报错 `errcode 2000055`）
- ❌ **不能修改类型**（修改会报错 `errcode 2022010/2022017`）
- ✅ **可以修改标题**
- ✅ **可以修改属性**（如选项列表、数字精度等）

**推荐做法**：
- 如果需要完全自定义字段，使用 `smartsheet_add_sheet` 创建空白子表
- 如果接受默认字段，使用 `create` 创建智能表格文档

#### 字段类型修改限制

**官方文档明确说明**（doc2.txt 行 1158）：
> "该接口只能更新字段名、字段属性，**不能更新字段类型**。"

**错误码**：
- `errcode 2022010`：无效字段类型
- `errcode 2022017`：字段类型不匹配

**解决方案**：
如需不同类型的字段：
1. 用 `smartsheet_del_fields` 删除旧字段
2. 用 `smartsheet_add_fields` 创建新字段类型的字段

#### 记录添加格式要求

**关键要求**：
1. values 的 key 必须准确匹配字段标题或字段 ID
2. 不同字段类型需要不同的值格式
3. 不能向 4 种系统字段添加数据（创建时间、最后编辑时间、创建人、最后编辑人）

**推荐流程**：
```
1. 调用 smartsheet_get_fields 获取字段列表
2. 确认字段标题或字段 ID
3. 根据字段类型准备对应格式的值
4. 调用 smartsheet_add_records 添加记录
```

### 10.2 批量操作限制

| 操作类型 | 限制 |
|--------|------|
| 文档批量更新 | ≤ 30 个操作 |
| 表格批量更新 | ≤ 5 个操作 |
| 收集表答案查询 | ≤ 100 个答案 ID |
| 智能表格单次添加记录 | 建议 ≤ 500 行 |
| 智能表格单次更新记录 | 建议 ≤ 500 行 |
| 智能表格单次删除记录 | 建议 ≤ 500 行 |

### 10.3 版本控制

- 更新文档内容时，`version` 与最新版差值不能超过 100
- 建议每次更新前获取最新文档内容
- 自动分批时会为每批获取最新版本

### 10.4 权限说明

- 自建应用需配置到"可调用应用"列表
- 第三方应用需具有"文档"权限
- 代开发自建应用需具有"文档"权限
- 只能操作该应用创建的文档

### 10.5 智能表格容量限制

| 限制项 | 值 |
|--------|-----|
| 单表最多记录数 | 100000 行 |
| 单表最多单元格数 | 15000000 个 |
| 单表最多字段数 | 150 个 |
| 单表最多视图数 | 200 个 |
| 单表最多编组数 | 150 个 |
| 每个编组最多字段数 | 150 个 |

### 10.6 收集表限制

| 限制项 | 值 |
|--------|-----|
| 问题数量 | ≤ 200 个 |
| 选项 key | 从 1 开始连续 |
| 问题 ID | 从 1 开始连续（家校收集表从 2 开始） |
| 图片/文件上传数量 | 1-9 个 |
| 图片/文件大小限制 | 最大 3000MB |

### 10.7 互斥参数

- `timed_repeat_info.enable` 与 `timed_finish` 互斥
- `filter_spec` 与 `sort` 互斥（查询记录时）

---

**文档版本**: 2026-03-17  
**适用版本**: OpenClaw WeChat Plugin v2.3.16+  
**官方文档**: https://developer.work.weixin.qq.com/document/path/95071
