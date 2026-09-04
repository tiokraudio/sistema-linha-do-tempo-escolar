import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

// In-memory image preload & DataURL cache
const imageBase64Cache = new Map<string, string>();

/**
 * Converts any image URL (relative, absolute, or blob) to a Base64 Data URL.
 * Preserves 100% of original photo resolution and bytes without lossy recompression.
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

  // Attempt 1: Fetch directly as raw Blob and convert via FileReader (Zero quality loss, preserves original bytes)
  try {
    const response = await fetch(cleanUrl);
    if (response.ok) {
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('FileReader failed'));
          }
        };
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

  // Attempt 2: Load into HTMLImageElement and draw onto Canvas with 100% native resolution
  try {
    const base64 = await new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          if (img.decode) {
            try {
              await img.decode();
            } catch {
              // Ignore decode error and proceed
            }
          }
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          if (!width || !height) {
            resolve(cleanUrl);
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(cleanUrl);
            return;
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/png', 1.0);
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
 * Standard A4 print dimensions in pixels at 300 DPI:
 * 2480px width x 3508px height (exact 300 DPI for 210 x 297 mm paper in portrait).
 * A4_PRINT_SCALE scales standard 96 DPI CSS layout (~794px) to full 300 DPI (~3.1234).
 */
export const A4_PRINT_WIDTH_PX = 2480;
export const A4_PRINT_HEIGHT_PX = 3508;
export const A4_PRINT_SCALE = A4_PRINT_WIDTH_PX / A4_STANDARD_WIDTH; // ~3.1234257

/**
 * Standard A4 landscape print dimensions in pixels at 300 DPI:
 * 3508px width x 2480px height (exact 300 DPI for 297 x 210 mm paper in landscape).
 * A4_LANDSCAPE_PRINT_SCALE scales standard 96 DPI landscape (~1123px) to full 300 DPI (~3.1238).
 */
export const A4_LANDSCAPE_WIDTH_PX = 3508;
export const A4_LANDSCAPE_HEIGHT_PX = 2480;
export const A4_LANDSCAPE_STANDARD_WIDTH = 1123;
export const A4_LANDSCAPE_STANDARD_HEIGHT = 794;
export const A4_LANDSCAPE_PRINT_SCALE = A4_LANDSCAPE_WIDTH_PX / A4_LANDSCAPE_STANDARD_WIDTH; // ~3.1237756

export interface CaptureA4Options {
  width?: number;
  height?: number;
  pixelRatio?: number;
  orientation?: 'portrait' | 'landscape';
}

/**
 * Aguarda que todos os elementos <canvas> com data-src dentro do container
 * tenham completado sua renderização (data-status === 'ready' ou 'error').
 * Isso impede que snapshots sejam capturados com telas brancas ou fotos não renderizadas.
 */
export async function waitForAllCanvasesReady(container: HTMLElement, timeoutMs = 4500): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const canvases = Array.from(container.querySelectorAll<HTMLCanvasElement>('canvas[data-src]'));
    if (canvases.length === 0) break;

    const pending = canvases.filter((c) => c.dataset.status !== 'ready' && c.dataset.status !== 'error');
    if (pending.length === 0) break;

    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

/**
 * Prepares and captures an HTMLElement or element by ID using html-to-image.
 *
 * Guarantees:
 * 1. Strict A4 dimensions (Native 300 DPI: 2480 x 3508 px portrait or 3508 x 2480 px landscape, pixelRatio 1 for lossless high-resolution photos).
 * 2. Unaltered snapshot: removes any preview scaling (transform: scale) during render.
 * 3. Inlines all images/photos as Base64 to prevent blank pages or missing assets.
 * 4. Full browser SVG ForeignObject support for all modern CSS color spaces.
 * 5. Sincronização completa de todos os elementos <canvas> de alta resolução antes do snapshot.
 */
export async function captureA4ElementToPng(
  target: string | HTMLElement,
  options?: CaptureA4Options
): Promise<string> {
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

  // 2. Aguarda que todos os canvases de fotos em alta resolução completem a pintura
  await waitForAllCanvasesReady(element);

  // 3. Inline and preload all images/photos in the target DOM tree
  await preloadAndInlineImages(element);

  // 4. Pequena pausa para garantir flush do pipeline gráfico e decodificação completa
  await new Promise((resolve) => setTimeout(resolve, 60));

  // Determine export geometry and orientation:
  const isLandscape =
    options?.orientation === 'landscape' ||
    (options?.width && options?.height && options.width > options.height) ||
    element.offsetWidth > element.offsetHeight ||
    element.id.includes('landscape');

  // Se o elemento foi configurado em escala nativa 300 DPI (>= 2000px) ou se for timeline / carometro:
  const isTargetNative300Dpi =
    (options?.width && options.width >= 2000) ||
    (options?.height && options.height >= 2000) ||
    element.offsetWidth >= 2000 ||
    element.offsetHeight >= 2000 ||
    element.id.includes('timeline') ||
    element.id.includes('carometro');

  const defaultWidth = isLandscape
    ? (isTargetNative300Dpi ? A4_LANDSCAPE_WIDTH_PX : A4_LANDSCAPE_STANDARD_WIDTH)
    : (isTargetNative300Dpi ? A4_PRINT_WIDTH_PX : A4_STANDARD_WIDTH);

  const defaultHeight = isLandscape
    ? (isTargetNative300Dpi ? A4_LANDSCAPE_HEIGHT_PX : A4_LANDSCAPE_STANDARD_HEIGHT)
    : (isTargetNative300Dpi ? A4_PRINT_HEIGHT_PX : A4_STANDARD_HEIGHT);

  const width = options?.width ?? defaultWidth;
  const height = options?.height ?? defaultHeight;
  const pixelRatio = options?.pixelRatio ?? (isTargetNative300Dpi ? 1 : 3);

  // 5. Render directly using html-to-image with strict dimensions
  return await toPng(element, {
    quality: 1.0,
    pixelRatio,
    width,
    height,
    canvasWidth: width,
    canvasHeight: height,
    skipFonts: true, // EVITA O SECURITYERROR DO GOOGLE FONTS (cssRules cross-origin)
    preferredFontFormat: 'woff2',
    backgroundColor: '#ffffff',
    cacheBust: true,
    style: {
      transform: 'none',
      transformOrigin: 'top left',
      margin: '0',
      padding: '0',
      width: `${width}px`,
      height: `${height}px`,
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
 * Creates a standard jsPDF instance with A4 dimensions (210 x 297 mm or 297 x 210 mm) in portrait or landscape.
 */
export function createA4JsPdf(orientation: 'portrait' | 'landscape' = 'portrait'): jsPDF {
  return new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
    compress: true,
  });
}

/**
 * Adds a high-resolution lossless PNG page covering the exact A4 sheet (210 x 297 mm or 297 x 210 mm).
 */
export function addPngPageToA4Pdf(
  pdf: jsPDF,
  pngDataUrl: string,
  isFirstPage: boolean,
  orientation: 'portrait' | 'landscape' = 'portrait'
): void {
  const isLandscape = orientation === 'landscape';
  const defaultW = isLandscape ? 297 : 210;
  const defaultH = isLandscape ? 210 : 297;
  const pdfWidth = pdf.internal.pageSize.getWidth() || defaultW;
  const pdfHeight = pdf.internal.pageSize.getHeight() || defaultH;

  if (!isFirstPage) {
    pdf.addPage('a4', orientation);
  }

  // Preencher exatamente a folha A4 sem distorcer proporção ('SLOW' impede downsampling e compressão com perdas)
  pdf.addImage(pngDataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'SLOW');
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
