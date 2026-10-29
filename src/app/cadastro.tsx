import React, { useState, useRef, useEffect } from 'react';
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
  Keyboard,
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

  // Controle de teclado e foco para evidenciar campos
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [focusedField, setFocusedField] = useState<'name' | 'email' | 'password' | 'confirmPassword' | null>(null);

  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const nameInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const emailInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const passwordInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const confirmPasswordInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const cardY = useRef<number>(0);
  const fieldOffsets = useRef<{ [key: string]: number }>({});
  const focusedFieldRef = useRef<'name' | 'email' | 'password' | 'confirmPassword' | null>(null);

  useEffect(() => {
    focusedFieldRef.current = focusedField;
  }, [focusedField]);

  const theme = {
    bg: isDark ? '#090D16' : '#F8FAFC',
    card: isDark ? '#141D2E' : '#FFFFFF',
    cardBorder: isDark ? '#1E2D44' : '#E2E8F0',
    inputBg: isDark ? '#0B132B' : '#F1F5F9',
    text: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    accent: '#10B981',
    border: isDark ? '#1E293B' : '#E2E8F0',
    focusBg: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.05)',
  };

  const scrollToField = (fieldKey: 'name' | 'email' | 'password' | 'confirmPassword') => {
    setFocusedField(fieldKey);
    const y = fieldOffsets.current[fieldKey];
    const defaultOffset = {
      name: 90,
      email: 170,
      password: 250,
      confirmPassword: 330,
    }[fieldKey];

    const targetY = y != null
      ? Math.max(0, cardY.current + y - 20)
      : defaultOffset;

    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
    }, 100);
  };

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates.height);
        if (focusedFieldRef.current) {
          scrollToField(focusedFieldRef.current);
        }
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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

  const isNameFocused = focusedField === 'name';
  const isEmailFocused = focusedField === 'email';
  const isPasswordFocused = focusedField === 'password';
  const isConfirmPasswordFocused = focusedField === 'confirmPassword';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.scrollContent,
            keyboardVisible && styles.scrollContentKeyboardOpen,
            {
              paddingBottom: Platform.OS === 'android' && keyboardVisible
                ? Math.max(keyboardHeight, 260) + 40
                : 40,
            },
          ]}
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
          <View style={[styles.header, keyboardVisible && styles.headerCompact]}>
            <Text style={[styles.title, keyboardVisible && styles.titleCompact, { color: theme.text }]}>
              Crie sua conta
            </Text>
            {!keyboardVisible && (
              <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                Comece a controlar o consumo e a saúde do seu veículo
              </Text>
            )}
          </View>

          {/* CARD DE CADASTRO */}
          <View
            onLayout={(e) => {
              cardY.current = e.nativeEvent.layout.y;
            }}
            style={[
              styles.card,
              keyboardVisible && styles.cardCompact,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            {/* AVATAR DO USUÁRIO */}
            <View style={[styles.avatarPickerContainer, keyboardVisible && styles.avatarPickerContainerCompact]}>
              <TouchableOpacity
                style={[
                  styles.avatarCircle,
                  keyboardVisible && styles.avatarCircleCompact,
                  { backgroundColor: theme.inputBg, borderColor: avatarUri ? theme.accent : theme.border },
                ]}
                onPress={handleSelectAvatar}
                disabled={avatarLoading}
                activeOpacity={0.8}
              >
                {avatarLoading ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={[styles.avatarImage, keyboardVisible && styles.avatarImageCompact]}
                  />
                ) : (
                  <Ionicons
                    name="person"
                    size={keyboardVisible ? 26 : 42}
                    color={theme.textMuted}
                  />
                )}
                <View
                  style={[
                    styles.avatarCameraBadge,
                    keyboardVisible && styles.avatarCameraBadgeCompact,
                    { backgroundColor: theme.accent },
                  ]}
                >
                  <Ionicons name="camera" size={keyboardVisible ? 11 : 15} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              {!keyboardVisible && (
                <Text style={[styles.avatarHint, { color: theme.textMuted }]}>
                  {avatarUri ? 'Foto de perfil adicionada (toque para alterar)' : 'Toque para adicionar foto de perfil'}
                </Text>
              )}
              {avatarUri && !keyboardVisible && (
                <TouchableOpacity onPress={() => setAvatarUri(null)} style={{ marginTop: 4 }}>
                  <Text style={styles.removePhotoText}>Remover foto</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* NOME COMPLETO */}
            <View
              style={styles.inputGroup}
              onLayout={(e) => {
                fieldOffsets.current['name'] = e.nativeEvent.layout.y;
              }}
            >
              <Text style={[styles.inputLabel, { color: isNameFocused ? theme.accent : theme.textMuted }]}>
                Nome Completo
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: isNameFocused ? theme.focusBg : theme.inputBg,
                    borderColor: isNameFocused ? theme.accent : theme.border,
                    borderWidth: isNameFocused ? 1.5 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={isNameFocused ? theme.accent : theme.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={nameInputRef}
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Ex: João da Silva"
                  placeholderTextColor={theme.textMuted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onFocus={() => scrollToField('name')}
                  onBlur={() => setFocusedField(null)}
                  onSubmitEditing={() => emailInputRef.current?.focus()}
                />
              </View>
            </View>

            {/* E-MAIL */}
            <View
              style={styles.inputGroup}
              onLayout={(e) => {
                fieldOffsets.current['email'] = e.nativeEvent.layout.y;
              }}
            >
              <Text style={[styles.inputLabel, { color: isEmailFocused ? theme.accent : theme.textMuted }]}>
                E-mail
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: isEmailFocused ? theme.focusBg : theme.inputBg,
                    borderColor: isEmailFocused ? theme.accent : theme.border,
                    borderWidth: isEmailFocused ? 1.5 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={isEmailFocused ? theme.accent : theme.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={emailInputRef}
                  style={[styles.input, { color: theme.text }]}
                  placeholder="seu@email.com"
                  placeholderTextColor={theme.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  returnKeyType="next"
                  onFocus={() => scrollToField('email')}
                  onBlur={() => setFocusedField(null)}
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                />
              </View>
            </View>

            {/* SENHA */}
            <View
              style={styles.inputGroup}
              onLayout={(e) => {
                fieldOffsets.current['password'] = e.nativeEvent.layout.y;
              }}
            >
              <Text style={[styles.inputLabel, { color: isPasswordFocused ? theme.accent : theme.textMuted }]}>
                Senha (mínimo 6 dígitos)
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: isPasswordFocused ? theme.focusBg : theme.inputBg,
                    borderColor: isPasswordFocused ? theme.accent : theme.border,
                    borderWidth: isPasswordFocused ? 1.5 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={isPasswordFocused ? theme.accent : theme.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={passwordInputRef}
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Crie uma senha forte"
                  placeholderTextColor={theme.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="next"
                  onFocus={() => scrollToField('password')}
                  onBlur={() => setFocusedField(null)}
                  onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={isPasswordFocused ? theme.accent : theme.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* CONFIRMAÇÃO DE SENHA */}
            <View
              style={styles.inputGroup}
              onLayout={(e) => {
                fieldOffsets.current['confirmPassword'] = e.nativeEvent.layout.y;
              }}
            >
              <Text style={[styles.inputLabel, { color: isConfirmPasswordFocused ? theme.accent : theme.textMuted }]}>
                Confirmar Senha
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: isConfirmPasswordFocused ? theme.focusBg : theme.inputBg,
                    borderColor: isConfirmPasswordFocused ? theme.accent : theme.border,
                    borderWidth: isConfirmPasswordFocused ? 1.5 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color={isConfirmPasswordFocused ? theme.accent : theme.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={confirmPasswordInputRef}
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Repita sua senha"
                  placeholderTextColor={theme.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onFocus={() => scrollToField('confirmPassword')}
                  onBlur={() => setFocusedField(null)}
                  onSubmitEditing={handleRegister}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={isConfirmPasswordFocused ? theme.accent : theme.textMuted}
                  />
                </TouchableOpacity>
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
    paddingTop: 16,
    paddingBottom: 40,
    flexGrow: 1,
  },
  scrollContentKeyboardOpen: {
    paddingTop: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    marginBottom: 20,
  },
  headerCompact: {
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  titleCompact: {
    fontSize: 22,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
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
  cardCompact: {
    padding: 18,
    borderRadius: 20,
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
    marginVertical: 18,
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
    marginTop: 20,
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
    marginBottom: 18,
    marginTop: 2,
  },
  avatarPickerContainerCompact: {
    marginBottom: 10,
    marginTop: 0,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  avatarCircleCompact: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  avatarImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  avatarImageCompact: {
    width: 54,
    height: 54,
    borderRadius: 27,
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
  avatarCameraBadgeCompact: {
    width: 20,
    height: 20,
    borderRadius: 10,
    bottom: -2,
    right: -2,
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
