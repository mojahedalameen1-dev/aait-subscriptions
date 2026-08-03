import { collection, doc, getDoc, getDocs, orderBy, query, runTransaction, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { auth, db } from './firebase'

export const ALL_PERMISSIONS = ['view_subscriptions','manage_subscriptions','delete_subscriptions','review_requests','reject_requests','view_financial_reports','manage_users_roles','store_credentials','reveal_credentials','view_audit_log'] as const
export type UserProfile = { uid: string; name: string; email: string; photo_url: string; roles: string[]; permissions: string[]; is_owner: boolean }
export type SubscriptionRecord = { id: string; name: string; category?: string; price: number; currency: 'SAR'; billing_cycle: string; renewal_date?: { toDate(): Date }; assigned_to: string[]; status: 'نشط'|'قارب على الانتهاء'|'منتهٍ'|'ملغى'; account_email?: string; access_url?: string; has_stored_credentials?: boolean }
export type RequestRecord = { id: string; type: 'new'|'renewal'; service_name: string; purpose: string; notes?: string; requested_by: string; requester_name?: string; status: 'قيد المراجعة'|'مكتمل'|'مرفوض'; rejection_reason?: string; created_at?: { toDate(): Date } }
export type RoleRecord = { id: string; name: string; permissions: string[]; protected?: boolean }
export type AuditRecord = { id: string; action: string; entity_id: string; entity_type?: string; entity_name?: string; actor_name?: string; details?: string; summary?: string; created_at?: { toDate(): Date } }
export type NotificationRecord = { id: string; title: string; body: string; read: boolean; created_at?: { toDate(): Date } }

function requireContext() { if (!db || !auth?.currentUser) throw new Error('Firebase غير متصل'); return { db, user: auth.currentUser } }

export async function ensureUserProfile(): Promise<UserProfile> {
  const { db, user } = requireContext()
  const userRef = doc(db, 'users', user.uid)
  const existing = await getDoc(userRef)
  if (existing.exists()) return existing.data() as UserProfile
  return runTransaction(db, async (tx) => {
    const configRef = doc(db, 'system', 'config')
    const config = await tx.get(configRef)
    const isOwner = !config.exists()
    const profile: UserProfile = { uid: user.uid, name: user.displayName ?? 'موظف', email: user.email ?? '', photo_url: user.photoURL ?? '', roles: isOwner ? ['system-owner'] : [], permissions: isOwner ? [...ALL_PERMISSIONS] : [], is_owner: isOwner }
    if (isOwner) {
      tx.set(configRef, { owner_uid: user.uid, initialized_at: serverTimestamp() })
      tx.set(doc(db, 'roles', 'system-owner'), { name: 'مالك النظام', permissions: [...ALL_PERMISSIONS], created_by: user.uid, created_at: serverTimestamp(), protected: true })
    }
    tx.set(userRef, { ...profile, created_at: serverTimestamp() })
    return profile
  })
}

export async function createSubscriptionRequest(input: { service_name: string; purpose: string; notes?: string }) {
  return secureAction('create_request',{type:'new',serviceName:input.service_name,purpose:input.purpose,notes:input.notes??''})
}

export async function createRenewalRequest(subscriptionId: string, serviceName: string, notes?: string) {
  return secureAction('create_request',{type:'renewal',serviceName,purpose:'تجديد الاشتراك الحالي',notes:notes??'',subscriptionId})
}

const rows = <T,>(snapshot: Awaited<ReturnType<typeof getDocs>>) => snapshot.docs.map(item => ({ id: item.id, ...(item.data() as Record<string, unknown>) } as T))

export async function listMyRequests() { const { db, user } = requireContext(); return rows<RequestRecord>(await getDocs(query(collection(db, 'subscription_requests'), where('requested_by','==',user.uid)))) }
export async function listMySubscriptions() { const { db, user } = requireContext(); return rows<SubscriptionRecord>(await getDocs(query(collection(db, 'subscriptions'), where('assigned_to','array-contains',user.uid)))) }
export async function listAllRequests() { const { db } = requireContext(); return rows<RequestRecord>(await getDocs(query(collection(db, 'subscription_requests'), orderBy('created_at','desc')))) }
export async function listAllSubscriptions() { const { db } = requireContext(); return rows<SubscriptionRecord>(await getDocs(query(collection(db, 'subscriptions'), orderBy('created_at','desc')))) }
export async function listRoles() { const { db } = requireContext(); return rows<RoleRecord>(await getDocs(collection(db,'roles'))) }
export async function listUsers() { const { db } = requireContext(); return rows<UserProfile>(await getDocs(collection(db,'users'))) }
export async function listAuditLogs() { const { db } = requireContext(); return rows<AuditRecord>(await getDocs(query(collection(db,'audit_logs'),orderBy('created_at','desc')))) }
export async function listNotifications() { const { db, user } = requireContext(); return rows<NotificationRecord>(await getDocs(query(collection(db,'notifications'),where('user_id','==',user.uid)))) }

export async function createSubscription(input: {name:string;category:string;price:number;billingCycle:string;renewalDate:string;accountEmail:string;accessUrl?:string;assignedTo:string[]}) { return secureAction('create_subscription',input) }
export async function updateSubscription(subscriptionId:string,changes:Record<string,unknown>) { return secureAction('update_subscription',{subscriptionId,changes}) }
export async function deleteSubscription(subscriptionId:string) { return secureAction('delete_subscription',{subscriptionId}) }

export async function markNotificationRead(id:string) { const { db } = requireContext(); return updateDoc(doc(db,'notifications',id),{read:true}) }

export async function secureAction<T = { ok: true }>(action:string,payload:Record<string,unknown>):Promise<T> {
  const user = auth?.currentUser
  if (!user) throw new Error('يلزم تسجيل الدخول')
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? (location.hostname.endsWith('web.app') || location.hostname.endsWith('firebaseapp.com') ? 'https://aait-subscriptions.vercel.app' : '')
  const response = await fetch(`${apiBase}/api/actions`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({action,payload})})
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? 'تعذر تنفيذ الإجراء')
  return body as T
}

export async function rejectRequest(requestId: string, reason: string) { return secureAction('reject_request',{requestId,reason}) }
export async function approveRequest(requestId:string,input:{cost:number;billingCycle:string;renewalDate:string;category:string;accountEmail:string;accessUrl?:string;assignedTo?:string[]}) { return secureAction('approve_request',{requestId,...input}) }
export async function revealCredential(subscriptionId:string) { return secureAction<{ok:true;secret:{username?:string;password?:string;url?:string}}>('reveal_credential',{subscriptionId,confirmed:true}) }
export async function storeCredential(subscriptionId:string,secret:{username?:string;password?:string;url?:string}) { return secureAction('store_credential',{subscriptionId,secret}) }

export async function saveRole(name: string, permissions: string[]) { return secureAction('save_role',{name,permissions}) }
export async function assignRoles(uid: string, roleIds: string[]) { return secureAction('assign_roles',{uid,roleIds}) }
export async function deleteRole(roleId: string) { return secureAction('delete_role',{roleId}) }
export async function grantSystemOwner(uid: string) { return secureAction('grant_system_owner',{uid}) }
