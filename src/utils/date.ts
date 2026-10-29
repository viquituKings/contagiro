/**
 * Utilitários para formatação e manipulação de datas no padrão brasileiro (DD/MM/AAAA)
 */

/**
 * Converte qualquer string de data válida (YYYY-MM-DD, ISO 8601, etc.) para o formato brasileiro DD/MM/AAAA.
 * Se a string já estiver no formato DD/MM/AAAA, ela é retornada diretamente.
 * Usa expressões regulares primeiro para evitar bugs de fuso horário (ex: UTC convertendo dia anterior).
 */
export function formatDateToBR(dateStr?: string | null): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (!trimmed) return '';

  // Já no formato DD/MM/AAAA
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    return `${brMatch[1]}/${brMatch[2]}/${brMatch[3]}`;
  }

  // Formato ISO YYYY-MM-DD ou YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }

  // Fallback seguro via objeto Date
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}/${month}/${year}`;
  }

  return trimmed;
}

/**
 * Converte uma data em string (DD/MM/AAAA, YYYY-MM-DD, etc.) em timestamp numérico (ms) para comparação/ordenação.
 */
export function parseDateToTimestamp(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const trimmed = dateStr.trim();
  if (!trimmed) return 0;

  // DD/MM/AAAA
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }

  // YYYY-MM-DD ou YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }

  const parsed = new Date(trimmed).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Compara dois itens contendo `date` e opcionalmente `odometer` em ordem decrescente (mais recente para mais antigo).
 */
export function compareDatesDesc<T extends { date: string; odometer?: number }>(a: T, b: T): number {
  const timeA = parseDateToTimestamp(a.date);
  const timeB = parseDateToTimestamp(b.date);
  if (timeB !== timeA) {
    return timeB - timeA;
  }
  return (b.odometer || 0) - (a.odometer || 0);
}

