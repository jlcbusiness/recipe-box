import { describe, expect, it } from 'vitest';
import {
  getRecipeOutputFilename,
  paginateInstructionSteps,
  sanitizeRecipeFilename,
} from '../../src/lib/recipes/recipe-output-rules';

describe('recipe output rules', () => {
  it('sanitizes titles for portable download filenames', () => {
    expect(sanitizeRecipeFilename('  Citrus / Olive Oil Cake.  ')).toBe('Citrus - Olive Oil Cake');
    expect(sanitizeRecipeFilename('Recipe\u0000\u001f\u007f name')).toBe('Recipe name');
    expect(sanitizeRecipeFilename('')).toBe('Recipe');
  });

  it('uses distinct names for rendered outputs and multi-page PNG archives', () => {
    expect(getRecipeOutputFilename('Citrus Cake', 'html')).toBe('Citrus Cake - Recipe.html');
    expect(getRecipeOutputFilename('Citrus Cake', 'pdf')).toBe('Citrus Cake - Recipe.pdf');
    expect(getRecipeOutputFilename('Citrus Cake', 'png', 1)).toBe('Citrus Cake - Recipe.png');
    expect(getRecipeOutputFilename('Citrus Cake', 'png', 2)).toBe('Citrus Cake - Recipe Pages.zip');
  });

  it('splits instructions only between steps and starts the next step on a new page', () => {
    const steps = [
      { id: 'one', height: 45 },
      { id: 'two', height: 50 },
      { id: 'three', height: 60 },
    ];

    expect(paginateInstructionSteps(steps, 100)).toEqual([[steps[0], steps[1]], [steps[2]]]);
  });

  it('moves a step to a continuation page when only the first-page header prevents it fitting', () => {
    const steps = [
      { id: 'one', height: 40, continuationHeight: 40 },
      { id: 'photo-step', height: 101, continuationHeight: 90 },
    ];

    expect(paginateInstructionSteps(steps, 100, 120)).toEqual([[steps[0]], [steps[1]]]);
  });

  it('uses continuation-page width when measuring later instruction steps', () => {
    const steps = [{ id: 'long-step', height: 130, continuationHeight: 80 }];

    expect(paginateInstructionSteps(steps, 100, 100)).toEqual([[], steps]);
  });

  it('keeps an empty instruction list on one page', () => {
    expect(paginateInstructionSteps([], 100)).toEqual([[]]);
  });

  it('rejects a step that cannot fit at the minimum readable text size', () => {
    expect(() => paginateInstructionSteps([{ id: 'too-tall', height: 101 }], 100)).toThrow(
      'An instruction step cannot fit on a page at the minimum readable text size.',
    );
  });

  it('rejects invalid page geometry rather than returning an incomplete layout', () => {
    expect(() => paginateInstructionSteps([], 0)).toThrow(
      'The available page height must be a positive finite number.',
    );
  });
});
