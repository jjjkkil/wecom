const accountIdProperty = {
    type: "string",
    minLength: 1,
    description: "可选：指定企业微信账号 ID；不填时按 agent 账号/默认账号自动选择",
};

const docTypeProperty = {
    oneOf: [
        {
            type: "string",
            enum: ["doc", "spreadsheet", "smart_table"],
        },
        {
            type: "integer",
            enum: [3, 4, 10],
        },
    ],
    default: "doc",
    description: "文档类型：doc=文档，spreadsheet=表格，smart_table=智能表格",
};

const sheetIdProperty = {
    type: "string",
    minLength: 1,
    description: "子表 ID (sheet_id)",
};

const docIdProperty = {
    type: "string",
    minLength: 1,
    description: "文档 docid",
};

const formIdProperty = {
    type: "string",
    minLength: 1,
    description: "收集表 formid",
};

const shareUrlProperty = {
    type: "string",
    minLength: 1,
    description: "企业微信文档分享链接",
};

const genericObjectProperty = {
    type: "object",
    additionalProperties: true,
};

const nonEmptyObjectProperty = {
    ...genericObjectProperty,
    minProperties: 1,
};

const docMemberEntryProperty = {
    oneOf: [
        {
            type: "string",
            minLength: 1,
        },
        {
            type: "object",
            additionalProperties: true,
            minProperties: 1,
        },
    ],
};

const docMemberEntryArrayProperty = {
    type: "array",
    minItems: 1,
    items: docMemberEntryProperty,
};

export const wecomDocToolSchema = {
    oneOf: [
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId"],
            properties: {
                action: { const: "get_doc_security_setting" },
                accountId: accountIdProperty,
                docId: docIdProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "setting"],
            properties: {
                action: { const: "mod_doc_security_setting" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                setting: nonEmptyObjectProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docName"],
            properties: {
                action: { const: "create" },
                accountId: accountIdProperty,
                docName: {
                    type: "string",
                    minLength: 1,
                    description: "文档名称",
                },
                docType: docTypeProperty,
                spaceId: {
                    type: "string",
                    minLength: 1,
                    description: "可选：文档空间 ID",
                },
                fatherId: {
                    type: "string",
                    minLength: 1,
                    description: "可选：父目录 fileid；传 spaceId 时通常也应传 fatherId",
                },
                adminUsers: {
                    type: "array",
                    description: "可选：文档管理员 userid 列表",
                    items: {
                        type: "string",
                        minLength: 1,
                    },
                },
                viewers: {
                    ...docMemberEntryArrayProperty,
                    description: "可选：创建后立即授予查看权限的成员列表",
                },
                collaborators: {
                    ...docMemberEntryArrayProperty,
                    description: "可选：创建后立即授予协作者权限的成员列表",
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "newName"],
            properties: {
                action: { const: "rename" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                newName: {
                    type: "string",
                    minLength: 1,
                    description: "新文档名",
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId"],
            properties: {
                action: { const: "copy" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                newName: {
                    type: "string",
                    minLength: 1,
                    description: "可选：复制后的新文档名",
                },
                spaceId: {
                    type: "string",
                    minLength: 1,
                    description: "可选：目标空间 ID",
                },
                fatherId: {
                    type: "string",
                    minLength: 1,
                    description: "可选：目标父目录 fileid",
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId"],
            properties: {
                action: { const: "get_info" },
                accountId: accountIdProperty,
                docId: docIdProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId"],
            properties: {
                action: { const: "share" },
                accountId: accountIdProperty,
                docId: docIdProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId"],
            properties: {
                action: { const: "get_auth" },
                accountId: accountIdProperty,
                docId: docIdProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "notified_scope_type"],
            properties: {
                action: { const: "mod_doc_member_notified_scope" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                notified_scope_type: { type: "integer", description: "通知范围类型：0-不通知，1-仅协作者，2-所有人" },
                notified_member_list: { type: "array", items: nonEmptyObjectProperty, description: "指定成员列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId"],
            properties: {
                action: { const: "diagnose_auth" },
                accountId: accountIdProperty,
                docId: docIdProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "shareUrl"],
            properties: {
                action: { const: "validate_share_link" },
                accountId: accountIdProperty,
                shareUrl: shareUrlProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action"],
            anyOf: [{ required: ["docId"] }, { required: ["formId"] }],
            properties: {
                action: { const: "delete" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                formId: formIdProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "request"],
            properties: {
                action: { const: "set_join_rule" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                request: {
                    ...nonEmptyObjectProperty,
                    description: "mod_doc_join_rule 请求体。插件会自动补 docid。",
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId"],
            anyOf: [
                { required: ["viewers"] },
                { required: ["collaborators"] },
                { required: ["removeViewers"] },
                { required: ["removeCollaborators"] },
            ],
            properties: {
                action: { const: "grant_access" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                auth: {
                    type: "integer",
                    enum: [1, 2, 7],
                    description: "权限位：1-查看，2-编辑，7-管理",
                },
                viewers: {
                    ...docMemberEntryArrayProperty,
                    description: "新增查看成员列表",
                },
                collaborators: {
                    ...docMemberEntryArrayProperty,
                    description: "新增协作者列表",
                },
                removeViewers: {
                    ...docMemberEntryArrayProperty,
                    description: "移除查看成员列表",
                },
                removeCollaborators: {
                    ...docMemberEntryArrayProperty,
                    description: "移除协作者列表",
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "collaborators"],
            properties: {
                action: { const: "add_collaborators" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                auth: {
                    type: "integer",
                    enum: [1, 2, 7],
                    description: "权限位：1-查看，2-编辑，7-管理；默认为 2 (编辑)",
                },
                collaborators: {
                    ...docMemberEntryArrayProperty,
                    description: "要添加的协作者列表；字符串会自动按 userid 处理",
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId"],
            properties: {
                action: { const: "get_content" },
                accountId: accountIdProperty,
                docId: docIdProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "requests"],
            properties: {
                action: { const: "update_content" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                version: {
                    type: "integer",
                    description: "可选：文档版本号，用于乐观锁",
                },
                requests: {
                    type: "array",
                    minItems: 1,
                    description: "操作列表，按企业微信官方 batch_update 定义填写",
                    items: nonEmptyObjectProperty,
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "request"],
            properties: {
                action: { const: "set_member_auth" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                request: {
                    ...nonEmptyObjectProperty,
                    description: "mod_doc_member 请求体。插件会自动补 docid。",
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "request"],
            properties: {
                action: { const: "set_safety_setting" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                request: {
                    type: "object",
                    additionalProperties: true,
                    description: "mod_doc_safty_setting 请求体；包含 enable_readonly_copy, watermark 等",
                    properties: {
                        enable_readonly_copy: { type: "boolean", description: "是否允许只读成员复制、下载" },
                        watermark: {
                            type: "object",
                            description: "水印设置",
                            properties: {
                                margin_type: { type: "integer", description: "1:稀疏，2:紧密" },
                                show_visitor_name: { type: "boolean" },
                                show_text: { type: "boolean" },
                                text: { type: "string" },
                            },
                        },
                    },
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "formInfo"],
            properties: {
                action: { const: "create_collect" },
                accountId: accountIdProperty,
                formInfo: {
                    ...nonEmptyObjectProperty,
                    description: "收集表 form_info 对象，至少应包含 form_title 等官方字段",
                },
                spaceId: {
                    type: "string",
                    minLength: 1,
                    description: "可选：文档空间 ID",
                },
                fatherId: {
                    type: "string",
                    minLength: 1,
                    description: "可选：父目录 fileid",
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "oper", "formId", "formInfo"],
            properties: {
                action: { const: "modify_collect" },
                accountId: accountIdProperty,
                oper: {
                    type: "string",
                    minLength: 1,
                    description: "修改操作类型，按企业微信官方 modify_collect 定义填写",
                },
                formId: formIdProperty,
                formInfo: {
                    ...nonEmptyObjectProperty,
                    description: "收集表 form_info 对象",
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "formId"],
            properties: {
                action: { const: "get_form_info" },
                accountId: accountIdProperty,
                formId: formIdProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "repeatedId"],
            properties: {
                action: { const: "get_form_answer" },
                accountId: accountIdProperty,
                repeatedId: {
                    type: "string",
                    minLength: 1,
                    description: "收集表提交记录 repeated_id",
                },
                answerIds: {
                    type: "array",
                    description: "可选：答案 ID 列表",
                    items: {
                        type: "integer",
                    },
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "requests"],
            properties: {
                action: { const: "get_form_statistic" },
                accountId: accountIdProperty,
                requests: {
                    type: "array",
                    minItems: 1,
                    description: "统计请求列表；每项按企业微信 get_form_statistic 官方结构填写",
                    items: nonEmptyObjectProperty,
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId"],
            properties: {
                action: { const: "get_sheet_properties" },
                accountId: accountIdProperty,
                docId: {
                    ...docIdProperty,
                    description: "在线表格 docid",
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "request"],
            properties: {
                action: { const: "edit_sheet_data" },
                accountId: accountIdProperty,
                docId: {
                    ...docIdProperty,
                    description: "在线表格 docid",
                },
                request: {
                    ...nonEmptyObjectProperty,
                    description: "编辑表格请求体，按企业微信官方 edit_data 定义填写",
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "range"],
            properties: {
                action: { const: "get_sheet_data" },
                accountId: accountIdProperty,
                docId: {
                    ...docIdProperty,
                    description: "在线表格 docid",
                },
                sheetId: {
                    type: "string",
                    minLength: 1,
                    description: "工作表 sheet_id",
                },
                range: {
                    type: "string",
                    minLength: 1,
                    description: "读取范围，如 A1:E10",
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "requests"],
            properties: {
                action: { const: "modify_sheet_properties" },
                accountId: accountIdProperty,
                docId: {
                    ...docIdProperty,
                    description: "在线表格 docid",
                },
                requests: {
                    type: "array",
                    minItems: 1,
                    description: "修改属性请求列表",
                    items: nonEmptyObjectProperty,
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "records"],
            properties: {
                action: { const: "smartsheet_add_records" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: { type: "string", description: "子表 ID" },
                records: { type: "array", items: nonEmptyObjectProperty, description: "记录列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "records"],
            properties: {
                action: { const: "smartsheet_update_records" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: { type: "string", description: "子表 ID" },
                records: { type: "array", items: nonEmptyObjectProperty, description: "更新记录列表，需包含 record_id" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "record_ids"],
            properties: {
                action: { const: "smartsheet_del_records" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: { type: "string", description: "子表 ID" },
                record_ids: { type: "array", items: { type: "string" }, description: "记录 ID 列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId"],
            properties: {
                action: { const: "smartsheet_get_records" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: { type: "string", description: "子表 ID" },
                record_ids: { type: "array", items: { type: "string" }, description: "可选：指定记录 ID 列表" },
                offset: { type: "integer" },
                limit: { type: "integer" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId"],
            properties: {
                action: { const: "smartsheet_get_fields" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: { type: "string", description: "子表 ID" },
                view_id: { type: "string", description: "可选：视图 ID" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId"],
            properties: {
                action: { const: "smartsheet_get_views" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: { type: "string", description: "子表 ID" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId"],
            properties: {
                action: { const: "smartsheet_get_sheets" },
                accountId: accountIdProperty,
                docId: docIdProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "title"],
            properties: {
                action: { const: "smartsheet_add_sheet" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                title: { type: "string", description: "子表标题" },
                index: { type: "integer", description: "可选：子表位置索引" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId"],
            properties: {
                action: { const: "smartsheet_del_sheet" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId"],
            properties: {
                action: { const: "smartsheet_update_sheet" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                title: { type: "string", description: "新标题" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "view_title", "view_type"],
            properties: {
                action: { const: "smartsheet_add_view" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                view_title: { type: "string", description: "视图标题" },
                view_type: { 
                    type: "string", 
                    enum: ["VIEW_TYPE_GRID", "VIEW_TYPE_KANBAN", "VIEW_TYPE_GALLERY", "VIEW_TYPE_GANTT", "VIEW_TYPE_CALENDAR"],
                    description: "视图类型"
                },
                property_gantt: genericObjectProperty,
                property_calendar: genericObjectProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "view_id"],
            properties: {
                action: { const: "smartsheet_update_view" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                view_id: { type: "string", description: "视图 ID" },
                view_title: { type: "string", description: "视图标题" },
                property_gantt: genericObjectProperty,
                property_calendar: genericObjectProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "view_ids"],
            properties: {
                action: { const: "smartsheet_del_view" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                view_ids: { type: "array", items: { type: "string" }, description: "视图 ID 列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "fields"],
            properties: {
                action: { const: "smartsheet_add_fields" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                fields: { 
                    type: "array", 
                    items: nonEmptyObjectProperty,
                    description: "要添加的字段列表，每项包含 field_title, field_type 等"
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "field_ids"],
            properties: {
                action: { const: "smartsheet_del_fields" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                field_ids: { type: "array", items: { type: "string" }, description: "字段 ID 列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "fields"],
            properties: {
                action: { const: "smartsheet_update_fields" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                fields: { 
                    type: "array", 
                    items: nonEmptyObjectProperty,
                    description: "要更新的字段列表，每项需包含 field_id"
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "name"],
            properties: {
                action: { const: "smartsheet_add_group" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                name: { type: "string", description: "编组名称" },
                children: { type: "array", items: { type: "string" }, description: "字段 ID 列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "field_group_id"],
            properties: {
                action: { const: "smartsheet_del_group" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                field_group_id: { type: "string", description: "编组 ID" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "field_group_id"],
            properties: {
                action: { const: "smartsheet_update_group" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                field_group_id: { type: "string", description: "编组 ID" },
                name: { type: "string" },
                children: { type: "array", items: { type: "string" } },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId"],
            properties: {
                action: { const: "smartsheet_get_groups" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "records"],
            properties: {
                action: { const: "smartsheet_add_external_records" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                records: { type: "array", items: nonEmptyObjectProperty, description: "记录列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "records"],
            properties: {
                action: { const: "smartsheet_update_external_records" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                records: { type: "array", items: nonEmptyObjectProperty, description: "记录列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "records"],
            properties: {
                action: { const: "smartsheet_add_records" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                records: { type: "array", items: nonEmptyObjectProperty, description: "记录列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "records"],
            properties: {
                action: { const: "smartsheet_update_records" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                records: { type: "array", items: nonEmptyObjectProperty, description: "记录列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId", "record_ids"],
            properties: {
                action: { const: "smartsheet_del_records" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                record_ids: { type: "array", items: { type: "string" }, description: "记录 ID 列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "sheetId"],
            properties: {
                action: { const: "smartsheet_get_records" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                sheetId: sheetIdProperty,
                record_ids: { type: "array", items: { type: "string" }, description: "可选：记录 ID 列表" },
                offset: { type: "integer" },
                limit: { type: "integer" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "type"],
            properties: {
                action: { const: "smartsheet_get_sheet_priv" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                type: { type: "integer", enum: [1, 2], description: "规则类型：1-全员权限，2-额外权限" },
                rule_id_list: { type: "array", items: { type: "integer" }, description: "规则 ID 列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId"],
            properties: {
                action: { const: "smartsheet_mod_sheet_priv" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                rule_list: { type: "array", items: nonEmptyObjectProperty, description: "权限规则列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "member_priv_list"],
            properties: {
                action: { const: "smartsheet_add_member_priv" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                member_priv_list: { type: "array", items: nonEmptyObjectProperty, description: "成员额外权限列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "member_priv_list"],
            properties: {
                action: { const: "smartsheet_mod_member_priv" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                member_priv_list: { type: "array", items: nonEmptyObjectProperty, description: "成员额外权限列表，需包含 rule_id" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "docId", "rule_id_list"],
            properties: {
                action: { const: "smartsheet_del_member_priv" },
                accountId: accountIdProperty,
                docId: docIdProperty,
                rule_id_list: { type: "array", items: { type: "integer" }, description: "规则 ID 列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "userid_list"],
            properties: {
                action: { const: "doc_assign_advanced_account" },
                accountId: accountIdProperty,
                userid_list: { type: "array", items: { type: "string" }, description: "成员 ID 列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "userid_list"],
            properties: {
                action: { const: "doc_cancel_advanced_account" },
                accountId: accountIdProperty,
                userid_list: { type: "array", items: { type: "string" }, description: "成员 ID 列表" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action"],
            properties: {
                action: { const: "doc_get_advanced_account_list" },
                accountId: accountIdProperty,
                offset: { type: "integer" },
                limit: { type: "integer" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["action", "file_path"],
            properties: {
                action: { const: "upload_doc_image" },
                accountId: accountIdProperty,
                file_path: { type: "string", description: "本地图片路径" },
            },
        },
    ],
} as const;
