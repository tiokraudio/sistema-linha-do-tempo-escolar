/**
 * Utilitário de Medição de Texto Exata via Canvas 2D API.
 * Permite medir a largura exata de strings em pixels ANTES de renderizar,
 * simulando quebra de linha por palavras (word-wrap) em até N linhas (padrão 2),
 * eliminando 100% de falsos positivos causados por estimativa de caracteres.
 */

import { progressiveAbbreviateName } from './nameUtils';

// Singleton de canvas para máxima performance durante renderização de múltiplos cards
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedContext: CanvasRenderingContext2D | null = null;

/**
 * Mede a largura exata de uma string em pixels ANTES de renderizar via Canvas 2D API.
 *
 * @param text Texto a ser medido
 * @param font Especificação da fonte CSS (ex: "bold 24px 'Montserrat', sans-serif")
 */
export function measureTextWidth(text: string, font: string): number {
  if (!text) return 0;

  // Fallback seguro caso seja executado fora do ambiente de navegador
  if (typeof document === 'undefined') {
    return text.length * 10;
  }

  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
    sharedContext = sharedCanvas.getContext('2d');
  }

  const context = sharedContext;
  if (!context) {
    // Fallback criando novo contexto caso o singleton não esteja disponível
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.font = font;
    return ctx.measureText(text).width;
  }

  context.font = font;
  return context.measureText(text).width;
}

/**
 * Verifica se um texto cabe em até `maxLines` linhas sem estourar `maxWidthPx`.
 * Mede as palavras em pixels via Canvas 2D simulando a quebra de linha do CSS (word-break / line-clamp).
 *
 * @param text Texto completo a ser verificado
 * @param font Definição da fonte (peso, tamanho, família)
 * @param maxWidthPx Largura física máxima disponível para o texto por linha
 * @param maxLines Número máximo de linhas permitidas (padrão 2)
 * @param uppercase Se verdadeiro, mede o texto em caixa alta (como renderizado por CSS uppercase)
 */
export function canTextFitInLines(
  text: string,
  font: string,
  maxWidthPx: number,
  maxLines: number = 2,
  uppercase: boolean = true
): boolean {
  if (!text || maxWidthPx <= 0) return true;
  const processedText = uppercase ? text.toUpperCase() : text;
  const trimmed = processedText.trim().replace(/\s+/g, ' ');
  if (!trimmed) return true;

  // 1. Se couber em uma única linha, cabe com certeza
  const singleLineWidth = measureTextWidth(trimmed, font);
  if (singleLineWidth <= maxWidthPx) {
    return true;
  }

  // 2. Se o limite for apenas 1 linha e já excedeu
  if (maxLines <= 1) {
    return false;
  }

  // 3. Simula a quebra de palavras do navegador
  const words = trimmed.split(' ');
  let currentLine = '';
  let lineCount = 1;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordWidth = measureTextWidth(word, font);
    if (wordWidth > maxWidthPx) {
      // Uma palavra individual é mais larga que toda a largura disponível da linha
      return false;
    }

    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = measureTextWidth(testLine, font);

    if (testWidth <= maxWidthPx) {
      currentLine = testLine;
    } else {
      lineCount++;
      if (lineCount > maxLines) {
        return false;
      }
      currentLine = word;
    }
  }

  return lineCount <= maxLines;
}

export interface TextFitOptions {
  maxWidthPx: number;
  font: string;
  maxLines?: number;
  safetyMarginPercent?: number; // Margem de segurança lateral de cada lado (ex: 2% a 4%, padrão 2%)
  uppercase?: boolean;
}

/**
 * Ajusta cirurgicamente o nome de um aluno para caber perfeitamente no container:
 * 1. Primeiro testa se o nome original completo JÁ CABE no espaço disponível em até maxLines (ex: 2).
 *    Se couber, RETORNA O NOME ORIGINAL INTACTO (zero falsos positivos).
 * 2. Se e somente se o nome não couber, aplica abreviação cirúrgica progressiva
 *    dos sobrenomes intermediários da direita para a esquerda, testando a cada passo
 *    se a versão abreviada agora cabe perfeitamente na medição real de pixels.
 *
 * @param fullName Nome do aluno
 * @param options Opções de medição e restrições de layout
 */
export function fitOrAbbreviateName(
  fullName: string | null | undefined,
  options: TextFitOptions
): string {
  if (!fullName) return '';
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  const {
    maxWidthPx,
    font,
    maxLines = 2,
    safetyMarginPercent = 2,
    uppercase = true,
  } = options;

  // Largura útil deduzindo a margem lateral de segurança (ex: 2% de cada lado = 4% total)
  const totalMarginFraction = (Math.max(0, safetyMarginPercent) * 2) / 100;
  const effectiveMaxWidthPx = maxWidthPx * Math.max(0.85, 1 - totalMarginFraction);

  // 1. Verificação Primária: O nome original já cabe sem qualquer alteração?
  if (canTextFitInLines(trimmed, font, effectiveMaxWidthPx, maxLines, uppercase)) {
    return trimmed;
  }

  // 2. Não coube: utiliza abreviação progressiva com teste exato via Canvas 2D
  return progressiveAbbreviateName(trimmed, (candidate) => {
    return canTextFitInLines(candidate, font, effectiveMaxWidthPx, maxLines, uppercase);
  });
}

/**
 * Formatação de nome específica para a LINHA DO TEMPO (A4TimelinePreview):
 * - Espaço disponível enorme (quase toda a largura da página A4).
 * - O nome deve ficar ESTRITAMENTE EM 1 LINHA (whitespace-nowrap, overflow-hidden) para proteger as fotos secundárias.
 * - Gatilho condicional estrito: a abreviação SÓ PODE ser chamada se measureTextWidth(nome) > maxWidth.
 * - Se couber (o que é padrão na Linha do Tempo), retorna o nome original 100% intacto em 1 linha só.
 */
export function formatTimelineStudentName(
  studentName: string | null | undefined,
  maxWidthPx: number,
  font: string,
  safetyMarginPercent: number = 2
): string {
  if (!studentName) return '';
  const cleanName = studentName.trim().replace(/\s+/g, ' ');
  if (!cleanName) return '';

  // Largura gigante real do container na folha A4 descontando margem de segurança lateral de 2% (2% de cada lado = 4% total)
  const totalMarginFraction = (Math.max(0, safetyMarginPercent) * 2) / 100;
  const effectiveMaxWidth = maxWidthPx * Math.max(0.85, 1 - totalMarginFraction);

  // Medição da largura real do nome em 1 linha via Canvas 2D
  const textWidth = measureTextWidth(cleanName.toUpperCase(), font);

  // Gatilho condicional: se couber no espaço enorme da A4, retorna o nome original intacto em 1 linha
  if (textWidth <= effectiveMaxWidth) {
    return cleanName;
  }

  // Abreviação cirúrgica raríssima, acionada apenas para nomes colossais que estourem o espaço enorme da folha:
  return progressiveAbbreviateName(cleanName, (candidate) => {
    return measureTextWidth(candidate.toUpperCase(), font) <= effectiveMaxWidth;
  });
}

/**
 * Formatação de nome específica para o CARÔMETRO (ClassCarometro / CarometroA4Sheet):
 * - Espaço curtíssimo (estritamente limitado à largura da célula/foto do aluno na grade).
 * - Desconta margem de segurança lateral de 2% a 4% (padrão 3%).
 * - Permite quebra nativa em até 2 linhas (line-clamp-2).
 * - Gatilho condicional estrito: se o nome completo couber no espaço da célula (em até 2 linhas),
 *   retorna o nome original intacto.
 * - Se estourar a largura da célula da grade, aciona a abreviação cirúrgica progressiva para não invadir o espaço do colega ao lado.
 */
export function formatCarometroStudentName(
  studentName: string | null | undefined,
  cellWidthPx: number,
  font: string,
  maxLines: number = 2,
  safetyMarginPercent: number = 3
): string {
  if (!studentName) return '';
  const cleanName = studentName.trim().replace(/\s+/g, ' ');
  if (!cleanName) return '';

  // Largura útil estrita da célula na grade descontando margem lateral de segurança (2% a 4%, padrão 3%)
  const totalMarginFraction = (Math.max(0, safetyMarginPercent) * 2) / 100;
  const effectiveMaxWidth = cellWidthPx * Math.max(0.80, 1 - totalMarginFraction);

  // Gatilho condicional: verifica se o nome original já cabe na célula em até maxLines
  if (canTextFitInLines(cleanName, font, effectiveMaxWidth, maxLines, true)) {
    return cleanName;
  }

  // Estourou a célula da grade: aciona abreviação cirúrgica progressiva
  return progressiveAbbreviateName(cleanName, (candidate) => {
    return canTextFitInLines(candidate, font, effectiveMaxWidth, maxLines, true);
  });
}

/**
 * Retorna a fonte e a largura útil configuradas para os cards do Carômetro
 */
export function getCarometroMetrics(isLandscape: boolean, isPrint: boolean) {
  if (isPrint) {
    if (isLandscape) {
      return {
        boxWidthPx: 360,
        font: 'bold 31px sans-serif',
        safetyMarginPercent: 3,
      };
    } else {
      return {
        boxWidthPx: 388,
        font: 'bold 34px sans-serif',
        safetyMarginPercent: 3,
      };
    }
  } else {
    if (isLandscape) {
      return {
        boxWidthPx: 115,
        font: 'bold 10px sans-serif',
        safetyMarginPercent: 3,
      };
    } else {
      return {
        boxWidthPx: 124,
        font: 'bold 11px sans-serif',
        safetyMarginPercent: 3,
      };
    }
  }
}

/**
 * Formata o nome do aluno especificamente para o Carômetro utilizando medição Canvas 2D
 */
export function formatCarometroName(
  fullName: string | null | undefined,
  isLandscape: boolean,
  isPrint: boolean
): string {
  const metrics = getCarometroMetrics(isLandscape, isPrint);
  return formatCarometroStudentName(
    fullName,
    metrics.boxWidthPx,
    metrics.font,
    2,
    metrics.safetyMarginPercent
  );
}
