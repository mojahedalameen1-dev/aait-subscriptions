import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'

initializeApp()
const db = getFirestore()
const credentialsKey = defineSecret('CREDENTIALS_KEY')

async function requirePermission(uid: string | undefined, permission: string) {
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول')
  const user = await db.doc(`users/${uid}`).get()
  const permissions = (user.data()?.permissions ?? []) as string[]
  if (!permissions.includes(permission)) throw new HttpsError('permission-denied', 'لا تملك الصلاحية المطلوبة')
  return user.data()
}

function keyBuffer() {
  const key = Buffer.from(credentialsKey.value(), 'base64')
  if (key.length !== 32) throw new HttpsError('failed-precondition', 'مفتاح التشفير غير صالح')
  return key
}

function encrypt(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyBuffer(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`
}

function decrypt(payload: string) {
  const [iv, tag, encrypted] = payload.split('.').map((part) => Buffer.from(part, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', keyBuffer(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export const storeCredential = onCall({ secrets: [credentialsKey], region: 'me-central1' }, async (request) => {
  const actor = await requirePermission(request.auth?.uid, 'store_credentials')
  const subscriptionId = String(request.data.subscriptionId ?? '')
  const username = String(request.data.username ?? '')
  const password = String(request.data.password ?? '')
  if (!subscriptionId || !username || !password) throw new HttpsError('invalid-argument', 'البيانات ناقصة')
  await db.doc(`subscriptions/${subscriptionId}`).update({ has_stored_credentials: true, encrypted_credentials: encrypt(JSON.stringify({ username, password })), updated_at: FieldValue.serverTimestamp() })
  await db.collection('audit_logs').add({ action: 'تخزين بيانات اعتماد', entity_id: subscriptionId, actor_uid: request.auth!.uid, actor_name: actor?.name ?? '', created_at: FieldValue.serverTimestamp() })
  return { ok: true }
})

export const revealCredential = onCall({ secrets: [credentialsKey], region: 'me-central1' }, async (request) => {
  const actor = await requirePermission(request.auth?.uid, 'reveal_credentials')
  const subscriptionId = String(request.data.subscriptionId ?? '')
  const subscription = await db.doc(`subscriptions/${subscriptionId}`).get()
  const encrypted = subscription.data()?.encrypted_credentials
  if (!encrypted) throw new HttpsError('not-found', 'لا توجد بيانات اعتماد')
  await db.collection('audit_logs').add({ action: 'إظهار بيانات اعتماد', entity_id: subscriptionId, actor_uid: request.auth!.uid, actor_name: actor?.name ?? '', created_at: FieldValue.serverTimestamp() })
  return JSON.parse(decrypt(String(encrypted)))
})

export const approveRequest = onCall({ secrets: [credentialsKey], region: 'me-central1' }, async (request) => {
  const actor = await requirePermission(request.auth?.uid, 'review_requests')
  const requestId = String(request.data.requestId ?? '')
  const requestRef = db.doc(`subscription_requests/${requestId}`)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef)
    if (!snap.exists || snap.data()?.status !== 'قيد المراجعة') throw new HttpsError('failed-precondition', 'الطلب ليس قيد المراجعة')
    const data = snap.data()!
    if (data.type === 'renewal') {
      const subscriptionRef = db.doc(`subscriptions/${data.related_subscription_id}`)
      tx.update(subscriptionRef, { renewal_date: Timestamp.fromDate(new Date(request.data.renewalDate)), status: 'نشط', updated_at: FieldValue.serverTimestamp() })
    } else {
      const subscriptionRef = db.collection('subscriptions').doc()
      tx.set(subscriptionRef, { name: data.service_name, price: Number(request.data.price), currency: 'SAR', billing_cycle: request.data.billingCycle, renewal_date: Timestamp.fromDate(new Date(request.data.renewalDate)), status: 'نشط', account_email: request.data.accountEmail, assigned_to: [data.requested_by], has_stored_credentials: false, encrypted_credentials: null, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(), created_by: request.auth!.uid })
    }
    tx.update(requestRef, { status: 'مكتمل', reviewed_by: request.auth!.uid, reviewed_at: FieldValue.serverTimestamp() })
    tx.create(db.collection('notifications').doc(), { user_id: data.requested_by, title: 'تمت الموافقة على طلبك', body: `تم اعتماد ${data.service_name}`, read: false, created_at: FieldValue.serverTimestamp() })
    tx.create(db.collection('audit_logs').doc(), { action: 'موافقة على طلب', entity_id: requestId, actor_uid: request.auth!.uid, actor_name: actor?.name ?? '', created_at: FieldValue.serverTimestamp() })
  })
  return { ok: true }
})

export const rejectRequest = onCall({ region: 'me-central1' }, async (request) => {
  const actor = await requirePermission(request.auth?.uid, 'reject_requests')
  const requestId = String(request.data.requestId ?? '')
  const reason = String(request.data.reason ?? '').trim()
  if (!reason) throw new HttpsError('invalid-argument', 'سبب الرفض مطلوب')
  const requestRef = db.doc(`subscription_requests/${requestId}`)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef)
    if (!snap.exists || snap.data()?.status !== 'قيد المراجعة') throw new HttpsError('failed-precondition', 'الطلب ليس قيد المراجعة')
    tx.update(requestRef, { status: 'مرفوض', rejection_reason: reason, reviewed_by: request.auth!.uid, reviewed_at: FieldValue.serverTimestamp() })
    tx.create(db.collection('notifications').doc(), { user_id: snap.data()!.requested_by, title: 'تم رفض الطلب', body: reason, read: false, created_at: FieldValue.serverTimestamp() })
    tx.create(db.collection('audit_logs').doc(), { action: 'رفض طلب', entity_id: requestId, actor_uid: request.auth!.uid, actor_name: actor?.name ?? '', created_at: FieldValue.serverTimestamp() })
  })
  return { ok: true }
})
