import { describe, expect, it } from 'vitest';
import {
  fitCanvasToViewport,
  isPortraitCoordinates,
  ratioLabel,
  ratioValue,
  transposeCropCoordinates,
} from '../../src/app/media/image-crop-editor';

describe('image crop editor geometry', () => {
  it('uses the active crop orientation for common ratio presets', () => {
    const portraitCrop = { left: 0, top: 0, width: 400, height: 800 };

    expect(isPortraitCoordinates(portraitCrop)).toBe(true);
    expect(ratioLabel('4:3', true)).toBe('3:4');
    expect(ratioLabel('3:2', true)).toBe('2:3');
    expect(ratioLabel('16:9', true)).toBe('9:16');
    expect(ratioValue('4:3', true, 1200, 800, 0)).toBe(3 / 4);
    expect(ratioValue('16:9', true, 1200, 800, 0)).toBe(9 / 16);
  });

  it('keeps Original tied to the rotated source dimensions', () => {
    expect(ratioValue('original', true, 1200, 800, 90)).toBe(2 / 3);
  });

  it('transposes the crop frame around its existing center', () => {
    expect(transposeCropCoordinates({ left: 100, top: 50, width: 300, height: 200 })).toEqual({
      left: 150,
      top: 0,
      width: 200,
      height: 300,
    });
  });

  it('fits the canvas to the rotated source orientation', () => {
    const landscapeCanvas = fitCanvasToViewport(640, 380, 1600, 900, 0);
    const portraitCanvas = fitCanvasToViewport(640, 380, 1600, 900, 90);

    expect(landscapeCanvas.width).toBeGreaterThan(landscapeCanvas.height);
    expect(portraitCanvas.height).toBeGreaterThan(portraitCanvas.width);
    expect(portraitCanvas.width).toBeLessThanOrEqual(640);
    expect(portraitCanvas.height).toBeLessThanOrEqual(380);
  });
});
