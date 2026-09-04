/**
 * Parser Nominal Progressivo Baseado em Pixels para Nomes em Língua Portuguesa.
 *
 * REGRAS DO PARSER LINGUÍSTICO:
 * 1. Preservar SEMPRE:
 *    - Primeiro prenome: Componente 0 é estritamente protegido.
 *    - Último sobrenome: O sobrenome familiar final é estritamente protegido de abreviação.
 *    - Agnomes: FILHO, FILHA, NETO, NETA, SOBRINHO, SOBRINHA, JÚNIOR, JR, SEGUNDO, SEGUNDA, TERCEIRO, TERCEIRA (NUNCA abreviados).
 *    - Partículas: DE, DA, DO, DAS, DOS, E. (Partículas NUNCA viram D. ou E., acompanham o sobrenome: "DOS SANTOS" -> "DOS S.", "DA CONCEIÇÃO" -> "DA C.").
 *
 * 2. Princípio Fundamental de Medição:
 *    - O algoritmo NUNCA abrevia um nome apenas por ter muitas palavras ou muitos caracteres.
 *    - Primeiro mede o nome COMPLETO na largura real disponível. Se couber, RETORNA O NOME ORIGINAL.
 *
 * 3. Ordem de Abreviação Semântica Progressiva (Mínima Perda de Informação):
 *    - Candidatos elegíveis: componentes intermediários situados entre o primeiro prenome e o último sobrenome da família.
 *    - Testa da direita para a esquerda, um a um.
 *    - A cada componente abreviado, remonta a string e remede no Canvas 2D.
 *    - PARAR IMEDIATAMENTE assim que a primeira versão válida couber na largura útil.
 *    - É ESTRITAMENTE PROIBIDO o uso de reticências ("...") ou cortes visuais (como "BARTOLOM").
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
 * Realiza o parsing semântico do nome dividindo-o em componentes e vinculando partículas gramaticais.
 * Ex:
 * "SÂMYLA SILVA FERNANDES DA CONCEIÇÃO MIRANDA BARTOLOMEU" ->
 * [
 *   { word: "SÂMYLA" },
 *   { word: "SILVA" },
 *   { word: "FERNANDES" },
 *   { particle: "DA", word: "CONCEIÇÃO" },
 *   { word: "MIRANDA" },
 *   { word: "BARTOLOMEU" }
 * ]
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
 * Renderiza um componente nominal de forma completa ou abreviada.
 * A partícula SEMPRE acompanha a abreviação:
 * - "DOS SANTOS" -> "DOS S."
 * - "DA CONCEIÇÃO" -> "DA C."
 * - "E SILVA" -> "E S."
 * - "FERREIRA" -> "F."
 * Acentuação da primeira letra é rigorosamente preservada.
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
 * Abreviação Progressiva Semântica Baseada em Pixels.
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

  // 1. REGRA FUNDAMENTAL: Se o nome completo original já couber no espaço real, retorne-o 100% intacto.
  if (isSatisfied(trimmed)) {
    return trimmed;
  }

  const components = parseNameComponents(trimmed);

  // 2. Nomes simples com 2 componentes ou menos (ex: "JOÃO SILVA", "JOSÉ DA SILVA")
  // Não inventar abreviações agressivas (nunca "J. S." ou "J. DA SILVA"). Retorna o original.
  if (components.length <= 2) {
    return trimmed;
  }

  // 3. Identificação semântica dos componentes protegidos:
  // - Componente 0: primeiro prenome (SEMPRE protegido).
  // - Agnome: se presente no último componente (ex: JÚNIOR, FILHO, NETO), é estritamente protegido.
  // - Último sobrenome: penúltimo componente se houver agnome, ou último componente. É SEMPRE protegido.
  const lastIndex = components.length - 1;
  const hasAgnome = !!components[lastIndex].isAgnome;
  const lastSurnameIndex = hasAgnome ? lastIndex - 1 : lastIndex;

  // 4. Componentes candidatos à abreviação:
  // Todos os componentes intermediários situados estritamente entre o primeiro prenome (índice 0)
  // e o último sobrenome da família (índice lastSurnameIndex).
  const middleIndices: number[] = [];
  for (let i = 1; i < lastSurnameIndex; i++) {
    middleIndices.push(i);
  }

  // Se não houver intermediários livres (ex: "JOSÉ DA SILVA FILHO", onde 0=JOSÉ, 1=DA SILVA, 2=FILHO)
  if (middleIndices.length === 0) {
    return trimmed;
  }

  // 5. Ordem de abreviação progressiva (minimizando perda de informação):
  // Testa os componentes intermediários da direita para a esquerda, um a um.
  // A cada abreviação, remede a string no Canvas 2D.
  // PARAR IMEDIATAMENTE assim que a primeira versão válida couber.
  const abbreviatedSet = new Set<number>();
  const reverseMiddle = [...middleIndices].reverse();

  for (const idx of reverseMiddle) {
    abbreviatedSet.add(idx);
    const candidate = buildCandidateName(components, abbreviatedSet);
    if (isSatisfied(candidate)) {
      return candidate;
    }
  }

  // Retorna a versão construída sem NUNCA usar reticências "..." ou cortar caracteres
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
