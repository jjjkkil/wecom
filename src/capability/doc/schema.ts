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
            enum: [3, 4, 5],
        },
    ],
    default: "doc",
    description: "文档类型：doc=文档，spreadsheet=表格，smart_table=智能表格",
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
                    ...nonEmptyObjectProperty,
                    description: "mod_doc_safty_setting 请求体。插件会自动补 docid。",
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
            required: ["action", "docId", "operation", "bodyData"],
            properties: {
                action: { const: "smart_table_operate" },
                accountId: accountIdProperty,
                docId: {
                    ...docIdProperty,
                    description: "智能表格 docid",
                },
                operation: {
                    type: "string",
                    minLength: 1,
                    description: "操作类型（如 add_records 等 API 路径最后一段）",
                },
                bodyData: {
                    ...nonEmptyObjectProperty,
                    description: "操作请求体（除了 docid 以外的字段）",
                },
            },
        },
    ],
} as const;
