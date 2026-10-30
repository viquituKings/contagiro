import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
import { storage, withFirestoreTimeout, checkOnlineStatus } from '@/services/firebase';

export interface OptimizedImageResult {
  /** URI local em cache no dispositivo */
  uri: string;
  /** Data URI em Base64 pronta para salvar diretamente no banco de dados (Firestore / AsyncStorage) */
  base64Uri: string;
  width: number;
  height: number;
}

export type ImageSourceType = 'camera' | 'gallery';

const AVATAR_CACHE_KEY = '@contagiro:avatar_cache_v1';

/**
 * Lê o mapa de avatares em cache local (chaves por vehicleId, email ou URL)
 */
export async function getAvatarCacheMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(AVATAR_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Salva um avatar (em Base64) no cache local do aparelho associado a uma chave (ex: vehicleId ou email)
 */
export async function saveAvatarToLocalCache(key: string, base64OrUri?: string | null): Promise<void> {
  if (!key) return;
  try {
    const map = await getAvatarCacheMap();
    if (!base64OrUri) {
      delete map[key];
    } else {
      map[key] = base64OrUri;
    }
    await AsyncStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('Erro ao salvar avatar no cache local:', e);
  }
}

/**
 * Converte uma URL HTTP(S) de imagem (ex: foto do Google ou Firebase Storage) para Base64
 * e armazena no cache local do aparelho para exibição offline instantânea.
 */
export async function ensureOfflineCachedImage(
  entityKey: string,
  urlOrBase64?: string | null
): Promise<string | undefined> {
  if (!urlOrBase64) {
    const map = await getAvatarCacheMap();
    return map[entityKey] || undefined;
  }

  // Se já for Data URI em Base64, salva diretamente no cache e retorna
  if (urlOrBase64.startsWith('data:')) {
    await saveAvatarToLocalCache(entityKey, urlOrBase64);
    return urlOrBase64;
  }

  const map = await getAvatarCacheMap();

  // Se já convertemos esta URL ou entidade para Base64 antes, retorna do cache local
  if (map[urlOrBase64] && map[urlOrBase64].startsWith('data:')) {
    if (map[entityKey] !== map[urlOrBase64]) {
      map[entityKey] = map[urlOrBase64];
      await AsyncStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(map)).catch(() => {});
    }
    return map[urlOrBase64];
  }

  if (map[entityKey] && map[entityKey].startsWith('data:')) {
    return map[entityKey];
  }

  // Se for URL remota HTTP(S), tenta baixar e converter para Base64 se estiver online
  if (urlOrBase64.startsWith('http://') || urlOrBase64.startsWith('https://')) {
    try {
      const online = await checkOnlineStatus(false);
      if (!online) {
        return map[entityKey] || urlOrBase64;
      }

      ExpoImage.prefetch(urlOrBase64).catch(() => {});

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const response = await fetch(urlOrBase64, { signal: controller.signal });
      clearTimeout(timer);

      if (response.ok) {
        const blob = await response.blob();
        const base64DataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
              resolve(reader.result);
            } else {
              reject(new Error('Falha na conversão Base64'));
            }
          };
          reader.onerror = () => reject(new Error('Erro no FileReader'));
          reader.readAsDataURL(blob);
        });

        map[entityKey] = base64DataUri;
        map[urlOrBase64] = base64DataUri;
        await AsyncStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(map));
        return base64DataUri;
      }
    } catch {
      // Se falhar ou estiver offline, retorna o que houver no cache ou a própria URL
    }
  }

  return map[entityKey] || urlOrBase64;
}

/**
 * Solicita permissão e abre Câmera ou Galeria, recortando em formato quadrado (1:1)
 * e redimensionando para 320x320 com compressão JPEG de 70%.
 *
 * Isso reduz fotos de 12-48MP (5MB a 15MB) para apenas ~20KB a 35KB,
 * economizando mais de 99% de memória RAM e tráfego de rede.
 */
export async function pickAndOptimizeImage(
  source: ImageSourceType,
  options?: {
    targetSize?: number; // padrão 320px
    compress?: number; // padrão 0.7
  }
): Promise<OptimizedImageResult | null> {
  const targetSize = options?.targetSize || 320;
  const compress = options?.compress != null ? options?.compress : 0.7;

  try {
    let pickerResult: ImagePicker.ImagePickerResult;

    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permissão da Câmera',
          'É necessário permitir o acesso à câmera para fotografar.'
        );
        return null;
      }

      pickerResult = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permissão da Galeria',
          'É necessário permitir o acesso à galeria para selecionar imagens.'
        );
        return null;
      }

      pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
    }

    if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
      return null;
    }

    const rawUri = pickerResult.assets[0].uri;

    // Redimensionamento agressivo para 320x320 e compressão JPEG
    const manipulated = await manipulateAsync(
      rawUri,
      [{ resize: { width: targetSize, height: targetSize } }],
      {
        compress,
        format: SaveFormat.JPEG,
        base64: true,
      }
    );

    const base64Uri = manipulated.base64
      ? `data:image/jpeg;base64,${manipulated.base64}`
      : manipulated.uri;

    return {
      uri: manipulated.uri,
      base64Uri,
      width: manipulated.width,
      height: manipulated.height,
    };
  } catch (err) {
    console.error('Erro ao selecionar e otimizar imagem:', err);
    Alert.alert('Erro', 'Não foi possível processar a imagem selecionada.');
    return null;
  }
}

/**
 * Exibe um diálogo de seleção entre Câmera e Galeria.
 */
export function promptImageSource(): Promise<ImageSourceType | null> {
  return new Promise((resolve) => {
    Alert.alert(
      'Selecionar Foto',
      'Como você deseja escolher a imagem?',
      [
        {
          text: 'Tirar Foto',
          onPress: () => resolve('camera'),
        },
        {
          text: 'Escolher da Galeria',
          onPress: () => resolve('gallery'),
        },
        {
          text: 'Cancelar',
          style: 'cancel',
          onPress: () => resolve(null),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });
}

/**
 * Faz upload de uma imagem para o Firebase Cloud Storage.
 * Caso o Firebase Storage não esteja ativo ou retorne erro, faz fallback para a base64Uri
 * permitindo que a imagem seja armazenada no Firestore sem interrupção de fluxo.
 */
export async function uploadToFirebaseStorageOrFallback(
  imageResult: OptimizedImageResult,
  storagePath: string
): Promise<string> {
  try {
    const online = await checkOnlineStatus(false);
    if (!online) {
      return imageResult.base64Uri;
    }

    const storageRef = ref(storage, storagePath);

    await withFirestoreTimeout(async () => {
      if (imageResult.base64Uri && imageResult.base64Uri.startsWith('data:')) {
        await uploadString(storageRef, imageResult.base64Uri, 'data_url');
      } else {
        const response = await fetch(imageResult.uri);
        const blob = await response.blob();
        await uploadBytes(storageRef, blob, {
          contentType: 'image/jpeg',
        });
      }
    }, 2500);

    const downloadUrl = await withFirestoreTimeout(() => getDownloadURL(storageRef), 2000);
    return downloadUrl;
  } catch (error) {
    console.warn(
      'Aviso: Não foi possível enviar para o Firebase Storage. Utilizando Base64 comprimida no banco de dados:',
      error
    );
    return imageResult.base64Uri;
  }
}
