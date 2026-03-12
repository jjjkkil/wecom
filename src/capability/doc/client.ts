import type { ResolvedAgentAccount } from "../../types/index.js";
import { getAccessToken } from "../../transport/agent-api/core.js";
import { wecomFetch } from "../../http.js";
import { resolveWecomEgressProxyUrlFromNetwork } from "../../config/index.js";
import { LIMITS } from "../../types/constants.js";

function readString(value: unknown): string {
    const trimmed = String(value ?? "").trim();
    return trimmed || "";
}

function normalizeDocType(docType: unknown): 3 | 4 | 5 {
    if (docType === 3 || docType === "3") return 3;
    if (docType === 4 || docType === "4") return 4;
    if (docType === 5 || docType === "5") return 5;
    const normalized = readString(docType).toLowerCase();
    if (!normalized || normalized === "doc") return 3;
    if (normalized === "spreadsheet" || normalized === "sheet" || normalized === "table") return 4;
    if (normalized === "smart_table" || normalized === "smarttable") return 5;
    throw new Error(`Unsupported WeCom docType: ${String(docType)}`);
}

function mapDocTypeLabel(docType: 3 | 4 | 5): string {
    if (docType === 5) return "smart_table";
    if (docType === 4) return "spreadsheet";
    return "doc";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readObject(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
}

function readArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

export interface DocMemberEntry {
    userid?: string;
    partyid?: string;
    tagid?: string;
    /**
     * 权限位：1-查看，2-编辑，7-管理
     * 只有“智能表格”才支持读写权限（auth=2）？
     * 实际上企微文档现在也支持设置协作者权限了。
     */
    auth?: number;
}

function normalizeDocMemberEntry(value: unknown): DocMemberEntry | null {
    if (typeof value === "string" || typeof value === "number") {
        const userid = readString(value);
        return userid ? { userid } : null;
    }
    if (!isRecord(value)) return null;
    const entry: DocMemberEntry = { ...value } as DocMemberEntry;
    if (!readString(entry.userid) && readString(value.userId)) {
        entry.userid = readString(value.userId);
    }
    if (!readString(entry.userid) && !readString(entry.partyid) && !readString(entry.tagid)) {
        return null;
    }
    if (readString(entry.userid)) entry.userid = readString(entry.userid);
    if (readString(entry.partyid)) entry.partyid = readString(entry.partyid);
    if (readString(entry.tagid)) entry.tagid = readString(entry.tagid);
    if (entry.auth !== undefined) entry.auth = Number(entry.auth);
    return entry;
}

function normalizeDocMemberEntryList(values: unknown): DocMemberEntry[] {
    return readArray(values).map(normalizeDocMemberEntry).filter((v): v is DocMemberEntry => v !== null);
}

function buildDocMemberAuthRequest(params: {
    docId: string;
    viewers?: unknown;
    collaborators?: unknown;
    removeViewers?: unknown;
    removeCollaborators?: unknown;
    authLevel?: number; // Default auth level for new members if not specified in entry
}): Record<string, unknown> {
    const { docId, viewers, collaborators, removeViewers, removeCollaborators, authLevel } = params;
    const payload: Record<string, unknown> = {
        docid: readString(docId),
    };
    if (!payload.docid) throw new Error("docId required");

    const normalizedViewers = normalizeDocMemberEntryList(viewers).map(v => ({ ...v, auth: v.auth ?? authLevel ?? 1 }));
    const normalizedCollaborators = normalizeDocMemberEntryList(collaborators).map(v => ({ ...v, auth: v.auth ?? authLevel ?? 2 }));
    const normalizedRemovedViewers = normalizeDocMemberEntryList(removeViewers);
    const normalizedRemovedCollaborators = normalizeDocMemberEntryList(removeCollaborators);

    if (normalizedViewers.length > 0) payload.update_doc_member_list = normalizedViewers;
    if (normalizedCollaborators.length > 0) payload.update_co_auth_list = normalizedCollaborators;
    if (normalizedRemovedViewers.length > 0) payload.del_doc_member_list = normalizedRemovedViewers;
    if (normalizedRemovedCollaborators.length > 0) payload.del_co_auth_list = normalizedRemovedCollaborators;

    if (
        !payload.update_doc_member_list &&
        !payload.update_co_auth_list &&
        !payload.del_doc_member_list &&
        !payload.del_co_auth_list
    ) {
        throw new Error("at least one viewer/collaborator change is required");
    }

    return payload;
}

async function parseJsonResponse(res: Response, actionLabel: string): Promise<any> {
    let payload: any = null;
    try {
        payload = await res.json();
    } catch {
        if (!res.ok) {
            throw new Error(`WeCom ${actionLabel} failed: HTTP ${res.status}`);
        }
        throw new Error(`WeCom ${actionLabel} failed: invalid JSON response`);
    }
    if (!payload || typeof payload !== "object") {
        throw new Error(`WeCom ${actionLabel} failed: empty response`);
    }
    if (!res.ok) {
        throw new Error(`WeCom ${actionLabel} failed: HTTP ${res.status} ${JSON.stringify(payload)}`);
    }
    if (Array.isArray(payload)) {
        const failedItem = payload.find((item) => Number(item?.errcode ?? 0) !== 0);
        if (failedItem) {
            throw new Error(
                `WeCom ${actionLabel} failed: ${String(failedItem?.errmsg || "unknown error")} (errcode ${String(failedItem?.errcode)})`,
            );
        }
        return payload;
    }
    if (Number(payload.errcode ?? 0) !== 0) {
        throw new Error(
            `WeCom ${actionLabel} failed: ${String(payload.errmsg || "unknown error")} (errcode ${String(payload.errcode)})`,
        );
    }
    return payload;
}

export class WecomDocClient {
    private async postWecomDocApi(params: {
        path: string;
        actionLabel: string;
        agent: ResolvedAgentAccount;
        body: Record<string, unknown> | unknown[];
    }): Promise<any> {
        const { path, actionLabel, agent, body } = params;

        const token = await getAccessToken(agent);
        const url = `https://qyapi.weixin.qq.com${path}?access_token=${encodeURIComponent(token)}`;
        const proxyUrl = resolveWecomEgressProxyUrlFromNetwork(agent.network);

        let lastErr: any;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const res = await wecomFetch(url, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                    },
                    body: JSON.stringify(body ?? {}),
                }, { proxyUrl, timeoutMs: LIMITS.REQUEST_TIMEOUT_MS });

                return await parseJsonResponse(res, actionLabel);
            } catch (err) {
                lastErr = err;
                if (attempt < 3) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }
        throw lastErr;
    }

    async createDoc(params: { agent: ResolvedAgentAccount; docName: string; docType?: unknown; spaceId?: string; fatherId?: string; adminUsers?: string[] }) {
        const { agent, docName, docType, spaceId, fatherId, adminUsers } = params;
        const normalizedDocType = normalizeDocType(docType);
        const payload: Record<string, unknown> = {
            doc_type: normalizedDocType,
            doc_name: readString(docName),
        };
        if (!payload.doc_name) throw new Error("docName required");
        const normalizedSpaceId = readString(spaceId);
        const normalizedFatherId = readString(fatherId);
        if (normalizedSpaceId) payload.spaceid = normalizedSpaceId;
        if (normalizedFatherId) payload.fatherid = normalizedFatherId;
        const normalizedAdminUsers = Array.isArray(adminUsers)
            ? adminUsers.map((item) => readString(item)).filter(Boolean)
            : [];
        if (normalizedAdminUsers.length > 0) {
            payload.admin_users = normalizedAdminUsers;
        }
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/create_doc",
            actionLabel: "create_doc",
            agent,
            body: payload,
        });
        return {
            raw: json,
            docId: readString(json.docid),
            url: readString(json.url),
            docType: normalizedDocType,
            docTypeLabel: mapDocTypeLabel(normalizedDocType),
        };
    }

    async renameDoc(params: { agent: ResolvedAgentAccount; docId: string; newName: string }) {
        const { agent, docId, newName } = params;
        const payload = {
            docid: readString(docId),
            new_name: readString(newName),
        };
        if (!payload.docid) throw new Error("docId required");
        if (!payload.new_name) throw new Error("newName required");
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/rename_doc",
            actionLabel: "rename_doc",
            agent,
            body: payload,
        });
        return {
            raw: json,
            docId: payload.docid,
            newName: payload.new_name,
        };
    }

    async getDocBaseInfo(params: { agent: ResolvedAgentAccount; docId: string }) {
        const { agent, docId } = params;
        const normalizedDocId = readString(docId);
        if (!normalizedDocId) throw new Error("docId required");
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/get_doc_base_info",
            actionLabel: "get_doc_base_info",
            agent,
            body: { docid: normalizedDocId },
        });
        return {
            raw: json,
            info: json.doc_base_info && typeof json.doc_base_info === "object" ? json.doc_base_info : {},
        };
    }

    async shareDoc(params: { agent: ResolvedAgentAccount; docId: string }) {
        const { agent, docId } = params;
        const normalizedDocId = readString(docId);
        if (!normalizedDocId) throw new Error("docId required");
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/doc_share",
            actionLabel: "doc_share",
            agent,
            body: { docid: normalizedDocId },
        });
        return {
            raw: json,
            shareUrl: readString(json.share_url),
        };
    }

    async getDocAuth(params: { agent: ResolvedAgentAccount; docId: string }) {
        const { agent, docId } = params;
        const normalizedDocId = readString(docId);
        if (!normalizedDocId) throw new Error("docId required");
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/doc_get_auth",
            actionLabel: "doc_get_auth",
            agent,
            body: { docid: normalizedDocId },
        });
        return {
            raw: json,
            accessRule: json.access_rule && typeof json.access_rule === "object" ? json.access_rule : {},
            secureSetting: json.secure_setting && typeof json.secure_setting === "object" ? json.secure_setting : {},
            docMembers: Array.isArray(json.doc_member_list) ? json.doc_member_list : [],
            coAuthList: Array.isArray(json.co_auth_list) ? json.co_auth_list : [],
        };
    }

    async deleteDoc(params: { agent: ResolvedAgentAccount; docId?: string; formId?: string }) {
        const { agent, docId, formId } = params;
        const payload: Record<string, string> = {};
        const normalizedDocId = readString(docId);
        const normalizedFormId = readString(formId);
        if (normalizedDocId) payload.docid = normalizedDocId;
        if (normalizedFormId) payload.formid = normalizedFormId;
        if (!payload.docid && !payload.formid) {
            throw new Error("docId or formId required");
        }
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/del_doc",
            actionLabel: "del_doc",
            agent,
            body: payload,
        });
        return {
            raw: json,
            docId: payload.docid || "",
            formId: payload.formid || "",
        };
    }

    async setDocJoinRule(params: { agent: ResolvedAgentAccount; docId: string; request: any }) {
        const { agent, docId, request } = params;
        const payload = {
            ...readObject(request),
        };
        payload.docid = readString(docId || payload.docid);
        if (!payload.docid) throw new Error("docId required");
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/mod_doc_join_rule",
            actionLabel: "mod_doc_join_rule",
            agent,
            body: payload,
        });
        return {
            raw: json,
            docId: payload.docid as string,
        };
    }

    async setDocMemberAuth(params: { agent: ResolvedAgentAccount; docId: string; request: any }) {
        const { agent, docId, request } = params;
        const payload = {
            ...readObject(request),
        };
        payload.docid = readString(docId || payload.docid);
        if (!payload.docid) throw new Error("docId required");
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/mod_doc_member",
            actionLabel: "mod_doc_member",
            agent,
            body: payload,
        });
        return {
            raw: json,
            docId: payload.docid as string,
        };
    }

    async grantDocAccess(params: {
        agent: ResolvedAgentAccount;
        docId: string;
        viewers?: unknown;
        collaborators?: unknown;
        removeViewers?: unknown;
        removeCollaborators?: unknown;
        authLevel?: number;
    }) {
        const { agent, docId, viewers, collaborators, removeViewers, removeCollaborators, authLevel } = params;
        const payload = buildDocMemberAuthRequest({
            docId,
            viewers,
            collaborators,
            removeViewers,
            removeCollaborators,
            authLevel,
        });
        const result = await this.setDocMemberAuth({
            agent,
            docId: payload.docid as string,
            request: payload,
        });
        return {
            ...result,
            addedViewerCount: (payload.update_doc_member_list as any[])?.length ?? 0,
            addedCollaboratorCount: (payload.update_co_auth_list as any[])?.length ?? 0,
            removedViewerCount: (payload.del_doc_member_list as any[])?.length ?? 0,
            removedCollaboratorCount: (payload.del_co_auth_list as any[])?.length ?? 0,
        };
    }

    async addDocCollaborators(params: { agent: ResolvedAgentAccount; docId: string; collaborators: unknown; auth?: number }) {
        const { agent, docId, collaborators, auth } = params;
        return this.grantDocAccess({
            agent,
            docId,
            collaborators,
            authLevel: auth ?? 2, // Default to edit/read-write for collaborators
        });
    }

    async setDocSafetySetting(params: { agent: ResolvedAgentAccount; docId: string; request: any }) {
        const { agent, docId, request } = params;
        const payload = {
            ...readObject(request),
        };
        payload.docid = readString(docId || payload.docid);
        if (!payload.docid) throw new Error("docId required");
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/mod_doc_safty_setting",
            actionLabel: "mod_doc_safty_setting",
            agent,
            body: payload,
        });
        return {
            raw: json,
            docId: payload.docid as string,
        };
    }

    async createCollect(params: { agent: ResolvedAgentAccount; formInfo: any; spaceId?: string; fatherId?: string }) {
        const { agent, formInfo, spaceId, fatherId } = params;
        const payload: Record<string, unknown> = {
            form_info: readObject(formInfo),
        };
        if (Object.keys(payload.form_info as object).length === 0) {
            throw new Error("formInfo required");
        }
        const normalizedSpaceId = readString(spaceId);
        const normalizedFatherId = readString(fatherId);
        if (normalizedSpaceId) payload.spaceid = normalizedSpaceId;
        if (normalizedFatherId) payload.fatherid = normalizedFatherId;
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/create_collect",
            actionLabel: "create_collect",
            agent,
            body: payload,
        });
        return {
            raw: json,
            formId: readString(json.formid),
            title: readString((payload.form_info as any).form_title),
        };
    }

    async modifyCollect(params: { agent: ResolvedAgentAccount; oper: string; formId: string; formInfo: any }) {
        const { agent, oper, formId, formInfo } = params;
        const payload = {
            oper: readString(oper),
            formid: readString(formId),
            form_info: readObject(formInfo),
        };
        if (!payload.oper) throw new Error("oper required");
        if (!payload.formid) throw new Error("formId required");
        if (Object.keys(payload.form_info).length === 0) {
            throw new Error("formInfo required");
        }
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/modify_collect",
            actionLabel: "modify_collect",
            agent,
            body: payload,
        });
        return {
            raw: json,
            formId: payload.formid,
            oper: payload.oper,
            title: readString((payload.form_info as any).form_title),
        };
    }

    async getFormInfo(params: { agent: ResolvedAgentAccount; formId: string }) {
        const { agent, formId } = params;
        const normalizedFormId = readString(formId);
        if (!normalizedFormId) throw new Error("formId required");
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/get_form_info",
            actionLabel: "get_form_info",
            agent,
            body: { formid: normalizedFormId },
        });
        return {
            raw: json,
            formInfo: readObject(json.form_info),
        };
    }

    async getFormAnswer(params: { agent: ResolvedAgentAccount; repeatedId: string; answerIds?: unknown[] }) {
        const { agent, repeatedId, answerIds } = params;
        const normalizedRepeatedId = readString(repeatedId);
        if (!normalizedRepeatedId) throw new Error("repeatedId required");
        const normalizedAnswerIds = Array.isArray(answerIds)
            ? answerIds
                .map((item) => Number(item))
                .filter((item) => Number.isFinite(item))
            : [];
        const payload: Record<string, unknown> = {
            repeated_id: normalizedRepeatedId,
        };
        if (normalizedAnswerIds.length > 0) {
            payload.answer_ids = normalizedAnswerIds;
        }
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/get_form_answer",
            actionLabel: "get_form_answer",
            agent,
            body: payload,
        });
        const answer = readObject(json.answer);
        return {
            raw: json,
            answer,
            answerList: readArray((answer as any).answer_list),
        };
    }

    async getFormStatistic(params: { agent: ResolvedAgentAccount; requests: unknown[] }) {
        const { agent, requests } = params;
        const payload = Array.isArray(requests)
            ? requests.map((item) => readObject(item)).filter((item) => Object.keys(item).length > 0)
            : [];
        if (payload.length === 0) {
            throw new Error("requests required");
        }
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/get_form_statistic",
            actionLabel: "get_form_statistic",
            agent,
            body: { requests: payload },
        });
        return {
            raw: json,
            items: readArray(json),
            successCount: readArray(json).filter((item: any) => Number(item?.errcode ?? 0) === 0).length,
        };
    }

    // --- Content Operations (New) ---

    async getDocContent(params: { agent: ResolvedAgentAccount; docId: string }) {
        const { agent, docId } = params;
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/document/get",
            actionLabel: "get_doc_content",
            agent,
            body: { docid: readString(docId) },
        });
        return { raw: json, content: json };
    }

    async updateDocContent(params: { agent: ResolvedAgentAccount; docId: string; requests: unknown[]; version?: number }) {
        const { agent, docId, requests, version } = params;
        const body: Record<string, unknown> = {
            docid: readString(docId),
            requests: readArray(requests),
        };
        if (version !== undefined) body.version = version;
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/document/batch_update",
            actionLabel: "update_doc_content",
            agent,
            body,
        });
        return { raw: json };
    }

    // --- Spreadsheet Operations ---

    async getSheetProperties(params: { agent: ResolvedAgentAccount; docId: string }) {
        const { agent, docId } = params;
        const normalizedDocId = readString(docId);
        if (!normalizedDocId) throw new Error("docId required");
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/spreadsheet/get_sheet_properties",
            actionLabel: "get_sheet_properties",
            agent,
            body: { docid: normalizedDocId },
        });
        return {
            raw: json,
            properties:
                (Array.isArray(json.properties) && json.properties) ||
                (Array.isArray(json.sheet_properties) && json.sheet_properties) ||
                (Array.isArray(json.sheet_list) && json.sheet_list) ||
                [],
        };
    }

    async editSheetData(params: { agent: ResolvedAgentAccount; docId: string; request: any }) {
        const { agent, docId, request } = params;
        const body = { docid: readString(docId), ...readObject(request) };
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/spreadsheet/edit_data",
            actionLabel: "edit_data",
            agent, body,
        });
        return { raw: json, docId: body.docid as string };
    }

    async getSheetData(params: { agent: ResolvedAgentAccount; docId: string; sheetId: string; range: string }) {
        const { agent, docId, sheetId, range } = params;
        const body = { docid: readString(docId), sheet_id: readString(sheetId), range: readString(range) };
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/spreadsheet/get_sheet_range_data",
            actionLabel: "get_sheet_range_data",
            agent, body,
        });
        return { raw: json, data: json };
    }

    async modifySheetProperties(params: { agent: ResolvedAgentAccount; docId: string; requests: unknown[] }) {
        const { agent, docId, requests } = params;
        const json = await this.postWecomDocApi({
            path: "/cgi-bin/wedoc/spreadsheet/modify_sheet_properties",
            actionLabel: "modify_sheet_properties",
            agent, body: { docid: readString(docId), requests: readArray(requests) },
        });
        return { raw: json, docId: docId };
    }

    // --- Smart Table Operations ---

    async smartTableOperate(params: { agent: ResolvedAgentAccount; docId: string; operation: string; bodyData: any }) {
        const { agent, docId, operation, bodyData } = params;
        const body = { docid: readString(docId), ...readObject(bodyData) };
        const path = `/cgi-bin/wedoc/smartsheet/${operation}`;
        const json = await this.postWecomDocApi({
            path,
            actionLabel: `smartsheet_${operation}`,
            agent, body,
        });
        return { raw: json, docId };
    }
}
