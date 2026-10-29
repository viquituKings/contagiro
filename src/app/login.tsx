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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { getFirebaseAuthErrorMessage } from '@/utils/firebase-errors';

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { loginWithEmail, loginWithGoogle, resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const theme = {
    bg: isDark ? '#090D16' : '#F8FAFC',
    card: isDark ? '#141D2E' : '#FFFFFF',
    cardBorder: isDark ? '#1E2D44' : '#E2E8F0',
    inputBg: isDark ? '#0B132B' : '#F1F5F9',
    text: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    accent: '#10B981',
    accentHover: '#059669',
    border: isDark ? '#1E293B' : '#E2E8F0',
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Campos obrigatórios', 'Por favor, informe seu e-mail e sua senha.');
      return;
    }

    setLoading(true);
    try {
      await loginWithEmail(email, password);
      router.replace('/(tabs)');
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const msg = err.code ? getFirebaseAuthErrorMessage(err.code) : (err.message || 'Erro ao realizar login.');
      Alert.alert('Erro ao entrar', msg);
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

  const handleForgotPassword = () => {
    if (!email.trim()) {
      Alert.alert(
        'Recuperação de Senha',
        'Digite seu e-mail no campo acima antes de clicar em recuperar senha.'
      );
      return;
    }

    Alert.alert(
      'Redefinir Senha',
      `Deseja enviar um link de redefinição para o e-mail: ${email.trim()}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          onPress: async () => {
            try {
              await resetPassword(email);
              Alert.alert(
                'E-mail Enviado',
                'Verifique sua caixa de entrada (e spam) para redefinir a sua senha.'
              );
            } catch (error: unknown) {
              const err = error as { code?: string };
              const msg = err.code ? getFirebaseAuthErrorMessage(err.code) : 'Falha ao enviar e-mail de recuperação.';
              Alert.alert('Erro', msg);
            }
          },
        },
      ]
    );
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
          {/* HEADER / LOGO */}
          <View style={styles.brandHeader}>
            <View style={[styles.logoIconBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Ionicons name="speedometer" size={44} color={theme.accent} />
            </View>
            <Text style={[styles.brandTitle, { color: theme.text }]}>Contagiro</Text>
            <Text style={[styles.brandSubtitle, { color: theme.textMuted }]}>
              Gestão de combustível, consumo e manutenções
            </Text>
          </View>

          {/* CARD DE LOGIN */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.text }]}>Acesse sua conta</Text>

            {/* CAMPO DE E-MAIL */}
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

            {/* CAMPO DE SENHA */}
            <View style={styles.inputGroup}>
              <View style={styles.passwordLabelRow}>
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Senha</Text>
                <TouchableOpacity onPress={handleForgotPassword}>
                  <Text style={[styles.forgotPasswordText, { color: theme.accent }]}>
                    Esqueceu a senha?
                  </Text>
                </TouchableOpacity>
              </View>
              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: theme.inputBg, borderColor: theme.border },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Sua senha secreta"
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

            {/* BOTÃO ENTRAR */}
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: theme.accent, opacity: loading ? 0.7 : 1 },
              ]}
              onPress={handleLogin}
              disabled={loading || googleLoading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryBtnText}>Entrar</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
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
                    Continuar com o Google
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* RODAPÉ DIRECIONANDO AO CADASTRO */}
          <View style={styles.footerRow}>
            <Text style={[styles.footerText, { color: theme.textMuted }]}>
              Ainda não possui uma conta?
            </Text>
            <TouchableOpacity onPress={() => router.push('/cadastro')}>
              <Text style={[styles.footerLink, { color: theme.accent }]}>Cadastre-se</Text>
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
    paddingTop: 40,
    paddingBottom: 30,
    minHeight: '100%',
    justifyContent: 'center',
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoIconBadge: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
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
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  forgotPasswordText: {
    fontSize: 12,
    fontWeight: '700',
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
    marginTop: 28,
  },
  footerText: {
    fontSize: 14,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '800',
  },
});
