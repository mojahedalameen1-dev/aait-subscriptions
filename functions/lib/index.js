"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectRequest = exports.approveRequest = exports.revealCredential = exports.storeCredential = void 0;
const node_crypto_1 = require("node:crypto");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const credentialsKey = (0, params_1.defineSecret)('CREDENTIALS_KEY');
async function requirePermission(uid, permission) {
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'يجب تسجيل الدخول');
    const user = await db.doc(`users/${uid}`).get();
    const permissions = (user.data()?.permissions ?? []);
    if (!permissions.includes(permission))
        throw new https_1.HttpsError('permission-denied', 'لا تملك الصلاحية المطلوبة');
    return user.data();
}
function keyBuffer() {
    const key = Buffer.from(credentialsKey.value(), 'base64');
    if (key.length !== 32)
        throw new https_1.HttpsError('failed-precondition', 'مفتاح التشفير غير صالح');
    return key;
}
function encrypt(value) {
    const iv = (0, node_crypto_1.randomBytes)(12);
    const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', keyBuffer(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}
function decrypt(payload) {
    const [iv, tag, encrypted] = payload.split('.').map((part) => Buffer.from(part, 'base64'));
    const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', keyBuffer(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
exports.storeCredential = (0, https_1.onCall)({ secrets: [credentialsKey], region: 'me-central1' }, async (request) => {
    const actor = await requirePermission(request.auth?.uid, 'store_credentials');
    const subscriptionId = String(request.data.subscriptionId ?? '');
    const username = String(request.data.username ?? '');
    const password = String(request.data.password ?? '');
    if (!subscriptionId || !username || !password)
        throw new https_1.HttpsError('invalid-argument', 'البيانات ناقصة');
    await db.doc(`subscriptions/${subscriptionId}`).update({ has_stored_credentials: true, encrypted_credentials: encrypt(JSON.stringify({ username, password })), updated_at: firestore_1.FieldValue.serverTimestamp() });
    await db.collection('audit_logs').add({ action: 'تخزين بيانات اعتماد', entity_id: subscriptionId, actor_uid: request.auth.uid, actor_name: actor?.name ?? '', created_at: firestore_1.FieldValue.serverTimestamp() });
    return { ok: true };
});
exports.revealCredential = (0, https_1.onCall)({ secrets: [credentialsKey], region: 'me-central1' }, async (request) => {
    const actor = await requirePermission(request.auth?.uid, 'reveal_credentials');
    const subscriptionId = String(request.data.subscriptionId ?? '');
    const subscription = await db.doc(`subscriptions/${subscriptionId}`).get();
    const encrypted = subscription.data()?.encrypted_credentials;
    if (!encrypted)
        throw new https_1.HttpsError('not-found', 'لا توجد بيانات اعتماد');
    await db.collection('audit_logs').add({ action: 'إظهار بيانات اعتماد', entity_id: subscriptionId, actor_uid: request.auth.uid, actor_name: actor?.name ?? '', created_at: firestore_1.FieldValue.serverTimestamp() });
    return JSON.parse(decrypt(String(encrypted)));
});
exports.approveRequest = (0, https_1.onCall)({ secrets: [credentialsKey], region: 'me-central1' }, async (request) => {
    const actor = await requirePermission(request.auth?.uid, 'review_requests');
    const requestId = String(request.data.requestId ?? '');
    const requestRef = db.doc(`subscription_requests/${requestId}`);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(requestRef);
        if (!snap.exists || snap.data()?.status !== 'قيد المراجعة')
            throw new https_1.HttpsError('failed-precondition', 'الطلب ليس قيد المراجعة');
        const data = snap.data();
        if (data.type === 'renewal') {
            const subscriptionRef = db.doc(`subscriptions/${data.related_subscription_id}`);
            tx.update(subscriptionRef, { renewal_date: firestore_1.Timestamp.fromDate(new Date(request.data.renewalDate)), status: 'نشط', updated_at: firestore_1.FieldValue.serverTimestamp() });
        }
        else {
            const subscriptionRef = db.collection('subscriptions').doc();
            tx.set(subscriptionRef, { name: data.service_name, price: Number(request.data.price), currency: 'SAR', billing_cycle: request.data.billingCycle, renewal_date: firestore_1.Timestamp.fromDate(new Date(request.data.renewalDate)), status: 'نشط', account_email: request.data.accountEmail, assigned_to: [data.requested_by], has_stored_credentials: false, encrypted_credentials: null, created_at: firestore_1.FieldValue.serverTimestamp(), updated_at: firestore_1.FieldValue.serverTimestamp(), created_by: request.auth.uid });
        }
        tx.update(requestRef, { status: 'مكتمل', reviewed_by: request.auth.uid, reviewed_at: firestore_1.FieldValue.serverTimestamp() });
        tx.create(db.collection('notifications').doc(), { user_id: data.requested_by, title: 'تمت الموافقة على طلبك', body: `تم اعتماد ${data.service_name}`, read: false, created_at: firestore_1.FieldValue.serverTimestamp() });
        tx.create(db.collection('audit_logs').doc(), { action: 'موافقة على طلب', entity_id: requestId, actor_uid: request.auth.uid, actor_name: actor?.name ?? '', created_at: firestore_1.FieldValue.serverTimestamp() });
    });
    return { ok: true };
});
exports.rejectRequest = (0, https_1.onCall)({ region: 'me-central1' }, async (request) => {
    const actor = await requirePermission(request.auth?.uid, 'reject_requests');
    const requestId = String(request.data.requestId ?? '');
    const reason = String(request.data.reason ?? '').trim();
    if (!reason)
        throw new https_1.HttpsError('invalid-argument', 'سبب الرفض مطلوب');
    const requestRef = db.doc(`subscription_requests/${requestId}`);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(requestRef);
        if (!snap.exists || snap.data()?.status !== 'قيد المراجعة')
            throw new https_1.HttpsError('failed-precondition', 'الطلب ليس قيد المراجعة');
        tx.update(requestRef, { status: 'مرفوض', rejection_reason: reason, reviewed_by: request.auth.uid, reviewed_at: firestore_1.FieldValue.serverTimestamp() });
        tx.create(db.collection('notifications').doc(), { user_id: snap.data().requested_by, title: 'تم رفض الطلب', body: reason, read: false, created_at: firestore_1.FieldValue.serverTimestamp() });
        tx.create(db.collection('audit_logs').doc(), { action: 'رفض طلب', entity_id: requestId, actor_uid: request.auth.uid, actor_name: actor?.name ?? '', created_at: firestore_1.FieldValue.serverTimestamp() });
    });
    return { ok: true };
});
