import { readFile } from 'node:fs/promises'
import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!credentialsPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is required')

const serviceAccount = JSON.parse(await readFile(credentialsPath, 'utf8'))
const envText = await readFile(new URL('../.env.local', import.meta.url), 'utf8')
const apiKey = envText.match(/^VITE_FIREBASE_API_KEY=(.+)$/m)?.[1]?.trim()
if (!apiKey) throw new Error('VITE_FIREBASE_API_KEY is missing')

const app = initializeApp({ credential: cert(serviceAccount) })
const auth = getAuth(app)
const db = getFirestore(app)
const ownerSnapshot = await db.collection('users').where('is_owner', '==', true).limit(1).get()
if (ownerSnapshot.empty) throw new Error('No owner user found')
const owner = ownerSnapshot.docs[0]

const customToken = await auth.createCustomToken(owner.id)
const signInResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token: customToken, returnSecureToken: true }),
})
const signInBody = await signInResponse.json()
if (!signInResponse.ok) throw new Error(signInBody.error?.message ?? 'Custom-token exchange failed')
const idToken = signInBody.idToken

async function action(actionName, payload) {
  const response = await fetch('https://aait-subscriptions.vercel.app/api/actions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action: actionName, payload }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`${actionName}: ${body.error ?? response.status}`)
  return body
}

async function rejectedAction(actionName, payload) {
  const response = await fetch('https://aait-subscriptions.vercel.app/api/actions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action: actionName, payload }),
  })
  const body = await response.json()
  if (response.ok) throw new Error(`${actionName} unexpectedly succeeded`)
  return String(body.error ?? '')
}

const testName = 'اختبار تحقق النظام 2026'
const requestSnapshot = await db.collection('subscription_requests').where('service_name', '==', testName).get()
const approvedRequest = requestSnapshot.docs.find((doc) => doc.data().type === 'new' && doc.data().status === 'مكتمل')
const renewedRequest = requestSnapshot.docs.find((doc) => doc.data().type === 'renewal' && doc.data().status === 'مكتمل')
if (!approvedRequest || !renewedRequest) throw new Error('Completed verification requests not found')
const requestId = approvedRequest.id
const renewalRequestId = renewedRequest.id

const subscriptionSnapshot = await db.collection('subscriptions').where('source_request_id', '==', requestId).limit(1).get()
if (subscriptionSnapshot.empty) throw new Error('Verification subscription not found')
const subscriptionId = subscriptionSnapshot.docs[0].id
const subscription = await db.doc(`subscriptions/${subscriptionId}`).get()

await action('store_credential', {
  subscriptionId,
  secret: { username: 'codex-verification', password: 'not-a-real-password', url: 'https://example.com' },
})
const revealed = await action('reveal_credential', { subscriptionId, confirmed: true })
const securedSubscription = await db.doc(`subscriptions/${subscriptionId}`).get()
const credential = await db.doc(`credentials/${subscriptionId}`).get()
const credentialData = credential.data() ?? {}
const credentialKeys = Object.keys(credentialData).sort()
const noPlaintextFields = !credentialKeys.some((field) => ['username', 'password', 'secret'].includes(field))
const ownerProtectionError = await rejectedAction('assign_roles', { uid: owner.id, roleIds: [] })
const renewedSubscription = await db.doc(`subscriptions/${subscriptionId}`).get()
const rejectionReason = 'رفض تجريبي للتحقق من السجل'
const rejectedSnapshot = await db.collection('subscription_requests')
  .where('service_name', '==', 'اختبار الرفض الدائم 2026')
  .where('status', '==', 'مرفوض')
  .limit(1)
  .get()
if (rejectedSnapshot.empty) throw new Error('Rejected verification request not found')
const rejectedRequest = rejectedSnapshot.docs[0]

const auditSnapshot = await db.collection('audit_logs').get()
const notificationsSnapshot = await db.collection('notifications').where('user_id', '==', owner.id).get()

const result = {
  ownerVerified: owner.exists,
  requestApproved: approvedRequest.data().status === 'مكتمل',
  subscriptionCreated: subscription.exists && subscription.data()?.source_request_id === requestId,
  credentialEncrypted: credential.exists && noPlaintextFields && credentialKeys.includes('ciphertext'),
  subscriptionCiphertextMirrored: typeof securedSubscription.data()?.encrypted_credentials === 'string'
    && !securedSubscription.data()?.encrypted_credentials.includes('not-a-real-password'),
  credentialRevealVerified: revealed.secret?.username === 'codex-verification' && revealed.secret?.password === 'not-a-real-password',
  renewalUpdatedOriginal: renewedRequest.data().resulting_subscription_id === subscriptionId
    && renewedSubscription.data()?.renewal_date?.toDate().toISOString().startsWith('2026-10-03'),
  rejectedRequestRetained: rejectedRequest.exists
    && rejectedRequest.data().status === 'مرفوض'
    && rejectedRequest.data().rejection_reason === rejectionReason,
  assignedEmployeeCredentialNotice: notificationsSnapshot.docs.some((doc) => doc.data().subscription_id === subscriptionId && doc.data().title === 'بيانات دخول الاشتراك متاحة'),
  ownerRoleProtected: ownerProtectionError.includes('مالك النظام'),
  auditEntries: auditSnapshot.size,
  notificationsForOwner: notificationsSnapshot.size,
  verificationIds: { requestId, subscriptionId, renewalRequestId, rejectedRequestId: rejectedRequest.id },
}

if (!Object.values(result).slice(0, 10).every(Boolean)) throw new Error(`Verification failed: ${JSON.stringify(result)}`)
console.log(JSON.stringify(result, null, 2))
