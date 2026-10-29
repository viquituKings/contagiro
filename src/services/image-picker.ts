import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Alert } from 'react-native';
import { ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from '@/services/firebase';

export interface OptimizedImageResult {
  /** URI local em cache no dispositivo */
  uri: string;
  /** Data URI em Base64 pronta para salvar diretamente no banco de dados (Firestore / AsyncStorage) */
  base64Uri: string;
  width: number;
  height: number;
}

export type ImageSourceType = 'camera' | 'gallery';

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
    const storageRef = ref(storage, storagePath);

    if (imageResult.base64Uri && imageResult.base64Uri.startsWith('data:')) {
      await uploadString(storageRef, imageResult.base64Uri, 'data_url');
    } else {
      const response = await fetch(imageResult.uri);
      const blob = await response.blob();
      await uploadBytes(storageRef, blob, {
        contentType: 'image/jpeg',
      });
    }

    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (error) {
    console.warn(
      'Aviso: Não foi possível enviar para o Firebase Storage (o bucket pode não estar configurado). Utilizando Base64 comprimida no banco de dados:',
      error
    );
    // Como a imagem foi comprimida para ~25KB, ela cabe com extrema folga no Firestore/AsyncStorage
    return imageResult.base64Uri;
  }
}
