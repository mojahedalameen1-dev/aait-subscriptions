import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
const firebaseConfig = { apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID }
export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
const app = firebaseReady ? (getApps()[0] ?? initializeApp(firebaseConfig)) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export async function signInWithGoogle() { if (!auth) throw new Error('Firebase غير مهيأ'); return signInWithPopup(auth, new GoogleAuthProvider()) }
export async function signOutUser() { if (auth) await signOut(auth) }
export function watchAuth(callback: (user: User | null) => void) { return auth ? onAuthStateChanged(auth, callback) : () => undefined }
