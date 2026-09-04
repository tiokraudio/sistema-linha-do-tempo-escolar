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
 * @param font Especificação da fonte CSS (ex: "bold 30px 'Montserrat', sans-serif")
 * @param letterSpacingPx Espaçamento adicional entre caracteres em pixels (ex: tracking-wider 0.05em = 1.5px em 30px)
 */
export function measureTextWidth(text: string, font: string, letterSpacingPx: number = 0): number {
  if (!text) return 0;

  // Fallback seguro caso seja executado fora do ambiente de navegador (SSR / Node.js)
  if (typeof document === 'undefined') {
    const fontSizeMatch = font.match(/(\d+)px/);
    const fontSizePx = fontSizeMatch ? Number(fontSizeMatch[1]) : 16;
    const charWidthPx = fontSizePx * 0.62;
    return text.length * charWidthPx + Math.max(0, text.length - 1) * letterSpacingPx;
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
    let baseWidth = 0;
    if ('letterSpacing' in ctx && letterSpacingPx > 0) {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${letterSpacingPx}px`;
      baseWidth = ctx.measureText(text).width;
    } else {
      baseWidth = ctx.measureText(text).width + Math.max(0, text.length - 1) * letterSpacingPx;
    }
    return baseWidth;
  }

  context.font = font;
  let baseWidth = 0;
  if ('letterSpacing' in context && letterSpacingPx > 0) {
    (context as unknown as { letterSpacing: string }).letterSpacing = `${letterSpacingPx}px`;
    baseWidth = context.measureText(text).width;
  } else {
    baseWidth = context.measureText(text).width + Math.max(0, text.length - 1) * letterSpacingPx;
  }
  return baseWidth;
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
 * 2. Se couber, RETORNA O NOME ORIGINAL (eliminando falsos positivos).
 * 3. Se e somente se estourar o espaço, aplica a abreviação progressiva testando a cada passo via Canvas 2D.
 */
export function fitStudentName(
  studentName: string | null | undefined,
  options: TextFitOptions
): string {
  if (!studentName) return '';
  const trimmed = studentName.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  const {
    maxWidthPx,
    font,
    maxLines = 2,
    safetyMarginPercent = 2,
    uppercase = true,
  } = options;

  // Aplica margem de segurança lateral (2% a 4% de resguardo nas bordas)
  const totalMarginFraction = (Math.max(0, safetyMarginPercent) * 2) / 100;
  const effectiveMaxWidthPx = maxWidthPx * Math.max(0.85, 1 - totalMarginFraction);

  // 1. O nome original completo já cabe no espaço disponível?
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
 * - Espaço disponível amplo (quase toda a largura da página A4).
 * - O nome deve ficar ESTRITAMENTE EM 1 LINHA (whitespace-nowrap, overflow-hidden) para proteger as fotos secundárias.
 * - Gatilho condicional estrito: a abreviação SÓ PODE ser chamada se measureTextWidth(nome) > maxWidth.
 * - Se couber (o que é padrão na Linha do Tempo), retorna o nome original 100% intacto em 1 linha só.
 * - Considera letter-spacing de 0.05em (tracking-wider) e margem de segurança contra cortes de subpixel.
 * - O último sobrenome NUNCA pode ser cortado pelo CSS.
 */
export function formatTimelineStudentName(
  studentName: string | null | undefined,
  maxWidthPx: number,
  font: string,
  safetyMarginPercent: number = 3
): string {
  if (!studentName) return '';
  const cleanName = studentName.trim().replace(/\s+/g, ' ');
  if (!cleanName) return '';

  // Largura útil real do container na folha A4 descontando margem de segurança e padding lateral:
  // O container possui paddingLeft: 2% e paddingRight: 2% (4% total).
  // A margem de segurança padrão de 3% de cada lado (6% total) cobre o padding CSS e resguarda subpixel rendering.
  const totalMarginFraction = (Math.max(0, safetyMarginPercent) * 2) / 100;
  const effectiveMaxWidth = maxWidthPx * Math.max(0.80, 1 - totalMarginFraction);

  // Na Linha do Tempo, a classe CSS aplica tracking-wider (letter-spacing: 0.05em).
  // Com o tamanho oficial de 30px, 0.05em equivale a 1.5px por caractere.
  const letterSpacingPx = 1.5;

  // Medição da largura real do nome em 1 linha via Canvas 2D em caixa alta (uppercase)
  const fullTextWidth = measureTextWidth(cleanName.toUpperCase(), font, letterSpacingPx);

  // Gatilho condicional: se couber no espaço da folha A4, retorna o nome original 100% intacto em 1 linha
  if (fullTextWidth <= effectiveMaxWidth) {
    return cleanName;
  }

  // Abreviação cirúrgica semântica, acionada somente para nomes que estourem o espaço da folha:
  return progressiveAbbreviateName(cleanName, (candidate) => {
    return measureTextWidth(candidate.toUpperCase(), font, letterSpacingPx) <= effectiveMaxWidth;
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
 * Formata o nome do estudante para o Carômetro com suporte tanto aos parâmetros diretos
 * (cellWidth, font) quanto à chamada por contexto (isLandscape, isPrint).
 */
export function formatCarometroName(
  studentName: string | null | undefined,
  isLandscapeOrCellWidth: boolean | number = false,
  isPrintOrFont: boolean | string = false,
  maxLines: number = 2,
  safetyMarginPercent: number = 3
): string {
  if (typeof isLandscapeOrCellWidth === 'boolean') {
    const isLandscape = isLandscapeOrCellWidth;
    const isPrint = typeof isPrintOrFont === 'boolean' ? isPrintOrFont : false;
    const metrics = getCarometroMetrics(isLandscape, isPrint);
    return formatCarometroStudentName(
      studentName,
      metrics.cellWidthPx,
      metrics.font,
      metrics.maxLines,
      safetyMarginPercent
    );
  } else {
    const cellWidth = isLandscapeOrCellWidth;
    const font = typeof isPrintOrFont === 'string' ? isPrintOrFont : "bold 11px 'Montserrat', sans-serif";
    return formatCarometroStudentName(
      studentName,
      cellWidth,
      font,
      maxLines,
      safetyMarginPercent
    );
  }
}

export function getCarometroMetrics(isLandscape: boolean, isPrint: boolean) {
  if (isPrint) {
    if (isLandscape) {
      return {
        cellWidthPx: 360,
        fontSizePx: 31,
        font: "bold 31px 'Montserrat', sans-serif",
        maxLines: 2,
      };
    } else {
      return {
        cellWidthPx: 388,
        fontSizePx: 34,
        font: "bold 34px 'Montserrat', sans-serif",
        maxLines: 2,
      };
    }
  } else {
    if (isLandscape) {
      return {
        cellWidthPx: 115,
        fontSizePx: 10,
        font: "bold 10px 'Montserrat', sans-serif",
        maxLines: 2,
      };
    } else {
      return {
        cellWidthPx: 124,
        fontSizePx: 11,
        font: "bold 11px 'Montserrat', sans-serif",
        maxLines: 2,
      };
    }
  }
}
