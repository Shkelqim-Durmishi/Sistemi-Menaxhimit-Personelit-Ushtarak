// src/lib/api.ts

import axios from 'axios';

/* =========================
   Axios instance (me token)
   ========================= */

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000/api';

// Origin pa "/api" (për /uploads/...)
function getApiOrigin() {
    return String(API_BASE).replace(/\/api\/?$/, '');
}

// nëse photoUrl vjen si "/uploads/people/xxx.jpg" e kthen absolute
export function toPublicUrl(maybePath?: string | null) {
    if (!maybePath) return null;

    if (/^https?:\/\//i.test(maybePath)) return maybePath;

    if (maybePath.startsWith('/uploads/')) return `${getApiOrigin()}${maybePath}`;
    if (maybePath.startsWith('uploads/')) return `${getApiOrigin()}/${maybePath}`;

    return maybePath;
}

function normalizePerson<T extends { photoUrl?: string | null }>(p: T): T {
    return { ...p, photoUrl: toPublicUrl(p.photoUrl) } as T;
}

export const api = axios.create({
    baseURL: API_BASE,
    withCredentials: true,
});

/* ====== Optional: auto logout on 401 ====== */
api.interceptors.response.use(
    (res) => res,
    (err) => {
        const status = err?.response?.status;
        if (status === 401) {
            try {
                localStorage.removeItem('token');
                localStorage.removeItem('currentUser');
            } catch { }

            try {
                delete api.defaults.headers.common['Authorization'];
            } catch { }
        }
        return Promise.reject(err);
    }
);

/* ====== Types ====== */

export type UserRole = 'ADMIN' | 'OFFICER' | 'OPERATOR' | 'COMMANDER' | 'AUDITOR';

export interface UnitBrief {
    id: string;
    code?: string;
    name?: string;
}

export interface CurrentUser {
    id: string;
    username: string;
    role: UserRole;
    unitId: string | null;
    unit?: UnitBrief | null;
    mustChangePassword?: boolean;
}

export interface AdminUser {
    id: string;
    username: string;
    role: UserRole;

    unit?: { id: string; code: string; name: string } | null;
    lastLogin?: string | null;
    createdAt?: string;

    isBlocked?: boolean;
    blockReason?: string | null;
    failedLoginCount?: number;
    lastFailedLoginAt?: string | null;

    contractValidFrom?: string | null;
    contractValidTo?: string | null;
    neverExpires?: boolean;

    mustChangePassword?: boolean;
}

export interface UnitItem {
    id: string;
    code: string;
    name: string;
}

/* ====== Auth helpers ====== */

export function setAuthToken(token: string | null) {
    if (token) {
        localStorage.setItem('token', token);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
    }
}

const bootToken = localStorage.getItem('token');
if (bootToken) api.defaults.headers.common['Authorization'] = `Bearer ${bootToken}`;

export function setCurrentUser(user: CurrentUser | null) {
    if (user) localStorage.setItem('currentUser', JSON.stringify(user));
    else localStorage.removeItem('currentUser');
}

export function getCurrentUser(): CurrentUser | null {
    const raw = localStorage.getItem('currentUser');
    try {
        return raw ? (JSON.parse(raw) as CurrentUser) : null;
    } catch {
        return null;
    }
}

export function getRole(): UserRole | null {
    return getCurrentUser()?.role ?? null;
}

export function getCurrentUnitId(): string | null {
    return getCurrentUser()?.unitId ?? null;
}

/* ===== Auth API ===== */

export async function login(username: string, password: string) {
    const { data } = await api.post('/auth/login', { username, password });
    setAuthToken(data.token);
    setCurrentUser(data.user);
    return data.user as CurrentUser;
}

export async function logout() {
    try {
        await api.post('/auth/logout');
    } catch { }
    setAuthToken(null);
    setCurrentUser(null);
}

export async function changePassword(currentPassword: string, newPassword: string) {
    const { data } = await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
    });
    return data as { ok: true };
}

export async function changePasswordFirstLogin(username: string, oldPassword: string, newPassword: string) {
    const { data } = await api.post('/auth/change-password-first', {
        username,
        oldPassword,
        newPassword,
    });
    return data as { ok: boolean };
}

/* ===== Meta ===== */

export async function getSummary() {
    const { data } = await api.get('/meta/summary');
    return data as {
        totalPeople: number;
        reportsPending: number;
        reportsToday: number;
        rowsToday: number;
        date: string;
        unitId?: string | null;
    };
}

export type ReportStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type PersonStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'REJECTED';

export type MetaCharts = {
    range: { start: string; end: string };
    unitId: string | null;

    reportTrend: Array<{
        date: string;
        reports: number;
        pending: number;
        approved: number;
        rejected: number;
        draft: number;
    }>;

    justificationTrend: Array<{
        date: string;
        rows: number;
        emergency: number;
    }>;

    topCategories: Array<{
        id: string;
        count: number;
        emergency: number;
        code?: string;
        label?: string;
    }>;

    topLocations: Array<{
        location: string;
        count: number;
    }>;

    peopleByStatus: Array<{
        status: PersonStatus;
        count: number;
    }>;

    reportsByStatus: Array<{
        status: ReportStatus;
        count: number;
    }>;
};

export async function getCharts() {
    const { data } = await api.get('/meta/charts');
    return data as MetaCharts;
}

/* ===== People ===== */

export interface PersonListItem {
    _id: string;

    serviceNo: string;
    firstName: string;
    lastName: string;

    gradeId?: string;
    unitId?: string;

    status?: PersonStatus;

    personalNumber?: string | null;
    birthDate?: string | null;
    gender?: 'M' | 'F' | 'O' | null;

    city?: string | null;
    address?: string | null;
    phone?: string | null;
    position?: string | null;
    serviceStartDate?: string | null;
    notes?: string | null;

    photoUrl?: string | null;
}

export interface PersonDetail extends PersonListItem { }

export interface CreatePersonPayload {
    serviceNo: string;
    firstName: string;
    lastName: string;

    gradeId: string;
    unitId: string;

    personalNumber?: string | null;
    birthDate?: string | null;
    gender?: 'M' | 'F' | 'O' | null;
    city?: string | null;
    address?: string | null;
    phone?: string | null;
    position?: string | null;
    serviceStartDate?: string | null;
    notes?: string | null;

    photoUrl?: string | null;
    status?: PersonStatus;
}

/* ===== Categories ===== */

export async function getCategories() {
    const { data } = await api.get('/categories');
    return data as Array<{ _id: string; code: string; label: string }>;
}

/* ===== People API ===== */

export async function searchPeople(q: string, page = 1, limit = 10) {
    const { data } = await api.get('/people', { params: { q, page, limit } });

    return {
        ...data,
        items: (data.items ?? []).map((p: PersonListItem) => normalizePerson(p)),
    } as {
        items: PersonListItem[];
        page: number;
        pages: number;
        total: number;
        limit?: number;
    };
}

export async function createPerson(payload: CreatePersonPayload) {
    const { data } = await api.post('/people', payload);
    return normalizePerson(data as PersonDetail);
}

export async function getPerson(id: string) {
    const { data } = await api.get(`/people/${id}`);
    return normalizePerson(data as PersonDetail);
}

export async function listPendingPeople(page = 1, limit = 20) {
    const { data } = await api.get('/people', { params: { status: 'PENDING', page, limit } });

    return {
        ...data,
        items: (data.items ?? []).map((p: PersonListItem) => normalizePerson(p)),
    } as {
        items: PersonListItem[];
        page: number;
        pages: number;
        total: number;
        limit?: number;
    };
}

export async function approvePerson(id: string) {
    const { data } = await api.post(`/people/${id}/approve`, {});
    return normalizePerson(data as PersonDetail);
}

export async function rejectPerson(id: string, reason?: string) {
    const { data } = await api.post(`/people/${id}/reject`, { reason });
    return normalizePerson(data as PersonDetail);
}

/* ===== Reports ===== */

export async function createReport(payload: { date: string; unitId: string }) {
    const { data } = await api.post('/reports', payload);
    return data as any;
}

export async function getReport(id: string) {
    const { data } = await api.get(`/reports/${id}`);
    return data as any;
}

export async function findReportBy(date: string, unit: string) {
    const { data } = await api.get('/reports', { params: { date, unit } });
    return (data?.[0] ?? null) as any;
}

export async function addRow(
    reportId: string,
    payload: {
        personId: string;
        categoryId: string;
        from?: string;
        to?: string;
        location?: string;
        notes?: string;
        emergency?: boolean;
    }
) {
    const { data } = await api.post(`/reports/${reportId}/rows`, payload);
    return data as any;
}

export async function updateRow(
    rowId: string,
    payload: {
        categoryId?: string;
        from?: string;
        to?: string;
        location?: string;
        notes?: string;
        emergency?: boolean;
    }
) {
    const { data } = await api.put(`/reports/rows/${rowId}`, payload);
    return data as any;
}

export async function deleteRow(rowId: string) {
    const { data } = await api.delete(`/reports/rows/${rowId}`);
    return data as { ok: true };
}

export async function submitReport(id: string) {
    const { data } = await api.post(`/reports/${id}/submit`, {});
    return data as any;
}

export async function approveReport(id: string, comment = '') {
    const { data } = await api.post(`/reports/${id}/approve`, { comment });
    return data as any;
}

export async function rejectReport(id: string, comment = '') {
    const { data } = await api.post(`/reports/${id}/reject`, { comment });
    return data as any;
}

export async function listReports(params?: { date?: string; unit?: string; personId?: string }) {
    const { data } = await api.get('/reports', { params });
    return data as any[];
}

/* ===== People helpers ===== */

export async function getUpcomingLeave(personId: string) {
    const { data } = await api.get(`/people/${personId}/upcoming-leave`);
    return data as
        | null
        | {
            from: string;
            to: string;
            category: { _id: string; code: string; label: string };
            report: { _id: string; status: string; date: string; unitId: string };
        };
}

/* ===== Export helpers ===== */

export function exportUrl(id: string, kind: 'pdf' | 'xlsx') {
    const base = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000/api';
    const token = localStorage.getItem('token');
    const q = token ? `?auth=${encodeURIComponent(token)}` : '';
    return `${base}/reports/${id}/export/${kind}${q}`;
}

/* ===== User Management (ADMIN) ===== */

export async function listUsers() {
    const { data } = await api.get('/users');
    return data as AdminUser[];
}

export async function listUnits() {
    const { data } = await api.get('/units');
    return data as UnitItem[];
}

export async function adminCreateUser(payload: {
    username: string;
    password: string;
    role: UserRole;
    unitId?: string | null;

    contractValidFrom?: string | null;
    contractValidTo?: string | null;
    neverExpires?: boolean;

    mustChangePassword?: boolean;
}) {
    const { data } = await api.post('/auth/register', payload);
    return data as {
        id: string;
        username: string;
        role: UserRole;
        unitId: string | null;
    };
}

export async function adminUpdateUser(
    id: string,
    payload: {
        role?: UserRole;
        unitId?: string | null;
        password?: string;

        contractValidFrom?: string | null;
        contractValidTo?: string | null;
        neverExpires?: boolean;

        mustChangePassword?: boolean;
    }
) {
    const { data } = await api.put(`/users/${id}`, payload);
    return data as AdminUser;
}

export async function adminDeleteUser(id: string) {
    await api.delete(`/users/${id}`);
}

export async function adminBlockUser(id: string, reason?: string) {
    const { data } = await api.put(`/users/${id}/block`, { reason });
    return data as AdminUser;
}

export async function adminUnblockUser(id: string) {
    const { data } = await api.put(`/users/${id}/unblock`, {});
    return data as AdminUser;
}

/* ===== Login Audit ===== */

export interface LoginAuditItem {
    id: string;
    username: string;
    role: UserRole;
    unit: { id: string; code: string; name: string } | null;
    type: 'LOGIN' | 'LOGOUT' | 'INVALID_PASSWORD' | 'AUTO_BLOCK';
    ip: string;
    userAgent: string;
    at: string;
}

export interface LoginAuditPage {
    items: LoginAuditItem[];
    page: number;
    pages: number;
    total: number;
    limit: number;
}

export async function listLoginAudit(params?: {
    page?: number;
    limit?: number;
    username?: string;
    type?: 'LOGIN' | 'LOGOUT' | 'INVALID_PASSWORD' | 'AUTO_BLOCK';
    from?: string;
    to?: string;
}) {
    const { page = 1, limit = 50, username, type, from, to } = params ?? {};
    const { data } = await api.get('/login-audit', { params: { page, limit, username, type, from, to } });
    return data as LoginAuditPage;
}

/* =========================
   REQUESTS (Kërkesat)
   ========================= */

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'ARCHIVE';

export type RequestAction =
    | 'DELETE_PERSON'
    | 'TRANSFER_PERSON'
    | 'CHANGE_GRADE'
    | 'CHANGE_UNIT'
    | 'DEACTIVATE_PERSON'
    | 'UPDATE_PERSON'
    | 'CREATE_USER'
    | 'CREATE_UNIT';

export interface CreateUserRequestPayload {
    reason?: string;
    user: {
        username: string;
        email: string;
        role: UserRole | string;
        unitId?: string | null;
        contractValidFrom?: string | null;
        contractValidTo?: string | null;
        neverExpires?: boolean;
        mustChangePassword?: boolean;
    };
}

export interface CreateUnitRequestPayload {
    reason?: string;
    unit: {
        code: string;
        name: string;
        parentId?: string | null;
        parentCode?: string;
        parentName?: string;
    };
}

export interface RequestItem {
    id?: string;
    _id?: string;

    personId: any;
    targetUnitId?: any;
    targetRole?: string | null;

    type: RequestAction;
    payload?: any;

    status: Exclude<RequestStatus, 'ARCHIVE'>;

    createdBy?: any;
    decidedBy?: any;

    createdAt: string;
    decidedAt?: string | null;
    decisionNote?: string | null;
}

export interface RequestPage {
    items: RequestItem[];
    page: number;
    pages: number;
    total: number;
    limit: number;
}

export async function createRequest(input: { personId: string; type: RequestAction; payload?: any }) {
    const { data } = await api.post('/requests', input);
    return data as RequestItem;
}

export async function createUnitRequest(payload: CreateUnitRequestPayload) {
    const { data } = await api.post('/requests', {
        personId: '',
        type: 'CREATE_UNIT',
        payload,
    });
    return data as RequestItem;
}

export async function createUserRequest(payload: CreateUserRequestPayload) {
    const { data } = await api.post('/requests', {
        personId: '',
        type: 'CREATE_USER',
        payload,
    });
    return data as RequestItem;
}

export async function listMyRequests(params?: { page?: number; limit?: number; status?: RequestStatus }) {
    const { page = 1, limit = 50, status } = params ?? {};
    const { data } = await api.get('/requests/my', { params: { page, limit, status } });
    return data as RequestPage;
}

export async function listIncomingRequests(params?: {
    page?: number;
    limit?: number;
    status?: RequestStatus;
    type?: RequestAction;
}) {
    const { page = 1, limit = 50, status, type } = params ?? {};
    const { data } = await api.get('/requests/incoming', { params: { page, limit, status, type } });
    return data as RequestPage;
}

export async function getRequest(id: string) {
    const { data } = await api.get(`/requests/${id}`);
    return data as RequestItem;
}

export async function approveRequest(id: string, note = '') {
    const { data } = await api.post(`/requests/${id}/approve`, { note });
    return data as RequestItem;
}

export async function rejectRequest(id: string, note = '') {
    const { data } = await api.post(`/requests/${id}/reject`, { note });
    return data as RequestItem;
}

export async function cancelRequest(id: string, note = '') {
    const { data } = await api.post(`/requests/${id}/cancel`, { note });
    return data as RequestItem;
}

/* =========================
   REQUESTS PDF
   ========================= */

export function requestPdfUrl(id: string, opts?: { download?: boolean }) {
    const base = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000/api';
    const token = localStorage.getItem('token');

    const params = new URLSearchParams();
    if (token) params.set('auth', token);
    if (opts?.download) params.set('download', '1');

    const qs = params.toString();
    return `${base}/requests/${id}/pdf${qs ? `?${qs}` : ''}`;
}

export async function downloadRequestPdf(id: string) {
    const res = await api.get(`/requests/${id}/pdf`, { responseType: 'blob' });
    return res.data as Blob;
}

/* =========================
   Vehicles
   ========================= */

export interface VehicleItem {
    id: string;
    name: string;
    plateNumber: string;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
    unit: { id: string; code: string; name: string } | null;
    deviceId?: string | null;
}

export interface VehicleLiveItem {
    id: string;
    vehicle: { id: string; name: string; plateNumber: string; status: string } | null;
    unitId: string;
    lat: number;
    lng: number;
    speed: number;
    heading: number;
    capturedAt: string;
}

export async function listVehicles() {
    const { data } = await api.get('/vehicles');
    return data as VehicleItem[];
}

export async function listVehiclesLive() {
    const { data } = await api.get('/vehicles/live');
    return data as VehicleLiveItem[];
}

export async function adminCreateVehicle(payload: {
    name: string;
    plateNumber: string;
    unitId: string;
    status?: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
    deviceId?: string | null;
}) {
    const { data } = await api.post('/vehicles', payload);
    return data as { id: string };
}

export async function adminMockVehicleLocation(
    vehicleId: string,
    payload: { lat: number; lng: number; speed?: number; heading?: number }
) {
    const { data } = await api.post(`/vehicles/${vehicleId}/mock-location`, payload);
    return data as { ok: true };
}

/* =========================
   System Notice
   ========================= */

export type SystemNotice = {
    enabled: boolean;
    severity: 'urgent' | 'info' | 'warning';
    title: string;
    message: string;
    updatedAt?: string;
};

export async function getSystemNotice() {
    const res = await api.get('/system-notice', {
        params: { t: Date.now() },
        headers: { 'Cache-Control': 'no-store' },
    });
    return res.data as SystemNotice;
}

export async function updateSystemNotice(payload: {
    enabled: boolean;
    severity: 'urgent' | 'info' | 'warning';
    title: string;
    message: string;
}) {
    const res = await api.put('/system-notice', payload);
    return res.data as SystemNotice;
}

/* =========================
   COUNTS
   ========================= */

function extractTotal(data: any): number {
    if (data == null) return 0;

    if (Array.isArray(data)) return data.length;
    if (typeof data?.total === 'number') return Number(data.total || 0);
    if (Array.isArray(data?.items)) return data.items.length;

    return 0;
}

export async function getPeoplePendingCount(): Promise<number> {
    const { data } = await api.get('/people', {
        params: { status: 'PENDING', page: 1, limit: 1 },
    });
    return extractTotal(data);
}

export async function getRequestsCount(): Promise<number> {
    const { data } = await api.get('/requests/incoming', {
        params: { status: 'PENDING', page: 1, limit: 1 },
    });
    return extractTotal(data);
}

export async function getApprovalsCount(): Promise<number> {
    const { data } = await api.get('/reports', {
        params: { status: 'PENDING', page: 1, limit: 1 },
    });

    return extractTotal(data);
}

export async function saveMySignature(dataUrl: string) {
    const { data } = await api.put('/me/signature', { dataUrl });
    return data as { ok: true; signatureImageUrl: string; signatureSignedAt: string };
}

export async function deleteMySignature() {
    const { data } = await api.delete('/me/signature');
    return data as { ok: true };
}

export type MeProfile = {
    id: string;
    username: string;
    role: UserRole;
    unitId: string | null;
    mustChangePassword?: boolean;

    signatureImageUrl?: string | null;
    signatureSignedAt?: string | null;
};

export async function getMe() {
    const { data } = await api.get('/me', { params: { t: Date.now() } });
    return data as MeProfile;
}