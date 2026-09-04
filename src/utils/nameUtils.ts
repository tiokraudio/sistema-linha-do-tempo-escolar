/**
 * Utilitários para formatação e abreviação cirúrgica inteligente de nomes em português.
 * Preserva estritamente o tamanho de fonte original configurado (sem redução forçada de escala)
 * e aplica abreviação progressiva de sobrenomes do meio da direita para a esquerda,
 * respeitando margem de segurança lateral de 2% a 4% e quebra em até 2 linhas.
 */

// Preposições e conectivos comuns em nomes em língua portuguesa
const PREPOSITIONS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

// Agnomes (sufixos de parentesco) que acompanham o último sobrenome
const AGNOMES = new Set([
  'filho',
  'filha',
  'neto',
  'neta',
  'sobrinho',
  'sobrinha',
  'junior',
  'júnior',
  'jr',
  'jr.',
  'segundo',
  'segunda',
  'terceiro',
  'terceira',
]);

// Primeiros nomes frequentemente compostos no Brasil
const COMPOUND_FIRST_NAMES = new Set([
  'maria',
  'ana',
  'joao',
  'joão',
  'pedro',
  'luiz',
  'luís',
  'carlos',
  'vitor',
  'vítor',
  'paulo',
  'jose',
  'josé',
  'marcos',
]);

/**
 * Abrevia uma palavra individual mantendo a primeira letra em maiúsculo seguida de ponto,
 * exceto se for preposição/conectivo ("de", "dos", "e").
 * Ex: "FERREIRA" -> "F.", "de" -> "de"
 */
export function abbreviateWord(word: string): string {
  const lower = word.toLowerCase();
  if (PREPOSITIONS.has(lower)) {
    return word;
  }
  const firstChar = word.charAt(0).toUpperCase();
  return `${firstChar}.`;
}

/**
 * Calcula a capacidade segura de caracteres para um card ou caixa de texto,
 * considerando a largura do container, o tamanho da fonte (sem alterá-la),
 * o limite de 2 linhas e uma margem lateral de segurança de 2% a 4%.
 *
 * @param containerWidthPx Largura física do container em pixels
 * @param fontSizePx Tamanho da fonte configurado em pixels (mantido intacto)
 * @param maxLines Número máximo de linhas permitidas (padrão 2)
 * @param safetyMarginPercent Percentual de margem de segurança lateral (padrão 3%)
 */
export function calculateSafeNameCapacity(
  containerWidthPx: number,
  fontSizePx: number,
  maxLines: number = 2,
  safetyMarginPercent: number = 3
): number {
  if (containerWidthPx <= 0 || fontSizePx <= 0) return 28;

  // Largura útil deduzindo a margem de segurança lateral dos dois lados (ex: 3% em cada lado = 6% total)
  const marginFraction = (safetyMarginPercent * 2) / 100;
  const usableWidthPx = containerWidthPx * Math.max(0.90, 1 - marginFraction);

  // Em fontes não monoespaçadas (Montserrat, Sans-Serif, Arial), em caixa alta (uppercase),
  // a largura média ponderada por caractere é de ~0.60 a 0.65 x fontSizePx.
  const averageCharWidthPx = fontSizePx * 0.62;

  // Capacidade por linha
  const charsPerLine = Math.floor(usableWidthPx / averageCharWidthPx);

  // Capacidade total para até maxLines linhas com folga de quebra de palavras (fator 0.90)
  const totalCapacity = Math.floor(charsPerLine * maxLines * 0.90);

  // Garante um valor mínimo seguro de 24 caracteres e teto razoável
  return Math.max(24, Math.min(totalCapacity, 48));
}

/**
 * Abreviação Cirúrgica Progressiva de Nomes para Carômetro e Linha do Tempo.
 *
 * Regras estritas:
 * 1. Preservação Rígida da Fonte: NÃO altera nem reduz a fonte.
 * 2. Se o nome couber no limite (em pixels via Canvas 2D ou número seguro de caracteres), retorna o nome original 100% intacto.
 * 3. Mantém SEMPRE o primeiro nome e o último sobrenome (incluindo agnomes como Filho, Neto, Jr.).
 * 4. Aplica abreviação cirúrgica progressiva APENAS nos sobrenomes intermediários, DA DIREITA PARA A ESQUERDA:
 *    - Inicia abreviando o sobrenome intermediário mais próximo do final.
 *    - A cada sobrenome abreviado, verifica se o nome já cabe no espaço estipulado.
 *    - Se couber, interrompe imediatamente a abreviação para preservar o máximo do nome original.
 * 5. Se após abreviar todos os intermediários ainda não couber:
 *    - Caso haja segundo nome em nome composto ou partícula (ex: "Santos" em "Yanne dos Santos"),
 *      abrevia também esse componente para garantir o encaixe nas 2 linhas.
 *
 * @param fullName Nome completo a ser formatado
 * @param limitOrPredicate Limite em caracteres (número) ou função predicada de teste de encaixe real (Canvas 2D)
 */
export function progressiveAbbreviateName(
  fullName: string | undefined | null,
  limitOrPredicate: number | ((candidate: string) => boolean) = 28
): string {
  if (!fullName) return '';
  const trimmed = fullName.trim().replace(/\s+/g, ' ');

  const isSatisfied =
    typeof limitOrPredicate === 'function'
      ? limitOrPredicate
      : (candidate: string) => candidate.length <= limitOrPredicate;

  if (isSatisfied(trimmed)) {
    return trimmed;
  }

  const rawTokens = trimmed.split(' ');
  if (rawTokens.length <= 2) {
    // Apenas primeiro e último nome: não há intermediários para abreviar
    return trimmed;
  }

  // 1. Identificar se o último token é um agnome (Filho, Neto, Júnior, etc.)
  let hasAgnome = false;
  const lastTokenLower = rawTokens[rawTokens.length - 1].toLowerCase().replace(/\.$/, '');
  if (AGNOMES.has(lastTokenLower) && rawTokens.length >= 3) {
    hasAgnome = true;
  }

  // Ponto onde começa o último sobrenome
  const lastPartStart = hasAgnome ? rawTokens.length - 2 : rawTokens.length - 1;

  // 2. Identificar onde termina o primeiro nome
  let firstPartEnd = 1;
  const firstTokenLower = rawTokens[0].toLowerCase();

  // Se o primeiro nome for composto tradicional (ex: "Maria Eduarda", "João Pedro")
  if (
    COMPOUND_FIRST_NAMES.has(firstTokenLower) &&
    rawTokens.length >= lastPartStart + 1 &&
    !PREPOSITIONS.has(rawTokens[1].toLowerCase())
  ) {
    firstPartEnd = 2;
  }
  // Se após o primeiro nome vier preposição + nome (ex: "Yanne dos Santos Ferreira...")
  else if (
    rawTokens.length >= 5 &&
    PREPOSITIONS.has(rawTokens[1].toLowerCase()) &&
    !PREPOSITIONS.has(rawTokens[2].toLowerCase()) &&
    2 < lastPartStart
  ) {
    firstPartEnd = 3; // "Yanne dos Santos"
  }

  // 3. Obter índices de tokens intermediários que são elegíveis para abreviação (não-preposições)
  const middleIndices: number[] = [];
  for (let i = firstPartEnd; i < lastPartStart; i++) {
    if (!PREPOSITIONS.has(rawTokens[i].toLowerCase())) {
      middleIndices.push(i);
    }
  }

  // Se não houver intermediários livres e o primeiro nome foi considerado composto, recuar firstPartEnd
  if (middleIndices.length === 0 && firstPartEnd > 1) {
    firstPartEnd = 1;
    for (let i = firstPartEnd; i < lastPartStart; i++) {
      if (!PREPOSITIONS.has(rawTokens[i].toLowerCase())) {
        middleIndices.push(i);
      }
    }
  }

  if (middleIndices.length === 0) {
    return trimmed;
  }

  // 4. Abreviação cirúrgica progressiva da direita para a esquerda:
  // Clonamos os tokens e iteramos pelos índices intermediários em ordem reversa
  const tokens = [...rawTokens];
  const reverseIndices = [...middleIndices].reverse();

  for (const idx of reverseIndices) {
    tokens[idx] = abbreviateWord(tokens[idx]);
    const candidate = tokens.join(' ').replace(/\s+/g, ' ').trim();
    if (isSatisfied(candidate)) {
      return candidate;
    }
  }

  // 5. Se ainda não couber e tínhamos preservado "dos Santos" (firstPartEnd === 3)
  if (firstPartEnd === 3) {
    tokens[2] = abbreviateWord(tokens[2]); // Abrevia "Santos" -> "S."
    const candidate = tokens.join(' ').replace(/\s+/g, ' ').trim();
    if (isSatisfied(candidate)) {
      return candidate;
    }
  }

  // 6. Se ainda não couber e o primeiro nome era composto (ex: "Maria Eduarda")
  if (firstPartEnd === 2) {
    tokens[1] = abbreviateWord(tokens[1]); // Abrevia "Eduarda" -> "E."
    const candidate = tokens.join(' ').replace(/\s+/g, ' ').trim();
    if (isSatisfied(candidate)) {
      return candidate;
    }
  }

  return tokens.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Alias compatível para smartAbbreviateName
 */
export const smartAbbreviateName = progressiveAbbreviateName;

/**
 * Determina o limite seguro de caracteres para o Carômetro baseado nas dimensões reais do card
 * e orientação, garantindo que o nome quebre harmoniosamente em até 2 linhas
 * respeitando margem lateral de 2% a 4%.
 */
export function getCarometroSafeNameLength(
  isLandscape: boolean,
  isPrintMode: boolean,
  safetyMarginPercent: number = 3
): number {
  if (isPrintMode) {
    if (isLandscape) {
      // Container 360px, Font 31px
      return calculateSafeNameCapacity(360, 31, 2, safetyMarginPercent);
    } else {
      // Container 388px, Font 34px
      return calculateSafeNameCapacity(388, 34, 2, safetyMarginPercent);
    }
  } else {
    if (isLandscape) {
      // Container 115px, Font 10px
      return calculateSafeNameCapacity(115, 10, 2, safetyMarginPercent);
    } else {
      // Container 124px, Font 11px
      return calculateSafeNameCapacity(124, 11, 2, safetyMarginPercent);
    }
  }
}
