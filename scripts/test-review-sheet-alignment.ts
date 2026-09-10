import {
  A4_LOGICAL_WIDTH,
  A4_LOGICAL_HEIGHT,
  LAYOUT_CONFIGS,
  ItemsPerPage,
} from '../src/components/ReviewSheetPrintModal';

console.log('--- INICIANDO AUDITORIA GEOMÉTRICA DA FOLHA DE CONFERÊNCIA ---');

// 1. Validar dimensões lógicas do A4
if (A4_LOGICAL_WIDTH !== 794 || A4_LOGICAL_HEIGHT !== 1123) {
  console.error(`ERRO: Dimensões lógicas do A4 incorretas: ${A4_LOGICAL_WIDTH}x${A4_LOGICAL_HEIGHT}`);
  process.exit(1);
}
console.log('✓ Dimensões lógicas base do A4 confirmadas: 794 x 1123');

// 2. Parâmetros de página e layout
const pagePaddingH = 80; // 40px esquerda + 40px direita
const pagePaddingV = 68; // 36px topo + 32px base
const headerHeight = 66; // A4PrintHeader
const footerHeight = 28; // A4PrintFooter
const gridPaddingV = 20; // 10px topo + 10px base

const usablePageWidth = A4_LOGICAL_WIDTH - pagePaddingH; // 714px
const usablePageHeight = A4_LOGICAL_HEIGHT - pagePaddingV - headerHeight - footerHeight - gridPaddingV; // 941px

console.log(`✓ Área útil disponível para a grade de cards: ${usablePageWidth}px x ${usablePageHeight}px`);

const options: ItemsPerPage[] = [2, 4, 6, 8, 10];
const approxHeaderHeights: Record<ItemsPerPage, number> = {
  2: 18,
  4: 17,
  6: 16,
  8: 15,
  10: 14,
};

let allPassed = true;

for (const count of options) {
  const config = LAYOUT_CONFIGS[count];
  console.log(`\nAuditoria [${count} itens por folha]:`);

  // Verificação 1: Coincidência exata entre previewWidth/previewHeight e 794*scale / 1123*scale
  const expectedWidth = Math.round(A4_LOGICAL_WIDTH * config.scale);
  const expectedHeight = Math.round(A4_LOGICAL_HEIGHT * config.scale);

  if (config.previewWidth !== expectedWidth || config.previewHeight !== expectedHeight) {
    console.error(`  ERRO: Divergência entre preview e scale! Esperado ${expectedWidth}x${expectedHeight}, obtido ${config.previewWidth}x${config.previewHeight}`);
    allPassed = false;
  } else {
    console.log(`  ✓ previewWidth (${config.previewWidth}px) e previewHeight (${config.previewHeight}px) correspondem exatamente a 794*${config.scale} e 1123*${config.scale}`);
  }

  // Verificação 2: Cálculo das dimensões do card na grade
  const gapPx = parseFloat(config.gap);
  const padPx = parseFloat(config.cardPadding);
  const cardWidth = (usablePageWidth - (config.columns - 1) * gapPx) / config.columns;
  const cardHeight = (usablePageHeight - (config.rows - 1) * gapPx) / config.rows;

  const availableWidth = cardWidth - 2 * padPx;
  const cardHeaderH = approxHeaderHeights[count];
  const availableHeight = cardHeight - 2 * padPx - cardHeaderH;

  // Verificação 3: O preview cabe dentro do espaço disponível sem estourar
  const fitsW = config.previewWidth <= availableWidth;
  const fitsH = config.previewHeight <= availableHeight;

  if (!fitsW || !fitsH) {
    console.error(`  ERRO: Miniatura estoura o card! Disp: ${availableWidth.toFixed(1)}x${availableHeight.toFixed(1)}, Prev: ${config.previewWidth}x${config.previewHeight}`);
    allPassed = false;
  } else {
    console.log(`  ✓ Miniatura cabe sem estouro: Disp ${availableWidth.toFixed(1)}x${availableHeight.toFixed(1)} >= Prev ${config.previewWidth}x${config.previewHeight}`);
  }

  // Verificação 4: Margens visuais simétricas (centralização estrita)
  const marginX = (availableWidth - config.previewWidth) / 2;
  const marginY = (availableHeight - config.previewHeight) / 2;

  if (marginX < 0 || marginY < 0) {
    console.error(`  ERRO: Margem negativa detectada: marginX=${marginX}, marginY=${marginY}`);
    allPassed = false;
  } else {
    console.log(`  ✓ Margens simétricas garantidas:`);
    console.log(`    - Margem horizontal (esquerda = direita): ${marginX.toFixed(1)}px`);
    console.log(`    - Margem vertical (topo = base): ${marginY.toFixed(1)}px`);
  }

  // Verificação 5: Aspect Ratio do A4 preservado
  const originalRatio = A4_LOGICAL_WIDTH / A4_LOGICAL_HEIGHT; // ~0.70703
  const previewRatio = config.previewWidth / config.previewHeight;
  const ratioDiff = Math.abs(originalRatio - previewRatio);
  if (ratioDiff > 0.005) {
    console.error(`  ERRO: Distorção de proporção A4 detectada: ratioDiff=${ratioDiff}`);
    allPassed = false;
  } else {
    console.log(`  ✓ Proporção A4 estritamente preservada (ratio original: ${originalRatio.toFixed(4)}, preview: ${previewRatio.toFixed(4)})`);
  }
}

if (!allPassed) {
  console.error('\n❌ AUDITORIA FALHOU!');
  process.exit(1);
} else {
  console.log('\n======================================================');
  console.log('✅ TODAS AS 5 CONFIGURAÇÕES APROVADAS NA AUDITORIA GEOMÉTRICA');
  console.log('======================================================');
}
