import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
} from 'firebase/auth';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { auth } from '@/services/firebase';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextData {
  user: User | null;
  loading: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || googleWebClientId;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || googleWebClientId;

  const isGoogleConfigured = Boolean(
    Platform.select({
      web: 'web_supported',
      android: googleAndroidClientId,
      ios: googleIosClientId,
      default: googleWebClientId,
    })
  );

  // Fornece um id padrão para evitar que o invariantClientId lance exceção no Android na inicialização
  const [, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: googleWebClientId || 'unconfigured',
    webClientId: googleWebClientId || 'unconfigured',
    androidClientId: googleAndroidClientId || 'unconfigured',
    iosClientId: googleIosClientId || 'unconfigured',
  });

  // Monitora a resposta do fluxo do Google no mobile
  useEffect(() => {
    if (response?.type === 'success' && response.params?.id_token) {
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential).catch((error) => {
        console.error('Erro na credencial Google:', error);
      });
    }
  }, [response]);

  // Monitora alterações no estado de autenticação do Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), pass);
  };

  const registerWithEmail = async (email: string, pass: string, name: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    if (cred.user && name.trim()) {
      await updateProfile(cred.user, {
        displayName: name.trim(),
      });
      setUser({ ...cred.user, displayName: name.trim() });
    }
  };

  const loginWithGoogle = async () => {
    if (Platform.OS === 'web') {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      return;
    }

    if (!isGoogleConfigured) {
      throw new Error(
        'Para ativar o login com Google no Android, adicione o EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (ou EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID) no seu arquivo .env.'
      );
    }

    await promptAsync();
  };

  const logout = async () => {
    await signOut(auth);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        logout,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
}
