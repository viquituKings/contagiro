import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform, Alert } from 'react-native';
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
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import Constants, { AppOwnership, ExecutionEnvironment } from 'expo-constants';
import { auth, db, storage } from '@/services/firebase';

const isExpoGo =
  Constants.appOwnership === AppOwnership.Expo ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Valida se uma URL é aceita pelo atributo `photoURL` do Firebase Authentication.
 * O Firebase Auth impõe limite máximo de 2.048 caracteres e rejeita Base64 data URIs
 * com o erro `auth/invalid-profile-attribute` (Photo URL too long).
 */
function isValidAuthPhotoUrl(url?: string | null): boolean {
  if (!url) return false;
  if (url.startsWith('data:')) return false; // Base64 data URI
  if (url.length > 2048) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Tenta fazer o upload da imagem para o Firebase Cloud Storage.
 * Se o bucket estiver configurado e o upload tiver sucesso, retorna a URL pública HTTP(S) curta.
 * Se o Storage não estiver configurado ou falhar, retorna a Base64 original como fallback seguro,
 * permitindo que seja armazenada no Firestore sem interromper a experiência do usuário.
 */
async function uploadUserAvatarToStorage(userEmail: string, photoUriOrBase64: string): Promise<string> {
  if (isValidAuthPhotoUrl(photoUriOrBase64)) {
    return photoUriOrBase64;
  }

  try {
    const storageRef = ref(storage, `users/${userEmail.toLowerCase().trim()}/avatar.jpg`);

    if (photoUriOrBase64.startsWith('data:')) {
      // Data URLs devem ser enviadas com uploadString('data_url'), pois fetch('data:...')
      // é rejeitado pela stack nativa do Android (java.net.MalformedURLException: unknown protocol: data)
      await uploadString(storageRef, photoUriOrBase64, 'data_url');
    } else {
      const response = await fetch(photoUriOrBase64);
      const blob = await response.blob();
      await uploadBytes(storageRef, blob, {
        contentType: 'image/jpeg',
      });
    }

    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (error) {
    console.warn(
      'Aviso: Upload para Firebase Storage não disponível. Salvando foto otimizada no Firestore:',
      error
    );
    return photoUriOrBase64;
  }
}

/**
 * Salva o perfil e a foto customizada do usuário no Firestore e no cache local AsyncStorage.
 */
async function saveUserProfileToFirestoreAndCache(
  email: string,
  profile: { displayName?: string; photoUrl?: string | null }
) {
  const emailKey = email.toLowerCase().trim();
  const cacheKey = `@contagiro:user_profile_${emailKey}`;

  // 1. Grava no cache AsyncStorage para exibição offline e carregamento instantâneo
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    const existing = cached ? JSON.parse(cached) : {};
    const updated = {
      ...existing,
      ...profile,
      email: emailKey,
    };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(updated));
  } catch (err) {
    console.warn('Erro ao salvar perfil no cache local:', err);
  }

  // 2. Grava no documento do usuário no Firestore
  try {
    const userDocRef = doc(db, 'users', emailKey);
    const firestoreData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (profile.displayName !== undefined) {
      firestoreData.displayName = profile.displayName;
    }
    if (profile.photoUrl !== undefined) {
      firestoreData.photoUrl = profile.photoUrl;
    }
    await setDoc(userDocRef, firestoreData, { merge: true });
  } catch (err) {
    console.warn('Erro ao salvar perfil no Firestore:', err);
  }
}

interface AuthContextData {
  user: User | null;
  loading: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string, photoUrl?: string) => Promise<void>;
  updateUserProfile: (data: { displayName?: string; photoUrl?: string }) => Promise<void>;
  loginWithGoogle: () => Promise<boolean | void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  // Inicializa o Google Sign-In nativo
  useEffect(() => {
    if (Platform.OS !== 'web' && !isExpoGo && googleWebClientId) {
      try {
        GoogleSignin.configure({
          webClientId: googleWebClientId,
        });
      } catch (err) {
        console.warn('Aviso: Falha ao inicializar GoogleSignin:', err);
      }
    }
  }, [googleWebClientId]);

  // Monitora alterações no estado de autenticação do Firebase e sincroniza foto de perfil
  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;

      if (currentUser && currentUser.email) {
        const emailKey = currentUser.email.toLowerCase().trim();
        let customPhoto = currentUser.photoURL;

        // 1. Carrega do AsyncStorage imediatamente para evitar atraso visual na interface
        try {
          const cachedProfile = await AsyncStorage.getItem(`@contagiro:user_profile_${emailKey}`);
          if (cachedProfile) {
            const parsed = JSON.parse(cachedProfile);
            if (parsed.photoUrl) {
              customPhoto = parsed.photoUrl;
            }
          }
        } catch (e) {
          console.warn('Erro ao ler perfil do cache:', e);
        }

        if (isMounted) {
          setUser({
            ...currentUser,
            photoURL: customPhoto,
          });
          setLoading(false);
        }

        // 2. Sincroniza com o Firestore em background
        try {
          const userDoc = await getDoc(doc(db, 'users', emailKey));
          if (userDoc.exists() && isMounted) {
            const data = userDoc.data();
            if (data?.photoUrl && data.photoUrl !== customPhoto) {
              setUser((prev) => (prev ? { ...prev, photoURL: data.photoUrl } : prev));
              await AsyncStorage.setItem(
                `@contagiro:user_profile_${emailKey}`,
                JSON.stringify({
                  displayName: data.displayName || currentUser.displayName,
                  email: emailKey,
                  photoUrl: data.photoUrl,
                })
              );
            }
          }
        } catch (e) {
          console.warn('Erro ao sincronizar perfil do Firestore:', e);
        }
      } else {
        if (isMounted) {
          setUser(currentUser);
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const loginWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), pass);
  };

  const registerWithEmail = async (email: string, pass: string, name: string, photoUrl?: string) => {
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, pass);

    if (cred.user) {
      let finalPhotoUrl = photoUrl;

      // Se houver foto, tenta enviar para o Firebase Storage
      if (photoUrl) {
        finalPhotoUrl = await uploadUserAvatarToStorage(trimmedEmail, photoUrl);
      }

      // Atualiza o Firebase Auth SOMENTE com photoURL se for uma URL válida (< 2048 caracteres).
      // Base64 é rejeitado pelo backend do Firebase Auth com Photo URL too long (auth/invalid-profile-attribute).
      if (finalPhotoUrl && isValidAuthPhotoUrl(finalPhotoUrl)) {
        await updateProfile(cred.user, {
          displayName: trimmedName,
          photoURL: finalPhotoUrl,
        });
      } else {
        await updateProfile(cred.user, {
          displayName: trimmedName,
        });
      }

      // Salva dados no Firestore e AsyncStorage (que aceitam Base64 sem limite restrito)
      await saveUserProfileToFirestoreAndCache(trimmedEmail, {
        displayName: trimmedName,
        photoUrl: finalPhotoUrl || null,
      });

      setUser({
        ...cred.user,
        displayName: trimmedName,
        photoURL: finalPhotoUrl || null,
      });
    }
  };

  const updateUserProfile = async (data: { displayName?: string; photoUrl?: string }) => {
    if (!auth.currentUser) return;
    const currentUser = auth.currentUser;
    const userEmail = currentUser.email || '';

    let finalPhotoUrl = data.photoUrl;

    if (data.photoUrl && userEmail) {
      finalPhotoUrl = await uploadUserAvatarToStorage(userEmail, data.photoUrl);
    }

    const authUpdates: { displayName?: string; photoURL?: string } = {};

    if (data.displayName !== undefined) {
      authUpdates.displayName = data.displayName.trim();
    }

    if (finalPhotoUrl !== undefined) {
      if (isValidAuthPhotoUrl(finalPhotoUrl)) {
        authUpdates.photoURL = finalPhotoUrl;
      }
    }

    if (Object.keys(authUpdates).length > 0) {
      await updateProfile(currentUser, authUpdates);
    }

    const effectivePhotoUrl =
      finalPhotoUrl !== undefined ? finalPhotoUrl : user?.photoURL || currentUser.photoURL;
    const effectiveDisplayName =
      data.displayName !== undefined ? data.displayName.trim() : currentUser.displayName;

    if (userEmail) {
      await saveUserProfileToFirestoreAndCache(userEmail, {
        displayName: effectiveDisplayName || undefined,
        photoUrl: effectivePhotoUrl || null,
      });
    }

    setUser({
      ...currentUser,
      displayName: effectiveDisplayName,
      photoURL: effectivePhotoUrl || null,
    });
  };

  const loginWithGoogle = async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      return true;
    }

    if (isExpoGo) {
      throw new Error(
        'O login nativo com Google requer o pacote APK instalado no aparelho ou uma Development Build (npx expo run:android), pois o Expo Go não inclui as bibliotecas nativas do Google Play Services.\n\nPara testar durante o desenvolvimento, use login com E-mail ou execute na Web (npx expo start --web).'
      );
    }

    if (!googleWebClientId) {
      throw new Error(
        'Para ativar o login com Google, configure o EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID no seu arquivo .env.'
      );
    }

    try {
      GoogleSignin.configure({
        webClientId: googleWebClientId,
      });

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();

      if (isSuccessResponse(response)) {
        const idToken = response.data?.idToken;
        if (!idToken) {
          throw new Error('ID Token do Google não encontrado. Verifique se o Web Client ID está configurado corretamente.');
        }

        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
        return true;
      }

      return false;
    } catch (error: any) {
      if (isErrorWithCode(error)) {
        switch (error.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            // Usuário fechou ou cancelou o seletor nativo do Google
            return false;
          case statusCodes.IN_PROGRESS:
            // Já existe uma operação de autenticação em andamento
            return false;
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            Alert.alert(
              'Google Play Services',
              'O Google Play Services não está disponível ou precisa ser atualizado neste aparelho.'
            );
            return false;
          default:
            console.error('Erro no Google Sign-In nativo:', error);
            Alert.alert(
              'Erro no Login Google',
              error.message || 'Falha ao autenticar com o Google. Verifique se a chave SHA-1 está cadastrada no Firebase.'
            );
            return false;
        }
      } else {
        console.error('Erro no login com o Google:', error);
        throw error;
      }
    }
  };

  const logout = async () => {
    try {
      if (Platform.OS !== 'web' && !isExpoGo) {
        await GoogleSignin.signOut().catch(() => {});
      }
    } catch {
      // Ignora erro no logout nativo do Google
    }
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
        updateUserProfile,
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
