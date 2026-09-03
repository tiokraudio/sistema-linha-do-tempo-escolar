import { captureA4ElementToPng, createA4JsPdf, addPngPageToA4Pdf, saveA4Pdf, generateTimelinePdf, downloadTimelineImage } from '../src/utils/pdfGenerator';

console.log('=== TESTES DO MOTOR HTML-TO-IMAGE PARA A4 E PDF ===');

// Test 1: Check exported signatures
if (typeof captureA4ElementToPng !== 'function') {
  console.error('Test 1 Failed: captureA4ElementToPng is not a function');
  process.exit(1);
}

if (typeof createA4JsPdf !== 'function') {
  console.error('Test 2 Failed: createA4JsPdf is not a function');
  process.exit(1);
}

if (typeof generateTimelinePdf !== 'function') {
  console.error('Test 3 Failed: generateTimelinePdf is not a function');
  process.exit(1);
}

if (typeof downloadTimelineImage !== 'function') {
  console.error('Test 4 Failed: downloadTimelineImage is not a function');
  process.exit(1);
}

console.log('✅ TODOS OS TESTES DO MOTOR HTML-TO-IMAGE PASSARAM COM SUCESSO!');
