import { CropSettings } from '../types';

/**
 * Client-side face detection heuristic executed 100% locally on HTML Canvas.
 * Detects skin tone density in the upper 65% of the photo to estimate face location.
 */
export async function autoDetectFaceCrop(imageUrl: string): Promise<CropSettings> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ x: 50, y: 50, zoom: 1.0 });
          return;
        }

        // Downscale for fast pixel inspection
        const sampleW = 120;
        const sampleH = Math.round((img.height / img.width) * sampleW);
        canvas.width = sampleW;
        canvas.height = sampleH;

        ctx.drawImage(img, 0, 0, sampleW, sampleH);
        const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
        const data = imgData.data;

        let totalSkinPixels = 0;
        let sumX = 0;
        let sumY = 0;

        // Focus search primarily on top 65% where head/face usually is in school photos
        const searchMaxY = Math.round(sampleH * 0.65);

        for (let y = 0; y < searchMaxY; y++) {
          for (let x = 0; x < sampleW; x++) {
            const idx = (y * sampleW + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            // Standard skin-tone color threshold (RGB domain)
            const isSkin =
              r > 80 &&
              g > 40 &&
              b > 20 &&
              r > g &&
              r > b &&
              Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
              Math.abs(r - g) > 15;

            if (isSkin) {
              totalSkinPixels++;
              sumX += x;
              sumY += y;
            }
          }
        }

        if (totalSkinPixels > 20) {
          const avgX = (sumX / totalSkinPixels / sampleW) * 100;
          const avgY = (sumY / totalSkinPixels / sampleH) * 100;

          // Clamp values to keep face well framed
          const clampedX = Math.min(Math.max(Math.round(avgX), 20), 80);
          const clampedY = Math.min(Math.max(Math.round(avgY), 15), 65);

          // Estimate zoom based on how much of the image the face cluster takes up
          const coverageRatio = totalSkinPixels / (sampleW * searchMaxY);
          let estimatedZoom = 1.25;
          if (coverageRatio < 0.08) estimatedZoom = 1.45; // Small face -> zoom in more
          else if (coverageRatio > 0.25) estimatedZoom = 1.1; // Large face -> slight zoom

          resolve({
            x: clampedX,
            y: clampedY,
            zoom: Number(estimatedZoom.toFixed(2)),
          });
        } else {
          // Default center portrait framing
          resolve({ x: 50, y: 50, zoom: 1.0 });
        }
      } catch (e) {
        console.warn('Face detection fallback used:', e);
        resolve({ x: 50, y: 50, zoom: 1.0 });
      }
    };

    img.onerror = () => {
      resolve({ x: 50, y: 50, zoom: 1.0 });
    };

    img.src = imageUrl;
  });
}
