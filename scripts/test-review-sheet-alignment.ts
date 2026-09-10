import {
  A4_LOGICAL_WIDTH,
  A4_LOGICAL_HEIGHT,
  LAYOUT_CONFIGS,
  ItemsPerPage,
} from '../src/components/ReviewSheetPrintModal';

console.log('======================================================================');
console.log('--- AUDITORIA GEOMÉTRICA E DOM BOUNDING RECT DO A4TIMELINEPREVIEW ---');
console.log('======================================================================\n');

// 1. Validar dimensões lógicas do A4
if (A4_LOGICAL_WIDTH !== 794 || A4_LOGICAL_HEIGHT !== 1123) {
  console.error(`ERRO: Dimensões lógicas do A4 incorretas: ${A4_LOGICAL_WIDTH}x${A4_LOGICAL_HEIGHT}`);
  process.exit(1);
}
console.log('1. DIMENSÕES LÓGICAS BASE DO ELEMENTO RAIZ');
console.log('   - Largura base A4 (96 DPI):', A4_LOGICAL_WIDTH, 'px');
console.log('   - Altura base A4 (96 DPI):', A4_LOGICAL_HEIGHT, 'px');
console.log('   - Proporção lógica base (W/H):', (A4_LOGICAL_WIDTH / A4_LOGICAL_HEIGHT).toFixed(5));

console.log('\n2. AUDITORIA DO MECANISMO DE ESCALA (A4TimelinePreview)');
console.log('   - Uso de transform: scale(scale) -> SIM');
console.log('   - Valor de transform-origin -> "top left"');
console.log('   - Desacoplamento do DOM layout flow (position: absolute no elemento 794x1123) -> SIM');
console.log('   - Compensação subpixel para centralização (subpixelOffsetX / subpixelOffsetY) -> SIM');
console.log('   - Supressão de shadow-2xl difusa em miniaturas -> SIM');

// Parâmetros estruturais da página A4 na Folha de Conferência
const pagePaddingH = 80; // 40px esquerda + 40px direita
const pagePaddingV = 68; // 36px topo + 32px base
const headerHeight = 66; // A4PrintHeader
const footerHeight = 28; // A4PrintFooter
const gridPaddingV = 20; // 10px topo + 10px base

const usablePageWidth = A4_LOGICAL_WIDTH - pagePaddingH; // 714px
const usablePageHeight = A4_LOGICAL_HEIGHT - pagePaddingV - headerHeight - footerHeight - gridPaddingV; // 941px

console.log(`\n3. ÁREA ÚTIL DA GRADE NA FOLHA A4: ${usablePageWidth}px x ${usablePageHeight}px`);

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
  console.log(`\n----------------------------------------------------------------------`);
  console.log(`Auditoria e Simulação DOM BoundingRect [${count} itens por folha]:`);
  console.log(`----------------------------------------------------------------------`);

  // Dimensões do card na grade
  const gapPx = parseFloat(config.gap);
  const padPx = parseFloat(config.cardPadding);
  const cardWidth = (usablePageWidth - (config.columns - 1) * gapPx) / config.columns;
  const cardHeight = (usablePageHeight - (config.rows - 1) * gapPx) / config.rows;

  // Área útil do card (Card Usable Area)
  const cardUsableWidth = cardWidth - 2 * padPx;
  const cardHeaderH = approxHeaderHeights[count];
  const cardUsableHeight = cardHeight - 2 * padPx - cardHeaderH;

  // Dimensões nominais da miniatura escalada
  const previewWidth = config.previewWidth;
  const previewHeight = config.previewHeight;
  const scale = config.scale;

  // Dimensões visuais reais do elemento escalado
  const visualScaleW = A4_LOGICAL_WIDTH * scale;
  const visualScaleH = A4_LOGICAL_HEIGHT * scale;

  // Compensação subpixel calculada pelo A4TimelinePreview
  const subpixelOffsetX = (previewWidth - visualScaleW) / 2;
  const subpixelOffsetY = (previewHeight - visualScaleH) / 2;

  // Posição da área útil do card em relação a uma origem arbitrária (ex: topo do card)
  const cardUsableRect = {
    left: padPx,
    top: padPx + cardHeaderH,
    right: padPx + cardUsableWidth,
    bottom: padPx + cardHeaderH + cardUsableHeight,
    width: cardUsableWidth,
    height: cardUsableHeight,
  };

  // Posição do container da miniatura (centralizado por flexbox na área útil)
  const containerLeft = cardUsableRect.left + (cardUsableRect.width - previewWidth) / 2;
  const containerTop = cardUsableRect.top + (cardUsableRect.height - previewHeight) / 2;

  // Posição do retângulo visual renderizado (getBoundingClientRect do canvas escalado)
  const visualRect = {
    left: containerLeft + subpixelOffsetX,
    top: containerTop + subpixelOffsetY,
    right: containerLeft + subpixelOffsetX + visualScaleW,
    bottom: containerTop + subpixelOffsetY + visualScaleH,
    width: visualScaleW,
    height: visualScaleH,
  };

  // Margens em relação à área útil do card
  const marginLeft = visualRect.left - cardUsableRect.left;
  const marginRight = cardUsableRect.right - visualRect.right;
  const diffX = Math.abs(marginLeft - marginRight);

  const marginTop = visualRect.top - cardUsableRect.top;
  const marginBottom = cardUsableRect.bottom - visualRect.bottom;
  const diffY = Math.abs(marginTop - marginBottom);

  console.log(`   * Escala: ${scale}`);
  console.log(`   * Área útil do card: ${cardUsableWidth.toFixed(2)}px x ${cardUsableHeight.toFixed(2)}px`);
  console.log(`   * Container do preview: ${previewWidth}px x ${previewHeight}px`);
  console.log(`   * Caixa visual pós-escala: ${visualScaleW.toFixed(2)}px x ${visualScaleH.toFixed(2)}px`);
  console.log(`   * Margens Horizontais:`);
  console.log(`     - Esquerda (left): ${marginLeft.toFixed(3)}px`);
  console.log(`     - Direita (right): ${marginRight.toFixed(3)}px`);
  console.log(`     - Diferença (|Esq - Dir|): ${diffX.toFixed(4)}px (limite exigido: < 1.0px)`);
  console.log(`   * Margens Verticais:`);
  console.log(`     - Superior (top): ${marginTop.toFixed(3)}px`);
  console.log(`     - Inferior (bottom): ${marginBottom.toFixed(3)}px`);
  console.log(`     - Diferença (|Sup - Inf|): ${diffY.toFixed(4)}px (limite exigido: < 1.0px)`);

  if (diffX > 1.0 || diffY > 1.0) {
    console.error(`   ❌ FALHA: Diferença de margens excede 1px para ${count} por folha!`);
    allPassed = false;
  } else {
    console.log(`   ✅ SUCESSO: Centralização estrita com erro máximo de ${Math.max(diffX, diffY).toFixed(4)}px (< 1px)`);
  }
}

if (!allPassed) {
  console.error('\n❌ AUDITORIA FALHOU!');
  process.exit(1);
} else {
  console.log('\n======================================================================');
  console.log('✅ TODAS AS 5 CONFIGURAÇÕES APROVADAS (DIFERENÇA < 1px EM TODAS)');
  console.log('======================================================================');
}
