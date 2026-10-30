import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
// @ts-expect-error getReactNativePersistence exists in the React Native runtime bundle of firebase/auth
import { initializeAuth, getReactNativePersistence, getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCIE6sqKsApFKF8qpw0Y5GbhdQKRbxfo9I',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'mediacombustivel-e76d9.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'mediacombustivel-e76d9',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'mediacombustivel-e76d9.appspot.com',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '992373241917',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:992373241917:web:098d66ab423a586ff85254',
};

// Inicializa o app Firebase (evitando recriação múltipla no Fast Refresh do Expo)
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Inicializa a autenticação com persistência no AsyncStorage do React Native
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

// Inicializa o Cloud Firestore
const db: Firestore = getFirestore(app);

// Inicializa o Firebase Storage
const storage: FirebaseStorage = getStorage(app);

// ============================================================================
// GERENCIAMENTO INTELIGENTE DE CONECTIVIDADE E TIMEOUT RÁPIDO DO FIREBASE
// ============================================================================
let isCurrentlyOnline = true;
let lastNetworkCheckAt = 0;
let pendingProbePromise: Promise<boolean> | null = null;
const onlineListeners = new Set<(online: boolean) => void>();

// Quando offline, mantém o estado em cache por 6s para evitar esperas repetidas em chamadas consecutivas
const OFFLINE_COOLDOWN_MS = 6000;
const ONLINE_CACHE_TTL_MS = 4000;

export function markNetworkStatus(online: boolean): void {
  const changed = isCurrentlyOnline !== online;
  isCurrentlyOnline = online;
  lastNetworkCheckAt = Date.now();
  if (changed) {
    onlineListeners.forEach((fn) => {
      try {
        fn(online);
      } catch {}
    });
  }
}

export function subscribeOnlineStatus(listener: (online: boolean) => void): () => void {
  onlineListeners.add(listener);
  listener(isCurrentlyOnline);
  return () => {
    onlineListeners.delete(listener);
  };
}

export function getCachedOnlineStatus(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  return isCurrentlyOnline;
}

/**
 * Verifica rapidamente se o aparelho possui conexão real com a internet/Firebase.
 * Quando o Wi-Fi/Dados Móveis está desligado no aparelho, o fetch falha em ~15ms.
 */
export async function checkOnlineStatus(force = false): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    markNetworkStatus(false);
    return false;
  }

  const now = Date.now();
  const ttl = isCurrentlyOnline ? ONLINE_CACHE_TTL_MS : OFFLINE_COOLDOWN_MS;
  if (!force && lastNetworkCheckAt > 0 && now - lastNetworkCheckAt < ttl) {
    return isCurrentlyOnline;
  }

  if (pendingProbePromise) {
    return pendingProbePromise;
  }

  pendingProbePromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1100);
    try {
      await fetch(`https://${firebaseConfig.authDomain}`, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);
      markNetworkStatus(true);
      return true;
    } catch {
      clearTimeout(timer);
      markNetworkStatus(false);
      return false;
    } finally {
      pendingProbePromise = null;
    }
  })();

  return pendingProbePromise;
}

/**
 * Envolve qualquer leitura ou escrita do Firestore/Storage em um timeout curto e
 * uma verificação paralela de conectividade para nunca travar quando offline.
 */
export async function withFirestoreTimeout<T>(
  operationFactory: (() => Promise<T>) | Promise<T>,
  timeoutMs = 1500
): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    markNetworkStatus(false);
    throw new Error('Dispositivo offline');
  }

  // Se já detectamos ausência de rede há poucos segundos, falha instantaneamente (0ms)
  if (!isCurrentlyOnline && Date.now() - lastNetworkCheckAt < OFFLINE_COOLDOWN_MS) {
    throw new Error('Dispositivo offline');
  }

  let timerId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      markNetworkStatus(false);
      reject(new Error('Timeout de rede Firestore'));
    }, timeoutMs);
  });

  // Se a interface de rede estiver desligada, o probe falha em ~15ms e aborta a espera imediatamente
  const fastOfflineAbortPromise = new Promise<never>((_, reject) => {
    checkOnlineStatus(false)
      .then((online) => {
        if (!online) {
          reject(new Error('Dispositivo offline'));
        }
      })
      .catch(() => {
        reject(new Error('Dispositivo offline'));
      });
  });

  try {
    const opPromise = typeof operationFactory === 'function' ? operationFactory() : operationFactory;
    const result = await Promise.race([
      opPromise,
      timeoutPromise,
      fastOfflineAbortPromise,
    ]);
    markNetworkStatus(true);
    return result;
  } catch (err) {
    markNetworkStatus(false);
    throw err;
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

export { app, auth, db, storage };
