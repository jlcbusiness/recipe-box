export const RECIPE_OUTPUT_PAGE = {
  widthPoints: 792,
  heightPoints: 612,
  marginPoints: 18,
  dpi: 300,
  minimumTextMillimeters: 3,
} as const;

export type RecipeDownloadFormat = 'html' | 'png' | 'pdf';

export function sanitizeRecipeFilename(title: string): string {
  const sanitized = Array.from(title.normalize('NFKC'))
    .map((character) => ('<>:"/\\|?*'.includes(character) ? ' - ' : character))
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 0x1f && codePoint !== 0x7f;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();

  return sanitized || 'Recipe';
}

export function getRecipeOutputFilename(
  title: string,
  format: RecipeDownloadFormat,
  pageCount = 1,
): string {
  const baseName = `${sanitizeRecipeFilename(title)} - Recipe`;

  if (format === 'png') {
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new Error('The output must contain at least one PNG page.');
    }
    return pageCount > 1 ? `${baseName} Pages.zip` : `${baseName}.png`;
  }

  return `${baseName}.${format}`;
}

export function paginateInstructionSteps<T extends { height: number; continuationHeight?: number }>(
  steps: readonly T[],
  availableHeight: number,
  continuationAvailableHeight = availableHeight,
): T[][] {
  if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
    throw new Error('The available page height must be a positive finite number.');
  }
  if (!Number.isFinite(continuationAvailableHeight) || continuationAvailableHeight <= 0) {
    throw new Error('The available page height must be a positive finite number.');
  }

  const pages: T[][] = [[]];
  let pageIndex = 0;
  let pageHeight = 0;

  for (const step of steps) {
    if (!Number.isFinite(step.height) || step.height <= 0) {
      throw new Error('Instruction step heights must be positive finite numbers.');
    }
    const continuationHeight = step.continuationHeight ?? step.height;
    if (!Number.isFinite(continuationHeight) || continuationHeight <= 0) {
      throw new Error('Instruction step heights must be positive finite numbers.');
    }

    let height = pageIndex === 0 ? step.height : continuationHeight;
    let pageCapacity = pageIndex === 0 ? availableHeight : continuationAvailableHeight;
    if (
      height > pageCapacity &&
      pageIndex === 0 &&
      continuationHeight <= continuationAvailableHeight
    ) {
      pages.push([]);
      pageIndex += 1;
      pageHeight = 0;
      height = continuationHeight;
      pageCapacity = continuationAvailableHeight;
    }
    if (height > pageCapacity) {
      throw new Error(
        'An instruction step cannot fit on a page at the minimum readable text size.',
      );
    }

    if (pageHeight + height > pageCapacity) {
      pages.push([]);
      pageIndex += 1;
      pageHeight = 0;
      height = continuationHeight;
      if (height > continuationAvailableHeight) {
        throw new Error(
          'An instruction step cannot fit on a page at the minimum readable text size.',
        );
      }
    }
    pages[pageIndex]?.push(step);
    pageHeight += height;
  }

  return pages;
}
