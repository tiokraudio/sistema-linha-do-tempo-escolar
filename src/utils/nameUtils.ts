/**
 * Parser Nominal Progressivo Baseado em Pixels para Nomes em Língua Portuguesa.
 *
 * REGRAS DO PARSER LINGUÍSTICO (Sem listas fixas de nomes):
 * 1. Preservar SEMPRE:
 *    - Primeiro Nome: se o nome tiver 4 ou mais palavras (ou 3 palavras completas),
 *      considera as duas primeiras como nome composto por padrão (ex: "JOÃO PEDRO", "MARIA EDUARDA").
 *    - Último Sobrenome.
 *    - Agnomes: FILHO, NETO, JÚNIOR, JR, SOBRINHO, etc. (NUNCA abreviados).
 *    - Partículas: DE, DA, DO, DAS, DOS, E. (Partículas NUNCA viram D. ou E., acompanham o sobrenome: "DOS SANTOS" -> "DOS S.").
 *
 * 2. Abreviar PRIMEIRO (apenas se a medição em pixels exigir):
 *    - Sobrenomes intermediários, um a um, da direita para a esquerda.
 *    - Regra de abreviação: Primeira letra exata (mantendo acento) + ponto. Ex: "FERREIRA" -> "F.", "DOS SANTOS" -> "DOS S."
 *
 * 3. Progressão Estrita:
 *    - A cada componente abreviado, remonta a string e testa no Canvas 2D. Se couber, PARA e retorna.
 *    - Se o nome tiver apenas 2 componentes (ex: "JOÃO SILVA", "JOSÉ DA SILVA") e não couber,
 *      NÃO abrevia para "JOÃO S." nem invente iniciais. Retorne o original e deixa o CSS dar clip visual.
 *    - É ESTRITAMENTE PROIBIDO o uso de reticências ("...").
 */

// Partículas e conectivos gramaticais do português brasileiro
export const PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

// Agnomes (sufixos de parentesco) que acompanham a linhagem familiar
export const AGNOMES = new Set([
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

export interface SemanticComponent {
  particle?: string; // e.g. "DOS", "DE", "DA", "E"
  word: string;      // e.g. "SANTOS", "SILVA", "COSTA", "CARLOS"
  isAgnome?: boolean;
}

/**
 * Realiza o parsing semântico do nome dividindo-o em componentes preservando a vinculação de partículas.
 */
export function parseNameComponents(name: string): SemanticComponent[] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const components: SemanticComponent[] = [];
  let i = 0;

  while (i < words.length) {
    const currentWord = words[i];
    const lower = currentWord.toLowerCase();

    // Se for partícula ("DE", "DA", "DO", "DAS", "DOS", "E") vincula à palavra seguinte
    if (PARTICLES.has(lower) && i + 1 < words.length) {
      const nextWord = words[i + 1];
      const nextClean = nextWord.toLowerCase().replace(/\.$/, '');
      const isAgnome = AGNOMES.has(nextClean);
      components.push({
        particle: currentWord,
        word: nextWord,
        isAgnome,
      });
      i += 2;
    } else {
      const clean = lower.replace(/\.$/, '');
      const isAgnome = AGNOMES.has(clean);
      components.push({
        word: currentWord,
        isAgnome,
      });
      i++;
    }
  }

  return components;
}

/**
 * Renderiza um componente nominal de forma completa ou cirurgicamente abreviada.
 * A partícula SEMPRE acompanha a abreviação:
 * - "DOS SANTOS" -> "DOS S."
 * - "E SILVA" -> "E S."
 * - "FERREIRA" -> "F."
 */
export function renderComponent(comp: SemanticComponent, abbreviated: boolean): string {
  if (!abbreviated) {
    return comp.particle ? `${comp.particle} ${comp.word}` : comp.word;
  }
  const firstChar = comp.word.charAt(0);
  return comp.particle ? `${comp.particle} ${firstChar}.` : `${firstChar}.`;
}

/**
 * Reconstrói a string nominal completa a partir do array de componentes e do conjunto de índices abreviados.
 */
export function buildCandidateName(components: SemanticComponent[], abbreviatedIndices: Set<number>): string {
  return components
    .map((comp, idx) => renderComponent(comp, abbreviatedIndices.has(idx)))
    .join(' ')
    .trim();
}

/**
 * Abreviação Progressiva Baseada em Pixels.
 *
 * @param fullName Nome completo a ser avaliado
 * @param limitOrPredicate Limite numérico ou função predicada (Canvas 2D) que avalia se a string cabe
 */
export function progressiveAbbreviateName(
  fullName: string | undefined | null,
  limitOrPredicate: number | ((candidate: string) => boolean) = 28
): string {
  if (!fullName) return '';
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  const isSatisfied =
    typeof limitOrPredicate === 'function'
      ? limitOrPredicate
      : (candidate: string) => candidate.length <= limitOrPredicate;

  // REGRA DE OURO 1: O algoritmo NUNCA deve abreviar um nome apenas por ter muitos caracteres.
  // Se couber no espaço real, retorne o nome 100% original.
  if (isSatisfied(trimmed)) {
    return trimmed;
  }

  const rawWords = trimmed.split(/\s+/);
  const components = parseNameComponents(trimmed);

  // REGRA DE OURO 3: Se o nome tiver apenas 2 componentes (ex: "JOÃO SILVA", "JOSÉ DA SILVA") e não couber,
  // NÃO abrevie para "JOÃO S." nem invente iniciais. Retorne o original e deixe o CSS dar clip visual (sem ...).
  if (components.length <= 2) {
    return trimmed;
  }

  const lastIndex = components.length - 1;
  const hasAgnome = !!components[lastIndex].isAgnome;
  const lastSurnameIndex = hasAgnome ? lastIndex - 1 : lastIndex;

  // Primeiro Nome: Se tiver 4 ou mais palavras (ou 3 palavras completas como "MARIA EDUARDA SILVA"),
  // considera os dois primeiros como nome composto por padrão (preservar SEMPRE primeiro nome).
  const isCompoundFirstName = rawWords.length >= 4 || (rawWords.length === 3 && components.length === 3);
  const firstNameEndIndex = isCompoundFirstName ? 2 : 1;

  // Sobrenomes intermediários elegíveis para abreviação inicial
  // Da direita para a esquerda: do índice anterior ao último sobrenome até firstNameEndIndex
  const middleIndices: number[] = [];
  for (let i = firstNameEndIndex; i < lastSurnameIndex; i++) {
    middleIndices.push(i);
  }

  const abbreviatedSet = new Set<number>();

  // ETAPA 1: Abreviar sobrenomes intermediários, um a um, da direita para a esquerda
  if (middleIndices.length > 0) {
    const reverseMiddle = [...middleIndices].reverse();
    for (const idx of reverseMiddle) {
      abbreviatedSet.add(idx);
      const candidate = buildCandidateName(components, abbreviatedSet);
      if (isSatisfied(candidate)) {
        return candidate;
      }
    }
    // Para nomes com sobrenomes intermediários, o primeiro nome e o último sobrenome são estritamente preservados
    return buildCandidateName(components, abbreviatedSet);
  }

  // ETAPA 2: Nomes sem sobrenomes intermediários entre o primeiro nome e o último sobrenome:
  // Caso A: Presença de Agnome (ex: "JOÃO CARLOS DE SOUZA JÚNIOR")
  // "DE SOUZA" e "JÚNIOR" são estritamente protegidos.
  // Abrevia o segundo componente do primeiro nome ("CARLOS" -> "C.")
  if (hasAgnome && isCompoundFirstName && components.length > 2) {
    abbreviatedSet.add(1);
    const candidate = buildCandidateName(components, abbreviatedSet);
    if (isSatisfied(candidate)) {
      return candidate;
    }
    return candidate;
  }

  // Caso B: 3 componentes sem agnome (ex: "MARIA EDUARDA SILVA")
  // Primeiro nome composto "MARIA EDUARDA" é preservado; se não couber, abrevia o último sobrenome ("SILVA" -> "S.")
  if (!hasAgnome && components.length === 3) {
    abbreviatedSet.add(2);
    const candidate = buildCandidateName(components, abbreviatedSet);
    if (isSatisfied(candidate)) {
      return candidate;
    }
    return candidate;
  }

  // Retorna a string montada sem NUNCA usar reticências "..."
  return buildCandidateName(components, abbreviatedSet);
}

/**
 * Alias de compatibilidade
 */
export const smartAbbreviateName = progressiveAbbreviateName;

/**
 * Calcula a capacidade segura de caracteres para um card ou caixa de texto,
 * mantendo o tamanho da fonte intacto e respeitando margem lateral de segurança de 2% a 4%.
 */
export function calculateSafeNameCapacity(
  containerWidthPx: number,
  fontSizePx: number,
  maxLines: number = 2,
  safetyMarginPercent: number = 3
): number {
  if (containerWidthPx <= 0 || fontSizePx <= 0) return 28;

  const marginFraction = (safetyMarginPercent * 2) / 100;
  const usableWidthPx = containerWidthPx * Math.max(0.90, 1 - marginFraction);
  const averageCharWidthPx = fontSizePx * 0.62;
  const charsPerLine = Math.floor(usableWidthPx / averageCharWidthPx);
  const totalCapacity = Math.floor(charsPerLine * maxLines * 0.90);

  return Math.max(24, Math.min(totalCapacity, 48));
}

/**
 * Determina o limite seguro de caracteres para o Carômetro baseado nas dimensões reais do card
 */
export function getCarometroSafeNameLength(
  isLandscape: boolean,
  isPrintMode: boolean,
  safetyMarginPercent: number = 3
): number {
  if (isPrintMode) {
    if (isLandscape) {
      return calculateSafeNameCapacity(360, 31, 2, safetyMarginPercent);
    } else {
      return calculateSafeNameCapacity(388, 34, 2, safetyMarginPercent);
    }
  } else {
    if (isLandscape) {
      return calculateSafeNameCapacity(115, 10, 2, safetyMarginPercent);
    } else {
      return calculateSafeNameCapacity(124, 11, 2, safetyMarginPercent);
    }
  }
}
