import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
// @ts-expect-error getReactNativePersistence exists in the React Native runtime bundle of firebase/auth
import { initializeAuth, getReactNativePersistence, getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
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

export { app, auth, db };
