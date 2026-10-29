// @vitest-environment node

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createImagePdf } from '../../src/app/recipes/recipe-output-generator';

describe('recipe image PDF generation', () => {
  it('creates a readable landscape Letter PDF with each raster page', async () => {
    const jpeg = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();
    const pdf = await createImagePdf([new Blob([jpeg]), new Blob([jpeg])]);
    const document = await getDocument({
      data: new Uint8Array(await pdf.arrayBuffer()),
    }).promise;

    expect(document.numPages).toBe(2);
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const viewport = await document
        .getPage(pageNumber)
        .then((page) => page.getViewport({ scale: 1 }));
      expect(viewport.width).toBe(792);
      expect(viewport.height).toBe(612);
    }

    await document.destroy();
  });

  it('rejects PDFs with no pages', async () => {
    await expect(createImagePdf([])).rejects.toThrow('The PDF output contains no pages.');
  });
});
