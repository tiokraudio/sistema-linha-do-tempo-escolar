import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

// In-memory image preload & DataURL cache
const imageBase64Cache = new Map<string, string>();

/**
 * Converts any image URL (relative, absolute, or blob) to a Base64 Data URL.
 * Uses canvas extraction or fetch blob reader for cross-origin safety.
 */
export async function urlToDataUrl(url: string): Promise<string> {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();

  // Already a Data URI
  if (cleanUrl.startsWith('data:image/')) {
    return cleanUrl;
  }

  if (imageBase64Cache.has(cleanUrl)) {
    return imageBase64Cache.get(cleanUrl)!;
  }

  // Attempt 1: Fetch as blob then convert to base64
  try {
    const response = await fetch(cleanUrl, { mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      if (base64 && base64.startsWith('data:image/')) {
        imageBase64Cache.set(cleanUrl, base64);
        return base64;
      }
    }
  } catch {
    // Fallback to Image element rendering
  }

  // Attempt 2: Load into HTMLImageElement and draw onto Canvas
  try {
    const base64 = await new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width || 400;
          canvas.height = img.naturalHeight || img.height || 400;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(cleanUrl);
            return;
          }
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          resolve(dataUrl);
        } catch {
          resolve(cleanUrl);
        }
      };
      img.onerror = () => resolve(cleanUrl);
      img.src = cleanUrl;
    });

    if (base64 && base64.startsWith('data:image/')) {
      imageBase64Cache.set(cleanUrl, base64);
      return base64;
    }
  } catch {
    // Return original url as fallback
  }

  return cleanUrl;
}

/**
 * Recursively scans an HTMLElement, preloading and converting all <img> src
 * and CSS background-image properties into inlined Base64 Data URLs.
 * Also ensures any <canvas> elements within the container are rendered.
 */
export async function preloadAndInlineImages(container: HTMLElement): Promise<void> {
  if (!container) return;

  // 1. Process all <img> elements
  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  const imagePromises = images.map(async (img) => {
    const currentSrc = img.getAttribute('src') || img.src;
    if (currentSrc && !currentSrc.startsWith('data:image/')) {
      try {
        const inlined = await urlToDataUrl(currentSrc);
        if (inlined && inlined.startsWith('data:image/')) {
          img.src = inlined;
          img.setAttribute('src', inlined);
        }
      } catch {
        // Continue gracefully
      }
    }

    // Wait for image decode if supported
    if (img.decode) {
      try {
        await img.decode();
      } catch {
        // Proceed gracefully
      }
    } else if (!img.complete) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        setTimeout(done, 500);
      });
    }
  });

  // 2. Process elements with CSS background-image
  const allElements = Array.from(container.querySelectorAll<HTMLElement>('*'));
  const bgPromises = allElements.map(async (el) => {
    const bg = el.style?.backgroundImage || window.getComputedStyle(el)?.backgroundImage;
    if (bg && bg.includes('url(') && !bg.includes('data:image/')) {
      const match = bg.match(/url\(['"]?([^'")]+)['"]?\)/);
      if (match && match[1]) {
        try {
          const inlined = await urlToDataUrl(match[1]);
          if (inlined && inlined.startsWith('data:image/')) {
            el.style.backgroundImage = `url("${inlined}")`;
          }
        } catch {
          // Continue gracefully
        }
      }
    }
  });

  await Promise.all([...imagePromises, ...bgPromises]);
}

/**
 * Standard A4 logical base dimensions in pixels at 96 DPI:
 * 794px width x 1123px height (aspect ratio ~ 1 : 1.41436)
 */
export const A4_STANDARD_WIDTH = 794;
export const A4_STANDARD_HEIGHT = 1123;

/**
 * Prepares and captures an HTMLElement or element by ID using html-to-image.
 *
 * Guarantees:
 * 1. Strict A4 dimensions (794 x 1123 px base, scale 2 = 1588 x 2246 px at 300 DPI).
 * 2. Unaltered snapshot: removes any preview scaling (transform: scale) during render.
 * 3. Inlines all images/photos as Base64 to prevent blank pages or missing assets.
 * 4. Full browser SVG ForeignObject support for all modern CSS color spaces.
 */
export async function captureA4ElementToPng(target: string | HTMLElement): Promise<string> {
  const element = typeof target === 'string' ? document.getElementById(target) : target;
  if (!element) {
    throw new Error('Não foi possível gerar a imagem porque a prévia A4 não está disponível no DOM.');
  }

  // 1. Ensure custom web fonts are fully loaded
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Proceed gracefully
    }
  }

  // 2. Inline and preload all images/photos in the target DOM tree
  await preloadAndInlineImages(element);

  // 3. Render directly using html-to-image with strict A4 geometry and pixelRatio 2 (300 DPI)
  return await toPng(element, {
    quality: 1.0,
    pixelRatio: 2, // 1588 x 2246 px (True 300 DPI for A4)
    width: A4_STANDARD_WIDTH,
    height: A4_STANDARD_HEIGHT,
    skipFonts: true, // EVITA O SECURITYERROR DO GOOGLE FONTS (cssRules cross-origin)
    preferredFontFormat: 'woff2',
    backgroundColor: '#ffffff',
    cacheBust: true,
    style: {
      transform: 'none',
      transformOrigin: 'top left',
      margin: '0',
      padding: '0',
      width: `${A4_STANDARD_WIDTH}px`,
      height: `${A4_STANDARD_HEIGHT}px`,
      position: 'relative',
      top: '0',
      left: '0',
    },
    filter: (domNode) => {
      if (domNode instanceof HTMLElement) {
        if (
          domNode.classList.contains('no-print') ||
          domNode.classList.contains('print-ignore') ||
          (domNode.getAttribute('aria-hidden') === 'true' && domNode.classList.contains('interactive-only'))
        ) {
          return false;
        }
      }
      return true;
    },
  });
}

/**
 * Creates a standard jsPDF instance with A4 dimensions (210 x 297 mm) in portrait orientation.
 */
export function createA4JsPdf(): jsPDF {
  return new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });
}

/**
 * Adds a high-resolution lossless PNG page covering the exact A4 sheet (210 x 297 mm).
 */
export function addPngPageToA4Pdf(pdf: jsPDF, pngDataUrl: string, isFirstPage: boolean): void {
  const pdfWidth = pdf.internal.pageSize.getWidth() || 210;
  const pdfHeight = pdf.internal.pageSize.getHeight() || 297;

  if (!isFirstPage) {
    pdf.addPage('a4', 'portrait');
  }

  // Preencher exatamente a folha A4 (210 x 297 mm) sem distorcer proporção
  pdf.addImage(pngDataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
}

/**
 * Saves a jsPDF instance to file.
 */
export function saveA4Pdf(pdf: jsPDF, filename: string): void {
  const cleanFilename = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
  pdf.save(`${cleanFilename}.pdf`);
}

/**
 * Generates an A4 PDF from an HTMLElement or element ID and downloads it.
 */
export async function generateTimelinePdf(
  target: HTMLElement | string,
  filename = 'linha-do-tempo.pdf'
): Promise<jsPDF> {
  const dataUrl = await captureA4ElementToPng(target);
  const pdf = createA4JsPdf();
  addPngPageToA4Pdf(pdf, dataUrl, true);
  saveA4Pdf(pdf, filename);
  return pdf;
}

/**
 * Downloads an A4 element as a PNG image.
 */
export async function downloadTimelineImage(
  target: HTMLElement | string,
  filename = 'linha-do-tempo.png'
): Promise<string> {
  const dataUrl = await captureA4ElementToPng(target);
  const link = document.createElement('a');
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  link.href = dataUrl;
  link.click();
  return dataUrl;
}

/**
 * Renders an HTML element by ID and downloads the A4 PDF file.
 */
export async function downloadA4Pdf(elementId: string, filename: string): Promise<void> {
  try {
    await generateTimelinePdf(elementId, filename);
  } catch (err: any) {
    console.error('Erro na exportação do PDF:', err);
    throw err;
  }
}

/**
 * Triggers standard browser print dialog formatted strictly for A4.
 */
export function triggerPrintA4(): void {
  window.print();
}
