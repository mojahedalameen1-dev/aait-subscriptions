import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
const firebaseConfig = { apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID }
export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
const app = firebaseReady ? (getApps()[0] ?? initializeApp(firebaseConfig)) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export async function signInWithGoogle() {
  if (!auth) throw new Error('Firebase غير مهيأ')
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return signInWithPopup(auth, provider)
}

const authErrorMessages: Record<string, string> = {
  'auth/user-disabled': 'هذا الحساب معطّل في Firebase. تواصل مع مسؤول النظام لتفعيله.',
  'auth/unauthorized-domain': 'نطاق الموقع غير مصرح به في إعدادات Firebase Authentication.',
  'auth/operation-not-allowed': 'تسجيل الدخول باستخدام Google غير مفعّل في Firebase.',
  'auth/account-exists-with-different-credential': 'يوجد حساب بهذا البريد مرتبط بطريقة تسجيل دخول مختلفة.',
  'auth/popup-blocked': 'منع المتصفح نافذة تسجيل الدخول. اسمح بالنوافذ المنبثقة ثم حاول مجددًا.',
  'auth/popup-closed-by-user': 'أُغلقت نافذة تسجيل الدخول قبل إكمال العملية.',
  'auth/cancelled-popup-request': 'أُلغي طلب تسجيل الدخول بسبب فتح طلب آخر. حاول مرة أخرى.',
  'auth/network-request-failed': 'تعذر الاتصال بخدمة تسجيل الدخول. تحقق من الشبكة أو أدوات حجب التتبع.',
  'auth/too-many-requests': 'تم إيقاف المحاولات مؤقتًا بسبب كثرتها. انتظر قليلًا ثم حاول مجددًا.',
}

export function getAuthErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    return authErrorMessages[error.code] ?? `تعذر تسجيل الدخول (${error.code}).`
  }
  return error instanceof Error ? error.message : 'تعذر تسجيل الدخول. حاول مجددًا.'
}
export async function signOutUser() { if (auth) await signOut(auth) }
export function watchAuth(callback: (user: User | null) => void) { return auth ? onAuthStateChanged(auth, callback) : () => undefined }
