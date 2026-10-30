/**
 * Utilitários para tratamento inteligente de cilindrada / motorização de veículos (carros e motos).
 * Aceita tanto formatos em cilindrada (1000, 1600, 1800, 250, 160)
 * quanto em litros (1.0, 1,0, 1.6, 1,6, 1.8, 1,8, 2.0, 2,0, etc.).
 * Converte sempre para o valor inteiro em cilindradas (cc).
 */
export function parseEngineDisplacement(input?: unknown): number | undefined {
  if (input == null) return undefined;
  if (typeof input === 'number') {
    if (isNaN(input) || input <= 0) return undefined;
    return input <= 12 ? Math.round(input * 1000) : Math.round(input);
  }

  const trimmed = String(input).trim();
  if (!trimmed) return undefined;

  // Remove caracteres que não sejam dígitos, ponto ou vírgula (ex: remove "cc", "L", espaços)
  const clean = trimmed.replace(/[^\d.,]/g, '').replace(',', '.');
  if (!clean) return undefined;

  const val = parseFloat(clean);
  if (isNaN(val) || val <= 0) return undefined;

  // Se o valor for <= 12 (ex: 1.0, 1.6, 1.8, 2.0, 2.4, etc.)
  if (val <= 12) {
    return Math.round(val * 1000);
  }

  // Caso seja um número já em cc (ex: 160, 250, 1000, 1600, 1800)
  return Math.round(val);
}

/**
 * Formata a cilindrada para exibição no padrão do app (ex: "1000cc", "1600cc", "160cc").
 * Garante a conversão para cilindradas caso o valor venha em litros ou formato string.
 */
export function formatEngineDisplacement(displacement?: unknown): string {
  const parsed = parseEngineDisplacement(displacement);
  if (!parsed || parsed <= 0) return '';
  return `${parsed}cc`;
}
