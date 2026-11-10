import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, checkOnlineStatus, withStorageUploadTimeout } from '@/services/firebase';

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
export interface PickImageOptions {
  targetSize?: number; // padrão 320px
  compress?: number; // padrão 0.7
  allowsEditing?: boolean;
  aspect?: [number, number];
  maxWidth?: number;
}

/**
 * Solicita permissão e abre Câmera ou Galeria, recortando/redimensionando a imagem
 * com compressão JPEG.
 *
 * Para avatares/veículos: quadrado 320x320 com compressão.
 * Para documentos (NF/OS): livre (sem forçar corte) com maxWidth preservando proporção.
 */
export async function pickAndOptimizeImage(
  source: ImageSourceType,
  options?: PickImageOptions
): Promise<OptimizedImageResult | null> {
  const targetSize = options?.targetSize || 320;
  const compress = options?.compress != null ? options?.compress : 0.7;
  const allowsEditing = options?.allowsEditing ?? true;
  const aspect = options?.aspect ?? [1, 1];

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
        allowsEditing,
        ...(allowsEditing && aspect ? { aspect } : {}),
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
        allowsEditing,
        ...(allowsEditing && aspect ? { aspect } : {}),
        quality: 0.8,
      });
    }

    if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
      return null;
    }

    const rawUri = pickerResult.assets[0].uri;

    const resizeActions = options?.maxWidth
      ? [{ resize: { width: options.maxWidth } }]
      : [{ resize: { width: targetSize, height: targetSize } }];

    const manipulated = await manipulateAsync(
      rawUri,
      resizeActions,
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
export function promptImageSource(
  dialogTitle = 'Selecionar Foto',
  dialogMessage = 'Como você deseja escolher a imagem?'
): Promise<ImageSourceType | null> {
  return new Promise((resolve) => {
    Alert.alert(
      dialogTitle,
      dialogMessage,
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
 * Converte qualquer URI (file://, content://, data:image/...) em um Blob binário nativo e limpo
 * usando XMLHttpRequest com responseType="blob", método padrão ouro no ecossistema React Native / Expo.
 */
export async function uriToBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
      if (xhr.response) {
        resolve(xhr.response as Blob);
      } else {
        reject(new Error('Resposta vazia ao converter URI para Blob'));
      }
    };
    xhr.onerror = function (e) {
      reject(new TypeError(`Erro ao converter URI para Blob: ${e}`));
    };
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

/**
 * Faz upload do comprovante/nota fiscal da manutenção exclusivamente para o Firebase Cloud Storage.
 * Retorna a URL remota de download (HTTPS).
 * NUNCA retorna Base64, garantindo que o banco de dados Firestore não armazene imagens em Base64.
 *
 * Utiliza o caminho de arquivo nativo (file://) convertido diretamente em Blob nativo,
 * evitando qualquer corrupção de bytes binários em ambientes React Native.
 */
export async function uploadReceiptImageToStorage(
  imageInput: OptimizedImageResult | string,
  storagePath: string
): Promise<string> {
  // Se já for uma URL remota do Firebase Storage / HTTPS, retorna diretamente
  if (
    typeof imageInput === 'string' &&
    (imageInput.startsWith('https://') || imageInput.startsWith('http://'))
  ) {
    return imageInput;
  }

  const isOnline = await checkOnlineStatus(false);
  if (!isOnline) {
    throw new Error('Dispositivo offline. Não foi possível conectar ao Firebase Cloud Storage.');
  }

  // Define a URI fonte para criar o Blob nativo
  let sourceUri: string;
  if (typeof imageInput === 'string') {
    sourceUri = imageInput;
  } else {
    // Preferência absoluta pelo caminho de arquivo local (file://) para leitura binária direta sem re-codificação
    sourceUri = imageInput.uri || imageInput.base64Uri;
  }

  if (!sourceUri) {
    throw new Error('Nenhum dado de imagem válido fornecido para upload.');
  }

  const sanitizedPath = storagePath.replace(/[^\w/.\-_]/g, '_');
  const storageRef = ref(storage, sanitizedPath);

  // Converte a URI para um Blob nativo sem passar por strings ou bitwise arrays que corrompem o arquivo
  let blob: Blob | null = null;
  try {
    blob = await uriToBlob(sourceUri);
  } catch (xhrErr) {
    console.warn('uriToBlob falhou via XHR, tentando fetch:', xhrErr);
    const resp = await fetch(sourceUri);
    blob = await resp.blob();
  }

  if (!blob) {
    throw new Error('Não foi possível gerar os bytes da imagem para upload.');
  }

  try {
    // Envia o Blob nativo para o Firebase Storage com timeout estendido de 60s
    await withStorageUploadTimeout(
      uploadBytes(storageRef, blob, {
        contentType: 'image/jpeg',
      }),
      60000
    );

    const downloadUrl = await withStorageUploadTimeout(getDownloadURL(storageRef), 15000);
    return downloadUrl;
  } finally {
    // Libera a referência de memória do Blob nativo no React Native
    if (blob && typeof (blob as any).close === 'function') {
      try {
        (blob as any).close();
      } catch {}
    }
  }
}

/**
 * @deprecated Use uploadReceiptImageToStorage. Não retorna Base64 em caso de erro para evitar gravar Base64 no banco de dados.
 */
export async function uploadToFirebaseStorageOrFallback(
  imageResult: OptimizedImageResult,
  storagePath: string
): Promise<string> {
  return uploadReceiptImageToStorage(imageResult, storagePath);
}

/**
 * Remove com segurança um arquivo do Firebase Cloud Storage a partir de sua URL remota ou caminho.
 * Ignora silenciosamente erros caso o arquivo já não exista (storage/object-not-found).
 */
export async function deleteStorageFile(urlOrPath?: string | null): Promise<void> {
  if (!urlOrPath) return;

  const isStorageUrl =
    urlOrPath.includes('firebasestorage.googleapis.com') ||
    urlOrPath.includes('firebasestorage.app') ||
    urlOrPath.startsWith('gs://');

  if (!isStorageUrl) return;

  try {
    const fileRef = ref(storage, urlOrPath);
    await deleteObject(fileRef);
  } catch (err: unknown) {
    const errorCode = (err as { code?: string })?.code;
    if (errorCode !== 'storage/object-not-found') {
      console.warn('Aviso: falha ao remover arquivo do Firebase Storage:', err);
    }
  }
}
