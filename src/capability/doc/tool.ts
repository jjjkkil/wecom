import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { wecomDocToolSchema } from "./schema.js";
import { WecomDocClient } from "./client.js";
import type { ResolvedAgentAccount } from "../../types/index.js";
import { resolveAgentAccountOrUndefined } from "../bot/fallback-delivery.js";

function readString(value: unknown): string {
    const trimmed = String(value ?? "").trim();
    return trimmed || "";
}

function mapDocTypeLabel(docType: number): string {
    if (docType === 5) return "智能表格";
    return docType === 4 ? "表格" : "文档";
}

function summarizeDocInfo(info: any = {}) {
    const docName = readString(info.doc_name) || "未命名文档";
    const docType = mapDocTypeLabel(Number(info.doc_type));
    return `${docType}“${docName}”信息已获取`;
}

function summarizeDocAuth(result: any = {}) {
    return `权限信息已获取：通知成员 ${result.docMembers?.length ?? 0}，协作者 ${result.coAuthList?.length ?? 0}`;
}

function readBooleanFlag(value: unknown): boolean | null {
    return typeof value === "boolean" ? value : null;
}

function formatDocMemberRef(value: any) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    const userid = readString(value.userid ?? value.userId);
    if (userid) return `userid:${userid}`;
    const partyid = readString(value.partyid);
    if (partyid) return `partyid:${partyid}`;
    const tagid = readString(value.tagid);
    if (tagid) return `tagid:${tagid}`;
    return "";
}

function mapDocMemberList(values: any) {
    return Array.isArray(values)
        ? values.map((item) => formatDocMemberRef(item)).filter(Boolean)
        : [];
}

function describeFlagState(value: boolean | null, enabledLabel: string, disabledLabel: string, unknownLabel = "未知") {
    if (value === true) return enabledLabel;
    if (value === false) return disabledLabel;
    return unknownLabel;
}

function buildDocAuthDiagnosis(result: any = {}, requesterSenderId = "") {
    const accessRule = result.accessRule && typeof result.accessRule === "object" ? result.accessRule : {};
    const viewers = mapDocMemberList(result.docMembers);
    const collaborators = mapDocMemberList(result.coAuthList);
    const requester = readString(requesterSenderId);
    const requesterViewerRef = requester ? `userid:${requester}` : "";
    const requesterIsViewer = requesterViewerRef ? viewers.includes(requesterViewerRef) : false;
    const requesterIsCollaborator = requesterViewerRef ? collaborators.includes(requesterViewerRef) : false;
    const internalAccessEnabled = readBooleanFlag(accessRule.enable_corp_internal);
    const externalAccessEnabled = readBooleanFlag(accessRule.enable_corp_external);
    const externalShareAllowed = typeof accessRule.ban_share_external === "boolean"
        ? !accessRule.ban_share_external
        : null;
    const likelyAnonymousLinkFailure = internalAccessEnabled === true && externalAccessEnabled === false;
    const findings = [
        `企业内访问：${describeFlagState(internalAccessEnabled, "开启", "关闭")}`,
        `企业外访问：${describeFlagState(externalAccessEnabled, "开启", "关闭")}`,
        `外部分享：${describeFlagState(externalShareAllowed, "允许", "禁止")}`,
        `查看成员：${viewers.length}`,
        `协作者：${collaborators.length}`,
    ];
    const recommendations: string[] = [];
    if (likelyAnonymousLinkFailure) {
        recommendations.push("当前更像是仅企业内可访问；匿名浏览器或未登录企业微信环境通常会显示“文档不存在”。");
    }
    if (requester) {
        if (requesterIsCollaborator) {
            recommendations.push(`当前请求人 ${requester} 已在协作者列表中。`);
        } else if (requesterIsViewer) {
            recommendations.push(`当前请求人 ${requester} 已在查看成员列表中，但还不是协作者。`);
        } else {
            recommendations.push(`当前请求人 ${requester} 不在查看成员或协作者列表中。`);
        }
    }
    return {
        internalAccessEnabled,
        externalAccessEnabled,
        externalShareAllowed,
        viewerCount: viewers.length,
        collaboratorCount: collaborators.length,
        viewers,
        collaborators,
        requesterSenderId: requester || undefined,
        requesterRole: requesterIsCollaborator ? "collaborator" : requesterIsViewer ? "viewer" : requester ? "none" : "unknown",
        likelyAnonymousLinkFailure,
        findings,
        recommendations,
    };
}

function summarizeDocAuthDiagnosis(diagnosis: any = {}) {
    const parts = Array.isArray(diagnosis.findings) ? diagnosis.findings : [];
    return parts.length > 0 ? `文档权限诊断：${parts.join("，")}` : "文档权限诊断已完成";
}

function buildDocIdUsageHint(docId?: string) {
    const normalizedDocId = readString(docId);
    if (!normalizedDocId) return "";
    return `后续权限、分享和诊断操作请使用真实 docId：${normalizedDocId}；不要直接使用分享链接路径中的片段。`;
}

function safeParseJson(text: string) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function extractEmbeddedJson(html: string, variableName: string) {
    const source = String(html ?? "");
    if (!source) return null;
    const marker = `window.${variableName}=`;
    const start = source.indexOf(marker);
    if (start < 0) return null;
    const valueStart = start + marker.length;
    const end = source.indexOf(";</script>", valueStart);
    if (end < 0) return null;
    return safeParseJson(source.slice(valueStart, end));
}

function buildShareLinkDiagnosis(params: { shareUrl: string; finalUrl: string; status: number; contentType: string; basicClientVars: any }) {
    const { shareUrl, finalUrl, status, contentType, basicClientVars } = params;
    const parsedUrl = new URL(finalUrl || shareUrl);
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    const pathResourceType = readString(pathSegments[0]);
    const pathResourceId = readString(pathSegments[1]);
    const shareCode = readString(parsedUrl.searchParams.get("scode"));
    const userInfo = basicClientVars?.userInfo && typeof basicClientVars.userInfo === "object"
        ? basicClientVars.userInfo
        : {};
    const docInfo = basicClientVars?.docInfo && typeof basicClientVars.docInfo === "object"
        ? basicClientVars.docInfo
        : {};
    const padInfo = docInfo?.padInfo && typeof docInfo.padInfo === "object"
        ? docInfo.padInfo
        : {};
    const ownerInfo = docInfo?.ownerInfo && typeof docInfo.ownerInfo === "object"
        ? docInfo.ownerInfo
        : {};
    const shareInfo = docInfo?.shareInfo && typeof docInfo.shareInfo === "object"
        ? docInfo.shareInfo
        : {};
    const aclInfo = docInfo?.aclInfo && typeof docInfo.aclInfo === "object"
        ? docInfo.aclInfo
        : {};
    const userType = readString(userInfo.userType);
    const padType = readString(padInfo.padType);
    const padId = readString(padInfo.padId);
    const padTitle = readString(padInfo.padTitle);
    const isGuest = userType === "guest" || Number(userInfo.loginType) === 0;
    const isBlankPage = padType === "blankpage";
    const likelyUnavailableToGuest = isGuest && isBlankPage && !padTitle;
    const findings = [
        `HTTP ${String(status || "")}`.trim(),
        `内容类型：${readString(contentType) || "未知"}`,
        `访问身份：${userType || "未知"}`,
        `页面类型：${padType || "未知"}`,
        `路径资源：${pathResourceType || "未知"} / ${pathResourceId || "未知"}`,
    ];
    const recommendations: string[] = [];
    if (likelyUnavailableToGuest) {
        recommendations.push("当前链接对 guest/未登录企业微信环境返回 blankpage，外部访问会表现为打不开或像“文档不存在”。");
    }
    if (shareCode) {
        recommendations.push(`当前链接带有分享码 scode=${shareCode}。如分享码过期或未生效，外部访问会失败。`);
    }
    if (pathResourceId && padId && pathResourceId !== padId) {
        recommendations.push(`链接路径中的资源标识与页面 padId 不一致：path=${pathResourceId}，padId=${padId}。`);
    }
    if (pathResourceId && padId && pathResourceId === padId) {
        recommendations.push("链接路径资源标识与页面 padId 一致，但这仍不等同于 Wedoc API 可用的真实 docId。");
    }
    return {
        shareUrl,
        finalUrl,
        httpStatus: status,
        contentType: readString(contentType) || undefined,
        pathResourceType: pathResourceType || undefined,
        pathResourceId: pathResourceId || undefined,
        shareCode: shareCode || undefined,
        userType: userType || undefined,
        isGuest,
        padId: padId || undefined,
        padType: padType || undefined,
        padTitle: padTitle || undefined,
        ownerId: readString(ownerInfo.ownerId) || undefined,
        hasShareInfo: Object.keys(shareInfo).length > 0,
        hasAclInfo: Object.keys(aclInfo).length > 0,
        likelyUnavailableToGuest,
        findings,
        recommendations,
    };
}

async function inspectWecomShareLink(params: { shareUrl: string }) {
    const { shareUrl } = params;
    const normalizedUrl = readString(shareUrl);
    if (!normalizedUrl) throw new Error("shareUrl required");
    let parsed;
    try {
        parsed = new URL(normalizedUrl);
    } catch {
        throw new Error("shareUrl must be a valid URL");
    }
    // To protect URLs containing underscores from markdown italic corruption in output, we ensure we return exactly what we got or wrap it later.

    const response = await fetch(parsed.toString(), {
        headers: {
            "user-agent": "OpenClaw-Wechat/1.0",
            accept: "text/html,application/xhtml+xml",
        },
    });
    const contentType = response.headers?.get("content-type") || "";
    const html = await response.text();
    const basicClientVars = extractEmbeddedJson(html, "basicClientVars");
    const diagnosis = buildShareLinkDiagnosis({
        shareUrl: normalizedUrl,
        finalUrl: response.url || parsed.toString(),
        status: response.status,
        contentType,
        basicClientVars,
    });
    return {
        raw: {
            httpStatus: response.status,
            // Markdown italic protection for URLs
            finalUrl: `\u00A0${response.url || parsed.toString()}\u00A0`.trim(),
            contentType,
            basicClientVars,
        },
        diagnosis,
    };
}

function summarizeShareLinkDiagnosis(diagnosis: any = {}) {
    const parts = Array.isArray(diagnosis.findings) ? diagnosis.findings : [];
    return parts.length > 0 ? `分享链接校验：${parts.join("，")}` : "分享链接校验已完成";
}

function summarizeSheetProperties(result: any = {}) {
    return `表格属性已获取：工作表 ${result.properties?.length ?? 0}`;
}

function summarizeDocAccess(result: any = {}) {
    const parts = [];
    if (result.addedViewerCount) parts.push(`新增查看成员 ${result.addedViewerCount}`);
    if (result.addedCollaboratorCount) parts.push(`新增协作者 ${result.addedCollaboratorCount}`);
    if (result.removedViewerCount) parts.push(`移除查看成员 ${result.removedViewerCount}`);
    if (result.removedCollaboratorCount) parts.push(`移除协作者 ${result.removedCollaboratorCount}`);
    return parts.length > 0 ? `文档权限已更新：${parts.join("，")}` : "文档权限已更新";
}

function summarizeFormInfo(result: any = {}) {
    const title = readString(result.formInfo?.form_title) || "未命名收集表";
    return `收集表“${title}”信息已获取`;
}

function summarizeFormAnswer(result: any = {}) {
    return `收集表答案已获取：字段 ${result.answerList?.length ?? 0}`;
}

function summarizeFormStatistic(result: any = {}) {
    return `收集表统计已获取：请求 ${result.items?.length ?? 0}，成功 ${result.successCount ?? 0}`;
}

function readMemberUserId(value: any) {
    if (typeof value === "string" || typeof value === "number") {
        return readString(value);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    return readString(value.userid ?? value.userId);
}

function hasMemberUserId(values: any, requesterSenderId: string) {
    const normalizedRequesterSenderId = readString(requesterSenderId);
    if (!normalizedRequesterSenderId) return false;
    return Array.isArray(values) && values.some((item) => readMemberUserId(item) === normalizedRequesterSenderId);
}

function resolveCreateCollaborators(params: {
    toolContext: any;
    requestParams: any;
}) {
    const { toolContext, requestParams } = params;
    const explicitCollaborators = Array.isArray(requestParams?.collaborators) ? [...requestParams.collaborators] : [];
    const requesterSenderId = readString(toolContext?.senderId || toolContext?.requesterSenderId); // align with OpenClaw standard `senderId`
    if (!requesterSenderId) return explicitCollaborators;
    // By default, let's always auto-grant requester
    if (hasMemberUserId(explicitCollaborators, requesterSenderId)) return explicitCollaborators;
    if (hasMemberUserId(requestParams?.viewers, requesterSenderId)) return explicitCollaborators;
    explicitCollaborators.push(requesterSenderId);
    return explicitCollaborators;
}

function buildToolResult(payload: any) {
    // To avoid formatting issues with URLs having underscores rendering as markdown Italics
    if (payload.url) payload.url = `<${payload.url}>`;
    if (payload.diagnosis?.finalUrl) payload.diagnosis.finalUrl = `<${payload.diagnosis.finalUrl}>`;
    if (payload.diagnosis?.shareUrl) payload.diagnosis.shareUrl = `<${payload.diagnosis.shareUrl}>`;
    return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        details: payload,
    };
}

export function registerWecomDocTools(api: OpenClawPluginApi) {
    if (typeof api?.registerTool !== "function") return;
    const docClient = new WecomDocClient();

    api.registerTool((toolContext: any) => ({
        name: "wecom_doc",
        label: "WeCom Doc",
        description: "企业微信文档工具。支持文档/表格/收集表完整CRUD操作、查看/协作者权限配置、属性查询以及分享打不开可用性诊断功能。",
        parameters: wecomDocToolSchema,
        async execute(_toolCallId, params: any) {
            try {
                let accountId = params.accountId || toolContext?.accountId || "default";
                const account = resolveAgentAccountOrUndefined(api.config, accountId);
                if (!account || !account.configured) {
                    throw new Error(`WeCom account ${accountId} not configured for Doc API requirements`);
                }

                const action = params.action;
                switch (action) {
                    case "create": {
                        const collaborators = resolveCreateCollaborators({ toolContext, requestParams: params });
                        const result = await docClient.createDoc({
                            agent: account,
                            docName: params.docName,
                            docType: params.docType,
                            spaceId: params.spaceId,
                            fatherId: params.fatherId,
                            adminUsers: params.adminUsers,
                        });
                        let accessResult: any = null;
                        if ((Array.isArray(params.viewers) && params.viewers.length > 0) || collaborators.length > 0) {
                            try {
                                accessResult = await docClient.grantDocAccess({
                                    agent: account,
                                    docId: result.docId,
                                    viewers: params.viewers,
                                    collaborators,
                                });
                            } catch (err) {
                                return buildToolResult({
                                    ok: false,
                                    partial: true,
                                    action: "create",
                                    accountId: account.accountId,
                                    resourceType: result.docTypeLabel,
                                    canonicalDocId: result.docId,
                                    docId: result.docId,
                                    title: readString(params.docName),
                                    url: result.url || undefined,
                                    summary: `已创建${mapDocTypeLabel(result.docType)}“${readString(params.docName)}”（docId: ${result.docId}），但权限授予失败`,
                                    usageHint: buildDocIdUsageHint(result.docId) || undefined,
                                    error: err instanceof Error ? err.message : String(err),
                                    raw: { create: result.raw },
                                });
                            }
                        }
                        return buildToolResult({
                            ok: true,
                            action: "create",
                            accountId: account.accountId,
                            resourceType: result.docTypeLabel,
                            canonicalDocId: result.docId,
                            docId: result.docId,
                            title: readString(params.docName),
                            url: result.url || undefined,
                            summary: accessResult
                                ? `已创建${mapDocTypeLabel(result.docType)}“${readString(params.docName)}”（docId: ${result.docId}）；${summarizeDocAccess(accessResult)}`
                                : `已创建${mapDocTypeLabel(result.docType)}“${readString(params.docName)}”（docId: ${result.docId}）`,
                            usageHint: buildDocIdUsageHint(result.docId) || undefined,
                            raw: accessResult ? { create: result.raw, access: accessResult.raw } : result.raw,
                        });
                    }
                    case "rename": {
                        const result = await docClient.renameDoc({
                            agent: account,
                            docId: params.docId,
                            newName: params.newName,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "rename",
                            accountId: account.accountId,
                            docId: result.docId,
                            title: result.newName,
                            summary: `文档已重命名为“${result.newName}”`,
                            raw: result.raw,
                        });
                    }
                    case "get_info": {
                        const result = await docClient.getDocBaseInfo({
                            agent: account,
                            docId: params.docId,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "get_info",
                            accountId: account.accountId,
                            docId: params.docId,
                            title: readString(result.info?.doc_name) || undefined,
                            resourceType:
                                Number(result.info?.doc_type) === 5 ? "smart_table" : Number(result.info?.doc_type) === 4 ? "spreadsheet" : "doc",
                            summary: summarizeDocInfo(result.info),
                            raw: result.raw,
                        });
                    }
                    case "share": {
                        const result = await docClient.shareDoc({
                            agent: account,
                            docId: params.docId,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "share",
                            accountId: account.accountId,
                            canonicalDocId: params.docId,
                            docId: params.docId,
                            url: result.shareUrl || undefined,
                            summary: result.shareUrl ? `文档分享链接已获取（docId: ${params.docId}）` : `文档分享接口调用成功（docId: ${params.docId}）`,
                            usageHint: buildDocIdUsageHint(params.docId) || undefined,
                            raw: result.raw,
                        });
                    }
                    case "get_auth": {
                        const result = await docClient.getDocAuth({
                            agent: account,
                            docId: params.docId,
                        });
                        const diagnosis = buildDocAuthDiagnosis(result, toolContext?.senderId);
                        return buildToolResult({
                            ok: true,
                            action: "get_auth",
                            accountId: account.accountId,
                            canonicalDocId: params.docId,
                            docId: params.docId,
                            summary: summarizeDocAuth(result),
                            diagnosis,
                            raw: result.raw,
                        });
                    }
                    case "diagnose_auth": {
                        const result = await docClient.getDocAuth({
                            agent: account,
                            docId: params.docId,
                        });
                        const diagnosis = buildDocAuthDiagnosis(result, toolContext?.senderId);
                        return buildToolResult({
                            ok: true,
                            action: "diagnose_auth",
                            accountId: account.accountId,
                            canonicalDocId: params.docId,
                            docId: params.docId,
                            summary: summarizeDocAuthDiagnosis(diagnosis),
                            diagnosis,
                            raw: result.raw,
                        });
                    }
                    case "validate_share_link": {
                        const result = await inspectWecomShareLink({
                            shareUrl: params.shareUrl,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "validate_share_link",
                            accountId: account.accountId,
                            url: result.diagnosis.finalUrl || params.shareUrl,
                            summary: summarizeShareLinkDiagnosis(result.diagnosis),
                            diagnosis: result.diagnosis,
                            raw: result.raw,
                        });
                    }
                    case "delete": {
                        const result = await docClient.deleteDoc({
                            agent: account,
                            docId: params.docId,
                            formId: params.formId,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "delete",
                            accountId: account.accountId,
                            docId: result.docId || undefined,
                            formId: result.formId || undefined,
                            summary: result.formId ? "收集表已删除" : "文档已删除",
                            raw: result.raw,
                        });
                    }
                    case "set_join_rule": {
                        const result = await docClient.setDocJoinRule({
                            agent: account,
                            docId: params.docId,
                            request: params.request,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "set_join_rule",
                            accountId: account.accountId,
                            docId: result.docId,
                            summary: "文档查看规则已更新",
                            raw: result.raw,
                        });
                    }
                    case "set_member_auth": {
                        const result = await docClient.setDocMemberAuth({
                            agent: account,
                            docId: params.docId,
                            request: params.request,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "set_member_auth",
                            accountId: account.accountId,
                            docId: result.docId,
                            summary: "文档通知范围及成员权限已更新",
                            raw: result.raw,
                        });
                    }
                    case "grant_access": {
                        const result = await docClient.grantDocAccess({
                            agent: account,
                            docId: params.docId,
                            viewers: params.viewers,
                            collaborators: params.collaborators,
                            removeViewers: params.removeViewers,
                            removeCollaborators: params.removeCollaborators,
                            authLevel: params.auth,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "grant_access",
                            accountId: account.accountId,
                            docId: result.docId,
                            summary: summarizeDocAccess(result),
                            raw: result.raw,
                        });
                    }
                    case "add_collaborators": {
                        const result = await docClient.addDocCollaborators({
                            agent: account,
                            docId: params.docId,
                            collaborators: params.collaborators,
                            auth: params.auth,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "add_collaborators",
                            accountId: account.accountId,
                            docId: result.docId,
                            summary: `协作者已添加：${result.addedCollaboratorCount ?? 0}`,
                            raw: result.raw,
                        });
                    }
                    case "get_content": {
                        const result = await docClient.getDocContent({
                            agent: account,
                            docId: params.docId,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "get_content",
                            accountId: account.accountId,
                            docId: params.docId,
                            summary: "文档内容已获取",
                            raw: result.raw,
                        });
                    }
                    case "update_content": {
                        const result = await docClient.updateDocContent({
                            agent: account,
                            docId: params.docId,
                            requests: params.requests,
                            version: params.version,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "update_content",
                            accountId: account.accountId,
                            docId: params.docId,
                            summary: "文档内容已更新",
                            raw: result.raw,
                        });
                    }
                    case "set_safety_setting": {
                        const result = await docClient.setDocSafetySetting({
                            agent: account,
                            docId: params.docId,
                            request: params.request,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "set_safety_setting",
                            accountId: account.accountId,
                            docId: result.docId,
                            summary: "文档安全设置已更新",
                            raw: result.raw,
                        });
                    }
                    case "create_collect": {
                        const result = await docClient.createCollect({
                            agent: account,
                            formInfo: params.formInfo,
                            spaceId: params.spaceId,
                            fatherId: params.fatherId,
                        });
                        const title = readString(result.title);
                        return buildToolResult({
                            ok: true,
                            action: "create_collect",
                            accountId: account.accountId,
                            formId: result.formId,
                            title: title || undefined,
                            summary: title ? `已创建收集表“${title}”` : "收集表已创建",
                            raw: result.raw,
                        });
                    }
                    case "modify_collect": {
                        const result = await docClient.modifyCollect({
                            agent: account,
                            oper: params.oper,
                            formId: params.formId,
                            formInfo: params.formInfo,
                        });
                        const title = readString(result.title);
                        return buildToolResult({
                            ok: true,
                            action: "modify_collect",
                            accountId: account.accountId,
                            formId: result.formId,
                            title: title || undefined,
                            summary: title
                                ? `收集表已更新（${result.oper}）：“${title}”`
                                : `收集表已更新（${result.oper}）`,
                            raw: result.raw,
                        });
                    }
                    case "get_form_info": {
                        const result = await docClient.getFormInfo({
                            agent: account,
                            formId: params.formId,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "get_form_info",
                            accountId: account.accountId,
                            formId: params.formId,
                            title: readString(result.formInfo?.form_title) || undefined,
                            summary: summarizeFormInfo(result),
                            raw: result.raw,
                        });
                    }
                    case "get_form_answer": {
                        const result = await docClient.getFormAnswer({
                            agent: account,
                            repeatedId: params.repeatedId,
                            answerIds: params.answerIds,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "get_form_answer",
                            accountId: account.accountId,
                            repeatedId: params.repeatedId,
                            summary: summarizeFormAnswer(result),
                            raw: result.raw,
                        });
                    }
                    case "get_form_statistic": {
                        const result = await docClient.getFormStatistic({
                            agent: account,
                            requests: params.requests,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "get_form_statistic",
                            accountId: account.accountId,
                            summary: summarizeFormStatistic(result),
                            raw: result.raw,
                        });
                    }
                    case "get_sheet_properties": {
                        const result = await docClient.getSheetProperties({
                            agent: account,
                            docId: params.docId,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "get_sheet_properties",
                            accountId: account.accountId,
                            docId: params.docId,
                            summary: summarizeSheetProperties(result),
                            raw: result.raw,
                        });
                    }
                    case "edit_sheet_data": {
                        const result = await docClient.editSheetData({
                            agent: account,
                            docId: params.docId,
                            request: params.request,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "edit_sheet_data",
                            accountId: account.accountId,
                            docId: result.docId,
                            summary: "在线表格数据已编辑",
                            raw: result.raw,
                        });
                    }
                    case "get_sheet_data": {
                        const result = await docClient.getSheetData({
                            agent: account,
                            docId: params.docId,
                            sheetId: params.sheetId,
                            range: params.range,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "get_sheet_data",
                            accountId: account.accountId,
                            docId: params.docId,
                            summary: "在线表格数据已读取",
                            data: result.data,
                            raw: result.raw,
                        });
                    }
                    case "modify_sheet_properties": {
                        const result = await docClient.modifySheetProperties({
                            agent: account,
                            docId: params.docId,
                            requests: params.requests,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "modify_sheet_properties",
                            accountId: account.accountId,
                            docId: result.docId,
                            summary: "在线表格属性已修改",
                            raw: result.raw,
                        });
                    }
                    case "smart_table_operate": {
                        const result = await docClient.smartTableOperate({
                            agent: account,
                            docId: params.docId,
                            operation: params.operation,
                            bodyData: params.bodyData,
                        });
                        return buildToolResult({
                            ok: true,
                            action: "smart_table_operate",
                            accountId: account.accountId,
                            docId: result.docId,
                            summary: `智能表格操作（${params.operation}）已执行`,
                            raw: result.raw,
                        });
                    }
                    default:
                        throw new Error(`Unsupported action: ${String(action)}`);
                }
            } catch (err) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify({ ok: false, action: params?.action, error: err instanceof Error ? err.message : String(err) }, null, 2),
                        },
                    ],
                    details: {},
                    isError: true,
                };
            }
        },
    }));
}
