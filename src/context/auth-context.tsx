import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform, Alert, TurboModuleRegistry, NativeModules } from 'react-native';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  deleteUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db, storage, checkOnlineStatus, withFirestoreTimeout } from '@/services/firebase';
import { StorageService } from '@/services/storage';
import { SyncService } from '@/services/sync-service';
import {
  ensureOfflineCachedImage,
  saveAvatarToLocalCache,
  getAvatarCacheMap,
} from '@/services/image-picker';

/**
 * Verifica de forma totalmente segura se o módulo nativo RNGoogleSignin está registrado
 * no binário nativo da plataforma antes de tentar carregar a biblioteca.
 * No Expo Go ou em ambientes sem o binário nativo compilado, TurboModuleRegistry.get('RNGoogleSignin')
 * retorna null sem disparar o Invariant Violation (ao contrário de getEnforcing).
 */
function isGoogleSigninSupported(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    const turboModule = TurboModuleRegistry?.get ? TurboModuleRegistry.get('RNGoogleSignin') : null;
    const legacyModule = NativeModules?.RNGoogleSignin ?? null;
    return Boolean(turboModule || legacyModule);
  } catch {
    return false;
  }
}

/**
 * Carrega dinamicamente a biblioteca nativa do Google Sign-In apenas se o módulo nativo existir.
 */
function getGoogleSignin(): typeof import('@react-native-google-signin/google-signin') | null {
  if (!isGoogleSigninSupported()) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin');
  } catch (err) {
    console.warn('Aviso: Módulo nativo GoogleSignin não encontrado no binário:', err);
    return null;
  }
}

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
 * Tenta fazer o upload da imagem para o Firebase Cloud Storage com timeout curto.
 * Se o bucket estiver configurado e o upload tiver sucesso, retorna a URL pública HTTP(S) curta.
 * Se estiver offline ou o Storage falhar, retorna a Base64 original como fallback seguro.
 */
async function uploadUserAvatarToStorage(
  userEmail: string,
  photoUriOrBase64: string
): Promise<string> {
  if (isValidAuthPhotoUrl(photoUriOrBase64)) {
    return photoUriOrBase64;
  }

  const online = await checkOnlineStatus();
  if (!online) {
    return photoUriOrBase64;
  }

  try {
    const storageRef = ref(storage, `users/${userEmail.toLowerCase().trim()}/avatar.jpg`);

    const downloadUrl = await withFirestoreTimeout(async () => {
      if (photoUriOrBase64.startsWith('data:')) {
        await uploadString(storageRef, photoUriOrBase64, 'data_url');
      } else {
        const response = await fetch(photoUriOrBase64);
        const blob = await response.blob();
        await uploadBytes(storageRef, blob, {
          contentType: 'image/jpeg',
        });
      }
      return await getDownloadURL(storageRef);
    }, 3000);

    return downloadUrl;
  } catch (error) {
    console.warn(
      'Aviso: Upload para Firebase Storage indisponível/offline. Salvando foto otimizada localmente:',
      error
    );
    return photoUriOrBase64;
  }
}

/**
 * Salva o perfil e a foto customizada do usuário no Firestore e no cache local AsyncStorage
 * (sempre mantendo a versão Base64 em cache para exibição offline garantida).
 */
async function saveUserProfileToFirestoreAndCache(
  email: string,
  profile: { displayName?: string; photoUrl?: string | null; photoBase64?: string | null }
): Promise<boolean> {
  const emailKey = email.toLowerCase().trim();
  const cacheKey = `@contagiro:user_profile_${emailKey}`;

  // 1. Garante que a imagem de perfil esteja salva em Base64 no cache de avatares
  let offlinePhotoUri = profile.photoBase64 ?? profile.photoUrl;
  if (offlinePhotoUri) {
    const cachedImg = await ensureOfflineCachedImage(`user_${emailKey}`, offlinePhotoUri);
    if (cachedImg) {
      offlinePhotoUri = cachedImg;
    }
  } else if (profile.photoUrl === null) {
    await saveAvatarToLocalCache(`user_${emailKey}`, null);
    offlinePhotoUri = null;
  }

  // 2. Grava no cache AsyncStorage para exibição offline e carregamento instantâneo
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    const existing = cached ? JSON.parse(cached) : {};
    const updated = {
      ...existing,
      displayName:
        profile.displayName !== undefined ? profile.displayName : existing.displayName,
      photoUrl:
        offlinePhotoUri !== undefined
          ? offlinePhotoUri
          : profile.photoUrl !== undefined
          ? profile.photoUrl
          : existing.photoUrl,
      remotePhotoUrl:
        profile.photoUrl !== undefined ? profile.photoUrl : existing.remotePhotoUrl,
      email: emailKey,
    };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(updated));
  } catch (err) {
    console.warn('Erro ao salvar perfil no cache local:', err);
  }

  // 3. Grava no documento do usuário no Firestore com timeout curto
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
    await withFirestoreTimeout(() => setDoc(userDocRef, firestoreData, { merge: true }), 1500);
    await SyncService.removeByEntityId(emailKey);
    return true;
  } catch (err) {
    console.warn('Offline: Perfil salvo localmente e enfileirado para sincronização:', err);
    await SyncService.enqueue('SAVE_USER_PROFILE', emailKey, {
      displayName: profile.displayName,
      photoUrl: offlinePhotoUri !== undefined ? offlinePhotoUri : profile.photoUrl,
    });
    return false;
  }
}

interface AuthContextData {
  user: User | null;
  loading: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (
    email: string,
    pass: string,
    name: string,
    photoUrl?: string
  ) => Promise<void>;
  updateUserProfile: (data: { displayName?: string; photoUrl?: string | null }) => Promise<void>;
  changePassword: (newPassword: string, currentPassword?: string) => Promise<void>;
  loginWithGoogle: () => Promise<boolean | void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  deleteAccount: (password?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  // Inicializa o Google Sign-In nativo apenas se suportado no binário
  useEffect(() => {
    if (googleWebClientId && isGoogleSigninSupported()) {
      const gModule = getGoogleSignin();
      if (gModule?.GoogleSignin) {
        try {
          gModule.GoogleSignin.configure({
            webClientId: googleWebClientId,
          });
        } catch (err) {
          console.warn('Aviso: Falha ao inicializar GoogleSignin:', err);
        }
      }
    }
  }, [googleWebClientId]);

  // Monitora alterações no estado de autenticação do Firebase e sincroniza foto de perfil e cache offline
  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;

      if (currentUser && currentUser.email) {
        const emailKey = currentUser.email.toLowerCase().trim();
        let customPhoto = currentUser.photoURL;
        let customName = currentUser.displayName;

        // 1. Carrega do AsyncStorage e do cache de avatares imediatamente para funcionamento 100% offline
        try {
          const avatarMap = await getAvatarCacheMap();
          if (avatarMap[`user_${emailKey}`]) {
            customPhoto = avatarMap[`user_${emailKey}`];
          }

          const cachedProfile = await AsyncStorage.getItem(`@contagiro:user_profile_${emailKey}`);
          if (cachedProfile) {
            const parsed = JSON.parse(cachedProfile);
            if (parsed.photoUrl !== undefined && !avatarMap[`user_${emailKey}`]) {
              customPhoto = parsed.photoUrl;
            }
            if (parsed.displayName) {
              customName = parsed.displayName;
            }
          }
        } catch (e) {
          console.warn('Erro ao ler perfil do cache:', e);
        }

        if (isMounted) {
          setUser({
            ...currentUser,
            displayName: customName,
            photoURL: customPhoto,
          });
          setLoading(false);
        }

        // 2. Pré-carrega os dados offline (veículos, avatares, totalizadores, 5 últimos abastecimentos e manutenções)
        StorageService.preloadOfflineData().catch((err) => {
          console.warn('Aviso ao pré-carregar dados offline no login:', err);
        });

        // 3. Sincroniza perfil com o Firestore em background (sem sobrepor alterações feitas offline!)
        try {
          const queue = await SyncService.getQueue();
          const hasPendingProfile = queue.some(
            (q) => q.action === 'SAVE_USER_PROFILE' && q.userEmail === emailKey
          );

          if (!hasPendingProfile) {
            const userDoc = await withFirestoreTimeout(
              () => getDoc(doc(db, 'users', emailKey)),
              1500
            );
            if (userDoc.exists() && isMounted) {
              const data = userDoc.data();
              const remotePhoto =
                data?.photoUrl !== undefined ? data.photoUrl : currentUser.photoURL;
              const remoteName = data?.displayName || customName;

              let localReadyPhoto = remotePhoto;
              if (remotePhoto) {
                const cachedBase64 = await ensureOfflineCachedImage(
                  `user_${emailKey}`,
                  remotePhoto
                );
                if (cachedBase64) {
                  localReadyPhoto = cachedBase64;
                }
              }

              if (isMounted) {
                setUser((prev) =>
                  prev
                    ? {
                        ...prev,
                        displayName: remoteName,
                        photoURL: localReadyPhoto,
                      }
                    : prev
                );
              }

              await AsyncStorage.setItem(
                `@contagiro:user_profile_${emailKey}`,
                JSON.stringify({
                  displayName: remoteName,
                  email: emailKey,
                  photoUrl: localReadyPhoto,
                  remotePhotoUrl: remotePhoto,
                })
              );
            } else if (customPhoto && customPhoto.startsWith('http')) {
              // Se veio foto do Google Auth e ainda não estava no Firestore, salva em Base64 no cache local
              const cachedBase64 = await ensureOfflineCachedImage(`user_${emailKey}`, customPhoto);
              if (cachedBase64 && isMounted) {
                setUser((prev) => (prev ? { ...prev, photoURL: cachedBase64 } : prev));
                await AsyncStorage.setItem(
                  `@contagiro:user_profile_${emailKey}`,
                  JSON.stringify({
                    displayName: customName,
                    email: emailKey,
                    photoUrl: cachedBase64,
                    remotePhotoUrl: customPhoto,
                  })
                );
              }
            }
          }
        } catch {
          // Offline: mantém os dados do cache local
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

  const registerWithEmail = async (
    email: string,
    pass: string,
    name: string,
    photoUrl?: string
  ) => {
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, pass);

    if (cred.user) {
      let finalPhotoUrl = photoUrl;
      let localBase64Photo = photoUrl;

      if (photoUrl) {
        const cached = await ensureOfflineCachedImage(`user_${trimmedEmail}`, photoUrl);
        if (cached) localBase64Photo = cached;
        finalPhotoUrl = await uploadUserAvatarToStorage(trimmedEmail, photoUrl);
      }

      try {
        if (finalPhotoUrl && isValidAuthPhotoUrl(finalPhotoUrl)) {
          await withFirestoreTimeout(
            () =>
              updateProfile(cred.user, {
                displayName: trimmedName,
                photoURL: finalPhotoUrl,
              }),
            2000
          );
        } else {
          await withFirestoreTimeout(
            () =>
              updateProfile(cred.user, {
                displayName: trimmedName,
              }),
            2000
          );
        }
      } catch (e) {
        console.warn('Aviso ao atualizar Auth profile durante cadastro:', e);
      }

      await saveUserProfileToFirestoreAndCache(trimmedEmail, {
        displayName: trimmedName,
        photoUrl: finalPhotoUrl || null,
        photoBase64: localBase64Photo || null,
      });

      setUser({
        ...cred.user,
        displayName: trimmedName,
        photoURL: localBase64Photo || finalPhotoUrl || null,
      });
    }
  };

  const updateUserProfile = async (data: { displayName?: string; photoUrl?: string | null }) => {
    if (!auth.currentUser) return;
    const currentUser = auth.currentUser;
    const userEmail = currentUser.email || '';

    // Impede remoção de foto de perfil do banco de dados quando offline
    if (data.photoUrl === null) {
      const online = await checkOnlineStatus(true);
      if (!online) {
        throw new Error(
          'Não é possível remover a foto de perfil do banco de dados enquanto estiver offline. Conecte-se à internet e tente novamente.'
        );
      }
    }

    let localBase64Photo = data.photoUrl;
    if (data.photoUrl && userEmail) {
      const cached = await ensureOfflineCachedImage(`user_${userEmail}`, data.photoUrl);
      if (cached) localBase64Photo = cached;
    }

    let finalPhotoUrl = data.photoUrl;
    if (data.photoUrl && userEmail && !data.photoUrl.startsWith('http')) {
      finalPhotoUrl = await uploadUserAvatarToStorage(userEmail, data.photoUrl);
    }

    const authUpdates: { displayName?: string; photoURL?: string } = {};

    if (data.displayName !== undefined) {
      authUpdates.displayName = data.displayName.trim();
    }

    if (finalPhotoUrl !== undefined) {
      if (finalPhotoUrl && isValidAuthPhotoUrl(finalPhotoUrl)) {
        authUpdates.photoURL = finalPhotoUrl;
      } else if (!finalPhotoUrl) {
        authUpdates.photoURL = '';
      }
    }

    if (Object.keys(authUpdates).length > 0) {
      try {
        await withFirestoreTimeout(() => updateProfile(currentUser, authUpdates), 1500);
      } catch (e) {
        console.warn('Offline: updateProfile do Firebase Auth será sincronizado depois:', e);
      }
    }

    const effectiveRemotePhoto =
      finalPhotoUrl !== undefined
        ? finalPhotoUrl || null
        : user?.photoURL || currentUser.photoURL;
    const effectiveLocalPhoto =
      localBase64Photo !== undefined
        ? localBase64Photo || null
        : user?.photoURL || currentUser.photoURL;
    const effectiveDisplayName =
      data.displayName !== undefined ? data.displayName.trim() : currentUser.displayName;

    if (userEmail) {
      await saveUserProfileToFirestoreAndCache(userEmail, {
        displayName: effectiveDisplayName || undefined,
        photoUrl: effectiveRemotePhoto,
        photoBase64: effectiveLocalPhoto,
      });
    }

    setUser({
      ...currentUser,
      displayName: effectiveDisplayName,
      photoURL: effectiveLocalPhoto,
    });
  };

  const changePassword = async (newPassword: string, currentPassword?: string) => {
    if (!auth.currentUser) {
      throw new Error('Nenhum usuário conectado.');
    }
    const online = await checkOnlineStatus(true);
    if (!online) {
      throw new Error('Conecte-se à internet para alterar sua senha.');
    }
    const currentUser = auth.currentUser;

    if (currentUser.email && currentPassword) {
      const cred = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, cred);
    }

    await updatePassword(currentUser, newPassword);
  };

  const loginWithGoogle = async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      return true;
    }

    if (!isGoogleSigninSupported()) {
      throw new Error(
        'O login nativo com Google requer o pacote APK instalado no aparelho ou uma Development Build (npx expo run:android), pois o Expo Go não inclui as bibliotecas nativas do Google Play Services.\n\nPara testar durante o desenvolvimento, use login com E-mail ou execute na Web (npx expo start --web).'
      );
    }

    const gModule = getGoogleSignin();
    if (!gModule) {
      throw new Error('Módulo Google Sign-In não está disponível neste dispositivo.');
    }

    if (!googleWebClientId) {
      throw new Error(
        'Para ativar o login com Google, configure o EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID no seu arquivo .env.'
      );
    }

    const { GoogleSignin, isSuccessResponse } = gModule;

    try {
      GoogleSignin.configure({
        webClientId: googleWebClientId,
      });

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();

      if (isSuccessResponse(response)) {
        const idToken = response.data?.idToken;
        if (!idToken) {
          throw new Error(
            'ID Token do Google não encontrado. Verifique se o Web Client ID está configurado corretamente.'
          );
        }

        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
        return true;
      }

      return false;
    } catch (error: any) {
      const gModuleCatch = getGoogleSignin();
      if (gModuleCatch && gModuleCatch.isErrorWithCode(error)) {
        const { statusCodes } = gModuleCatch;
        switch (error.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            return false;
          case statusCodes.IN_PROGRESS:
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
              error.message ||
                'Falha ao autenticar com o Google. Verifique se a chave SHA-1 está cadastrada no Firebase.'
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
      if (isGoogleSigninSupported()) {
        const gModule = getGoogleSignin();
        if (gModule?.GoogleSignin) {
          await gModule.GoogleSignin.signOut().catch(() => {});
        }
      }
    } catch {
      // Ignora erro no logout nativo do Google
    }
    await signOut(auth);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const deleteAccount = async (password?: string) => {
    if (!auth.currentUser) {
      throw new Error('Nenhum usuário conectado.');
    }
    const online = await checkOnlineStatus(true);
    if (!online) {
      throw new Error(
        'Não é possível excluir a conta e as informações do banco de dados enquanto estiver offline. Conecte-se à internet e tente novamente.'
      );
    }

    const currentUser = auth.currentUser;
    const userEmail = currentUser.email || '';

    const isGoogleOnly =
      currentUser.providerData.some((p) => p.providerId === 'google.com') &&
      !currentUser.providerData.some((p) => p.providerId === 'password');

    if (!isGoogleOnly && userEmail) {
      if (!password || !password.trim()) {
        throw new Error('A senha atual é obrigatória para confirmar a exclusão da conta.');
      }
      const credential = EmailAuthProvider.credential(userEmail, password);
      await reauthenticateWithCredential(currentUser, credential);
    }

    if (userEmail) {
      await StorageService.deleteAllUserData(userEmail);
    }

    try {
      if (isGoogleSigninSupported()) {
        const gModule = getGoogleSignin();
        if (gModule?.GoogleSignin) {
          await gModule.GoogleSignin.signOut().catch(() => {});
        }
      }
    } catch {}

    await deleteUser(currentUser);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginWithEmail,
        registerWithEmail,
        updateUserProfile,
        changePassword,
        loginWithGoogle,
        logout,
        resetPassword,
        deleteAccount,
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
