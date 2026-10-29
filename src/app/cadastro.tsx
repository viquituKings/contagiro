import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { getFirebaseAuthErrorMessage } from '@/utils/firebase-errors';
import { pickAndOptimizeImage, promptImageSource } from '@/services/image-picker';

export default function RegisterScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { registerWithEmail, loginWithGoogle } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);

  const theme = {
    bg: isDark ? '#090D16' : '#F8FAFC',
    card: isDark ? '#141D2E' : '#FFFFFF',
    cardBorder: isDark ? '#1E2D44' : '#E2E8F0',
    inputBg: isDark ? '#0B132B' : '#F1F5F9',
    text: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    accent: '#10B981',
    border: isDark ? '#1E293B' : '#E2E8F0',
  };

  const handleSelectAvatar = async () => {
    const source = await promptImageSource();
    if (!source) return;
    setAvatarLoading(true);
    try {
      const result = await pickAndOptimizeImage(source, { targetSize: 320, compress: 0.7 });
      if (result) {
        setAvatarUri(result.base64Uri);
      }
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim()) {
      Alert.alert('Atenção', 'Informe seu nome completo.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Atenção', 'Informe seu endereço de e-mail.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Senha Fraca', 'A senha deve conter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Senhas Divergentes', 'A confirmação de senha não confere com a senha digitada.');
      return;
    }

    setLoading(true);
    try {
      await registerWithEmail(email, password, name, avatarUri || undefined);
      Alert.alert('Sucesso', 'Sua conta foi criada com sucesso!', [
        {
          text: 'Continuar',
          onPress: () => router.replace('/(tabs)'),
        },
      ]);
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const msg = err.code ? getFirebaseAuthErrorMessage(err.code) : (err.message || 'Erro ao realizar cadastro.');
      Alert.alert('Erro no cadastro', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const loggedIn = await loginWithGoogle();
      if (loggedIn) {
        router.replace('/(tabs)');
      }
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const msg = err.code ? getFirebaseAuthErrorMessage(err.code) : (err.message || 'Erro ao autenticar com o Google.');
      Alert.alert('Google Sign-in', msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* BOTÃO VOLTAR */}
          <TouchableOpacity
            style={[styles.backBtn, { borderColor: theme.border }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color={theme.text} />
            <Text style={[styles.backBtnText, { color: theme.text }]}>Voltar ao Login</Text>
          </TouchableOpacity>

          {/* CABEÇALHO */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Crie sua conta</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              Comece a controlar o consumo e a saúde do seu veículo
            </Text>
          </View>

          {/* CARD DE CADASTRO */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            {/* AVATAR DO USUÁRIO */}
            <View style={styles.avatarPickerContainer}>
              <TouchableOpacity
                style={[
                  styles.avatarCircle,
                  { backgroundColor: theme.inputBg, borderColor: avatarUri ? theme.accent : theme.border },
                ]}
                onPress={handleSelectAvatar}
                disabled={avatarLoading}
                activeOpacity={0.8}
              >
                {avatarLoading ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={42} color={theme.textMuted} />
                )}
                <View style={[styles.avatarCameraBadge, { backgroundColor: theme.accent }]}>
                  <Ionicons name="camera" size={15} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              <Text style={[styles.avatarHint, { color: theme.textMuted }]}>
                {avatarUri ? 'Foto de perfil adicionada (toque para alterar)' : 'Toque para adicionar foto de perfil'}
              </Text>
              {avatarUri && (
                <TouchableOpacity onPress={() => setAvatarUri(null)} style={{ marginTop: 4 }}>
                  <Text style={styles.removePhotoText}>Remover foto</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* NOME COMPLETO */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Nome Completo</Text>
              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: theme.inputBg, borderColor: theme.border },
                ]}
              >
                <Ionicons name="person-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Ex: João da Silva"
                  placeholderTextColor={theme.textMuted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* E-MAIL */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textMuted }]}>E-mail</Text>
              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: theme.inputBg, borderColor: theme.border },
                ]}
              >
                <Ionicons name="mail-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="seu@email.com"
                  placeholderTextColor={theme.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* SENHA */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Senha (mínimo 6 dígitos)</Text>
              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: theme.inputBg, borderColor: theme.border },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Crie uma senha forte"
                  placeholderTextColor={theme.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={theme.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* CONFIRMAÇÃO DE SENHA */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Confirmar Senha</Text>
              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: theme.inputBg, borderColor: theme.border },
                ]}
              >
                <Ionicons name="shield-checkmark-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Repita sua senha"
                  placeholderTextColor={theme.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* BOTÃO CADASTRAR */}
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: theme.accent, opacity: loading ? 0.7 : 1 },
              ]}
              onPress={handleRegister}
              disabled={loading || googleLoading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryBtnText}>Criar Minha Conta</Text>
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>

            {/* DIVISOR OU */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.textMuted }]}>OU</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            {/* BOTÃO GOOGLE */}
            <TouchableOpacity
              style={[
                styles.googleBtn,
                {
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                  borderColor: theme.border,
                  opacity: googleLoading ? 0.7 : 1,
                },
              ]}
              onPress={handleGoogleLogin}
              disabled={loading || googleLoading}
              activeOpacity={0.8}
            >
              {googleLoading ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color="#EA4335" />
                  <Text style={[styles.googleBtnText, { color: theme.text }]}>
                    Cadastrar com o Google
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* RODAPÉ */}
          <View style={styles.footerRow}>
            <Text style={[styles.footerText, { color: theme.textMuted }]}>
              Já possui uma conta?
            </Text>
            <TouchableOpacity onPress={() => router.push('/login')}>
              <Text style={[styles.footerLink, { color: theme.accent }]}>Fazer Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 6,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  eyeBtn: {
    padding: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 14,
    fontSize: 12,
    fontWeight: '700',
  },
  googleBtn: {
    flexDirection: 'row',
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '800',
  },
  avatarPickerContainer: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  avatarImage: {
    width: 86,
    height: 86,
    borderRadius: 43,
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  avatarHint: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  removePhotoText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
});
