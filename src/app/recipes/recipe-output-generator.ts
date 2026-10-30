import html2canvas from 'html2canvas';
import {
  paginateInstructionSteps,
  RECIPE_OUTPUT_PAGE,
  type RecipeDownloadFormat,
} from '../../lib/recipes/recipe-output-rules';

export type RecipeOutputSettings = {
  repeatIngredients: boolean;
  includeInstructionPhotos: boolean;
  useEmphasisColors: boolean;
  includePrivateDetails: boolean;
};

export type RecipeOutputFormat = 'print' | RecipeDownloadFormat;

export type RenderedRecipeOutput = {
  printHtml: string;
  pages: HTMLElement[];
  title: string;
} & (
  | { format: 'html'; html: string }
  | { format: Exclude<RecipeOutputFormat, 'html'>; html: null }
);

export type RecipeOutputProgress = (message: string) => void;

const CSS_PIXELS_PER_INCH = 96;
const PAGE_MARGIN = (RECIPE_OUTPUT_PAGE.marginPoints / 72) * CSS_PIXELS_PER_INCH;
const OUTPUT_PAGE_WIDTH =
  ((RECIPE_OUTPUT_PAGE.widthPoints - RECIPE_OUTPUT_PAGE.marginPoints * 2) / 72) *
  CSS_PIXELS_PER_INCH;
const OUTPUT_PAGE_HEIGHT =
  ((RECIPE_OUTPUT_PAGE.heightPoints - RECIPE_OUTPUT_PAGE.marginPoints * 2) / 72) *
  CSS_PIXELS_PER_INCH;
const PNG_PAGE_WIDTH = (RECIPE_OUTPUT_PAGE.widthPoints / 72) * RECIPE_OUTPUT_PAGE.dpi;
const PNG_PAGE_HEIGHT = (RECIPE_OUTPUT_PAGE.heightPoints / 72) * RECIPE_OUTPUT_PAGE.dpi;
const MINIMUM_FONT_SIZE = (RECIPE_OUTPUT_PAGE.minimumTextMillimeters / 25.4) * CSS_PIXELS_PER_INCH;
const INSTRUCTION_LAYOUT_SAFETY_MARGIN = 8;

const outputStyles = `
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #f0f1ed; color: #171914; font-family: "DM Sans Variable", sans-serif; }
  .recipe-output-page {
    position: relative;
    display: flex;
    width: ${OUTPUT_PAGE_WIDTH}px;
    height: ${OUTPUT_PAGE_HEIGHT}px;
    flex-direction: column;
    overflow: hidden;
    background: white;
    color: #171914;
    font-size: ${MINIMUM_FONT_SIZE}px;
    line-height: 1.28;
  }
  .recipe-output-page :where(*) { font-size: inherit; }
  .recipe-output-header { flex: 0 0 auto; margin-bottom: 10px; }
  .recipe-output-header h1 { margin: 0 0 4px; font-size: 20px; line-height: 1.15; }
  .recipe-output-header .recipe-attribution {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 6px;
    margin: 0;
    font-size: 10px;
  }
  .recipe-output-metadata {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 4px 12px;
    margin: 8px 0 0;
    line-height: 1.25;
  }
  .recipe-output-metadata > div {
    display: flex;
    flex: 0 1 auto;
    align-items: baseline;
    gap: 5px;
    line-height: 1.25;
  }
  .recipe-output-metadata dt {
    color: #596057;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.25;
    text-transform: uppercase;
  }
  .recipe-output-metadata dd {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 10px;
    line-height: 1.25;
  }
  .recipe-output-columns {
    display: grid;
    min-height: 0;
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 0.35fr) minmax(0, 0.65fr);
    gap: 18px;
  }
  .recipe-output-columns.is-instruction-only { grid-template-columns: minmax(0, 1fr); }
  .recipe-output-column { min-width: 0; min-height: 0; overflow: hidden; }
  .recipe-output-column > .recipe-detail-section { margin: 0; border: 0; padding: 0; }
  .recipe-output-column h2 { margin: 0 0 7px; font-size: 15px; line-height: 1.2; }
  .recipe-output-column h3 { margin: 6px 0 3px; font-size: 12px; }
  .recipe-output-column h4, .recipe-output-column h5, .recipe-output-column h6 {
    font-size: ${MINIMUM_FONT_SIZE}px;
  }
  .recipe-output-column p { margin: 0 0 5px; }
  .recipe-output-column ol, .recipe-output-column ul { margin: 0; padding-left: 20px; }
  .recipe-output-column li + li { margin-top: 5px; }
  .recipe-output-column .recipe-instruction-list > li { display: flow-root; }
  .recipe-output-column .recipe-instruction-list { line-height: 1.45; }
  .recipe-output-column .recipe-instruction-list > li:has(.recipe-instruction-photo) + li {
    margin-top: 0;
  }
  .recipe-output-column .recipe-instruction-photo {
    display: block;
    clear: both;
    float: none !important;
    margin: 12px 0;
    cursor: default;
  }
  .recipe-output-column .recipe-instruction-list p:has(.recipe-instruction-photo) { margin-bottom: 0; }
  .recipe-output-column .recipe-reader-unit-trigger,
  .recipe-output-column .recipe-reader-unit-trigger * {
    cursor: default !important;
    text-decoration: none !important;
  }
  .recipe-output-column table { width: 100%; border-collapse: collapse; }
  .recipe-output-column th, .recipe-output-column td {
    padding: 2px 4px;
    border-bottom: 1px solid #d5d7d1;
    text-align: left;
    vertical-align: top;
  }
  .recipe-output-column .recipe-ingredient-first-table tbody tr[data-ingredient-stripe="odd"] > th,
  .recipe-output-column .recipe-ingredient-first-table tbody tr[data-ingredient-stripe="odd"] > td {
    background-color: #edf4e9;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .recipe-output-column .recipe-ingredient-first-table tbody tr.recipe-ingredient-set-divider + tr > th,
  .recipe-output-column .recipe-ingredient-first-table tbody tr.recipe-ingredient-set-divider + tr > td {
    border-top: 1px solid #d5d7d1;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .recipe-output-column .recipe-ingredient-table tbody tr:not(.recipe-ingredient-set-divider) > th {
    font-weight: 500;
  }
  .recipe-output-column .recipe-reader-table-name,
  .recipe-output-column .recipe-reader-specifics { display: block; }
  .recipe-output-column .recipe-reader-table-name { font-weight: 500; }
  .recipe-output-column .recipe-reader-specifics {
    margin: 2px 0 0 0.75em;
    color: #596057;
    font-size: inherit;
    font-weight: 400;
    text-transform: none;
  }
  .recipe-output-column .recipe-ingredient-set-divider > th { border: 0; }
  .recipe-output-column .recipe-ingredient-set-divider > th > h3,
  .recipe-output-column .recipe-ingredient-list > .recipe-ingredient-set-divider > h3 {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    margin: 6px 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 12px;
    font-style: italic;
    font-weight: 600;
    line-height: 1.2;
    text-align: center;
  }
  .recipe-output-column .recipe-ingredient-set-divider > th > h3::before,
  .recipe-output-column .recipe-ingredient-set-divider > th > h3::after,
  .recipe-output-column .recipe-ingredient-list > .recipe-ingredient-set-divider > h3::before,
  .recipe-output-column .recipe-ingredient-list > .recipe-ingredient-set-divider > h3::after {
    display: block;
    border-top: 1px solid #a3a69f;
    content: "";
  }
  .recipe-output-column .recipe-reader-heading { display: block; margin-bottom: 5px; }
  .recipe-output-column .recipe-reader-controls,
  .recipe-output-column .recipe-screen-only,
  .recipe-output-column .visually-hidden,
  .recipe-output-column .recipe-reader-subtitle { display: none !important; }
  .recipe-output-column .recipe-instruction-photo :is(img, .framed-media-image) {
    display: block;
    max-height: ${OUTPUT_PAGE_HEIGHT * 0.35}px;
  }
  .recipe-output-column img { max-width: 100%; height: auto; }
  .recipe-output-column a { color: inherit; text-decoration: underline; }
  .recipe-output-column .recipe-ingredient-set-divider { list-style: none; }
  .recipe-output-column .recipe-ingredient-list > .recipe-ingredient-set-divider h3 {
    margin-left: -20px;
  }
  .recipe-output-extra { flex: 0 0 auto; margin-top: 6px; }
  .recipe-output-footer {
    display: flex;
    flex: 0 0 auto;
    justify-content: flex-end;
    margin-top: 5px;
    border-top: 1px solid #d5d7d1;
    padding-top: 3px;
    color: #596057;
    font-size: 9px;
  }
  .recipe-output-paper {
    width: ${OUTPUT_PAGE_WIDTH + PAGE_MARGIN * 2}px;
    height: ${OUTPUT_PAGE_HEIGHT + PAGE_MARGIN * 2}px;
    padding: ${PAGE_MARGIN}px;
    background: white;
  }
  .recipe-output-raster-paper { width: 100%; height: 100%; background: white; }
  .recipe-output-stage {
    position: fixed;
    z-index: -1;
    top: 0;
    left: -12000px;
    width: ${OUTPUT_PAGE_WIDTH}px;
    visibility: hidden;
    pointer-events: none;
  }
  .recipe-output-stage .recipe-output-page,
  .recipe-output-raster-paper .recipe-output-page { margin: 0; box-shadow: none; }
  .recipe-output-document { display: block; }
  @page { size: letter landscape; margin: 0; }
  @media screen {
    .recipe-output-page { margin: 24px auto; box-shadow: 0 1px 5px #0002; }
  }
  @media print {
    html, body { width: auto; background: white; }
    .recipe-output-paper { margin: 0; break-after: page; page-break-after: always; }
    .recipe-output-paper:last-child { break-after: auto; page-break-after: auto; }
    .recipe-output-page { margin: 0; box-shadow: none; break-after: auto; page-break-after: auto; }
    .recipe-output-print-pages { display: block; }
  }
`;

type OutputPage = {
  stage: HTMLElement;
  paper: HTMLDivElement;
  page: HTMLElement;
  footer: HTMLElement;
  instructionColumn: HTMLElement;
  ingredientColumn: HTMLElement;
  instructionsList: HTMLOListElement | null;
  extraColumn: HTMLElement;
};

type MeasuredStep = {
  index: number;
  element: HTMLElement;
  height: number;
  continuationHeight: number;
};

type IngredientUnit = HTMLElement[];

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new DOMException('Output generation was canceled.', 'AbortError');
  }
}

function nextFrame(signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const frame = requestAnimationFrame(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    });
    const abort = () => {
      cancelAnimationFrame(frame);
      reject(new DOMException('Output generation was canceled.', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function cloneReadableNode(
  source: HTMLElement,
  settings: RecipeOutputSettings,
  preserveSourceFontSize = false,
): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  const emphasisSelector = [
    '.recipe-instruction-mention',
    '.recipe-instruction-duration',
    '.recipe-instruction-duration > span',
    '.recipe-instruction-temperature',
    '.recipe-instruction-temperature > span',
    '.recipe-reader-ingredient-mention',
  ].join(', ');
  const sourceEmphasis = [
    ...(source.matches(emphasisSelector) ? [source] : []),
    ...source.querySelectorAll<HTMLElement>(emphasisSelector),
  ];
  const cloneEmphasis = [
    ...(clone.matches(emphasisSelector) ? [clone] : []),
    ...clone.querySelectorAll<HTMLElement>(emphasisSelector),
  ];
  sourceEmphasis.forEach((element, index) => {
    const outputElement = cloneEmphasis[index];
    if (!outputElement) return;
    if (settings.useEmphasisColors) {
      const style = window.getComputedStyle(element);
      outputElement.style.color = style.color;
      outputElement.style.fontWeight = style.fontWeight;
    } else {
      outputElement.style.color = 'inherit';
      outputElement.style.fontWeight = 'inherit';
      outputElement.style.textDecoration = 'none';
    }
  });
  clone
    .querySelectorAll(
      '.recipe-screen-only, .recipe-detail-tags-row, .recipe-public-title-actions, .image-viewer-dialog, dialog, [role="tooltip"]',
    )
    .forEach((element) => {
      element.remove();
    });
  if (!settings.includePrivateDetails) {
    clone.querySelectorAll('[data-private-output-only]').forEach((element) => {
      element.remove();
    });
  }
  clone.querySelectorAll('[id], [aria-labelledby], [aria-describedby]').forEach((element) => {
    element.removeAttribute('id');
    element.removeAttribute('aria-labelledby');
    element.removeAttribute('aria-describedby');
  });
  if (!settings.includeInstructionPhotos) {
    clone.querySelectorAll('.recipe-instruction-photo').forEach((element) => {
      element.remove();
    });
  }
  clone.querySelectorAll('button').forEach((button) => {
    const hasImage = button.querySelector('img, svg image') !== null;
    if (!hasImage && !button.textContent?.trim()) {
      button.remove();
      return;
    }
    const replacement = document.createElement('span');
    replacement.className = button.className;
    replacement.style.cssText = button.style.cssText;
    replacement.append(...Array.from(button.childNodes));
    button.replaceWith(replacement);
  });
  clone.querySelectorAll('input, select, textarea').forEach((element) => {
    element.remove();
  });
  if (!preserveSourceFontSize) {
    clone.querySelectorAll<HTMLElement>('*').forEach((element) => {
      element.style.removeProperty('font-size');
    });
  }
  return clone;
}

function appendCloned(
  parent: HTMLElement,
  source: HTMLElement | null,
  settings: RecipeOutputSettings,
): HTMLElement | null {
  if (!source) return null;
  const clone = cloneReadableNode(source, settings);
  parent.append(clone);
  return clone;
}

function getIngredientUnits(source: HTMLElement): IngredientUnit[] {
  const list = source.querySelector<HTMLElement>('ol.recipe-ingredient-list');
  const tableBody = source.querySelector<HTMLTableSectionElement>(
    'table.recipe-ingredient-first-table tbody',
  );
  const container = list ?? tableBody;
  if (!container) {
    throw new Error('The ingredients cannot be paginated at the minimum readable text size.');
  }

  const units: IngredientUnit[] = [];
  let pendingDivider: HTMLElement | null = null;
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.classList.contains('recipe-ingredient-set-divider')) {
      if (pendingDivider) units.push([pendingDivider]);
      pendingDivider = child;
      continue;
    }
    units.push(pendingDivider ? [pendingDivider, child] : [child]);
    pendingDivider = null;
  }
  if (pendingDivider) units.push([pendingDivider]);
  return units;
}

function createIngredientFragment(
  source: HTMLElement,
  units: readonly IngredientUnit[],
): HTMLElement {
  const fragment = source.cloneNode(true) as HTMLElement;
  const list = fragment.querySelector<HTMLElement>('ol.recipe-ingredient-list');
  const tableBody = fragment.querySelector<HTMLTableSectionElement>(
    'table.recipe-ingredient-first-table tbody',
  );
  const container = list ?? tableBody;
  if (!container) {
    throw new Error('The ingredients cannot be paginated at the minimum readable text size.');
  }
  container.replaceChildren(...units.flatMap((unit) => unit.map((item) => item.cloneNode(true))));
  return fragment;
}

function createOutputMetadataRow(metadata: HTMLDListElement, label: string, value: string) {
  const row = document.createElement('div');
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value;
  row.append(term, description);
  metadata.append(row);
}

function createOutputMetadata(
  source: HTMLElement,
  settings: RecipeOutputSettings,
): HTMLDListElement | null {
  const clone = cloneReadableNode(source, settings);
  const metadata = document.createElement('dl');
  metadata.className = 'recipe-output-metadata recipe-metadata';

  if (source.classList.contains('recipe-public-summary')) {
    clone.querySelectorAll<HTMLElement>('.recipe-time-list > div').forEach((row) => {
      metadata.append(row.cloneNode(true));
    });
    for (const section of clone.querySelectorAll<HTMLElement>('.recipe-detail-section')) {
      const heading = section.querySelector<HTMLElement>('h2')?.textContent?.trim();
      const equipment = section.querySelectorAll('.recipe-relationship-list > li');
      if (heading && equipment.length > 0) {
        createOutputMetadataRow(
          metadata,
          heading,
          Array.from(equipment, (item) => item.textContent?.trim() ?? '').join(', '),
        );
      }
    }
  } else {
    clone.querySelectorAll<HTMLElement>('dl.recipe-metadata > div').forEach((row) => {
      metadata.append(row.cloneNode(true));
    });
  }

  return metadata.childElementCount > 0 ? metadata : null;
}

function createOutputPage(
  titleSource: HTMLElement,
  metadataSources: HTMLElement[],
  ingredientSource: HTMLElement | null,
  instructionSource: HTMLElement | null,
  settings: RecipeOutputSettings,
  pageIndex: number,
  stepStart: number,
  stage: HTMLElement,
  ingredientContent?: HTMLElement | null,
): OutputPage {
  const paper = document.createElement('div');
  paper.className = 'recipe-output-paper';
  const page = document.createElement('article');
  page.className = 'recipe-output-page recipes-main';
  page.setAttribute('aria-label', `Recipe page ${pageIndex + 1}`);

  const header = document.createElement('header');
  header.className = 'recipe-output-header';
  appendCloned(
    header,
    titleSource.closest<HTMLElement>('.recipe-detail-title') ?? titleSource,
    settings,
  );
  if (pageIndex === 0) {
    for (const metadata of metadataSources) {
      const metadataClone = createOutputMetadata(metadata, settings);
      if (metadataClone) header.append(metadataClone);
    }
  }

  const columns = document.createElement('div');
  columns.className = 'recipe-output-columns';
  if (!ingredientSource) columns.classList.add('is-instruction-only');
  const ingredientColumn = document.createElement('section');
  ingredientColumn.className = 'recipe-output-column recipe-output-ingredient-column';
  const instructionColumn = document.createElement('section');
  instructionColumn.className = 'recipe-output-column recipe-output-instruction-column';

  if (ingredientContent !== undefined) {
    if (ingredientSource && ingredientContent) {
      appendCloned(ingredientColumn, ingredientContent, settings);
    }
  } else if (ingredientSource && (settings.repeatIngredients || pageIndex === 0)) {
    appendCloned(ingredientColumn, ingredientSource, settings);
  } else if (ingredientSource) {
    columns.classList.add('is-instruction-only');
  }

  let instructionsList: HTMLOListElement | null = null;
  if (instructionSource) {
    const section = cloneReadableNode(instructionSource, settings);
    const sourceList = instructionSource.querySelector('ol.recipe-instruction-list');
    if (sourceList) {
      instructionsList = document.createElement('ol');
      instructionsList.className = sourceList.className;
      instructionsList.start = stepStart + 1;
      instructionsList.style.counterReset = `recipe-instruction ${stepStart}`;
      section.querySelector('ol.recipe-instruction-list')?.replaceWith(instructionsList);
    }
    instructionColumn.append(section);
  }

  const extraColumn = document.createElement('div');
  extraColumn.className = 'recipe-output-extra';
  instructionColumn.append(extraColumn);
  if (!ingredientSource && !instructionSource) columns.classList.add('is-instruction-only');

  const footer = document.createElement('footer');
  footer.className = 'recipe-output-footer';
  footer.textContent = `Page ${pageIndex + 1}`;
  columns.append(ingredientColumn, instructionColumn);
  page.append(header, columns, footer);
  paper.append(page);
  stage.append(paper);

  return {
    stage,
    paper,
    page,
    footer,
    instructionColumn,
    ingredientColumn,
    instructionsList,
    extraColumn,
  };
}

async function paginateIngredientsForPrint(
  titleSource: HTMLElement,
  metadataSources: HTMLElement[],
  ingredientSource: HTMLElement,
  instructionSource: HTMLElement | null,
  settings: RecipeOutputSettings,
  stage: HTMLElement,
  signal: AbortSignal,
): Promise<IngredientUnit[][]> {
  const units = getIngredientUnits(ingredientSource);
  const pages: IngredientUnit[][] = [];
  let pageIndex = 0;
  let currentUnits: IngredientUnit[] = [];
  let measurementPage = createOutputPage(
    titleSource,
    metadataSources,
    ingredientSource,
    instructionSource,
    settings,
    pageIndex,
    0,
    stage,
    createIngredientFragment(ingredientSource, []),
  );
  await nextFrame(signal);

  const renderUnits = (items: IngredientUnit[]) => {
    measurementPage.ingredientColumn.replaceChildren();
    appendCloned(
      measurementPage.ingredientColumn,
      createIngredientFragment(ingredientSource, items),
      settings,
    );
  };
  const createContinuationPage = async () => {
    measurementPage.paper.remove();
    pageIndex += 1;
    measurementPage = createOutputPage(
      titleSource,
      metadataSources,
      ingredientSource,
      instructionSource,
      settings,
      pageIndex,
      0,
      stage,
      createIngredientFragment(ingredientSource, []),
    );
    await nextFrame(signal);
  };
  const exceedsCapacity = () =>
    measurementPage.ingredientColumn.scrollHeight > measurementPage.ingredientColumn.clientHeight;

  for (const unit of units) {
    throwIfAborted(signal);
    currentUnits.push(unit);
    renderUnits(currentUnits);
    if (!exceedsCapacity()) continue;

    currentUnits.pop();
    if (currentUnits.length > 0) {
      pages.push(currentUnits);
      currentUnits = [unit];
      await createContinuationPage();
      renderUnits(currentUnits);
      if (exceedsCapacity()) {
        throw new Error(
          'An ingredient item cannot fit on a page at the minimum readable text size.',
        );
      }
      continue;
    }

    if (pageIndex === 0) {
      pages.push([]);
      currentUnits = [unit];
      await createContinuationPage();
      renderUnits(currentUnits);
      if (exceedsCapacity()) {
        throw new Error(
          'An ingredient item cannot fit on a page at the minimum readable text size.',
        );
      }
      continue;
    }

    throw new Error('An ingredient item cannot fit on a page at the minimum readable text size.');
  }

  if (currentUnits.length > 0 || pages.length === 0) pages.push(currentUnits);
  measurementPage.paper.remove();
  return pages;
}

function instructionCapacity(page: OutputPage): number {
  const section = page.instructionColumn.querySelector('.recipe-detail-section');
  if (!section) return page.instructionColumn.clientHeight;
  const heading = section.querySelector('h2');
  const list = section.querySelector('ol');
  const headingHeight = heading?.getBoundingClientRect().height ?? 0;
  const headingStyle = heading ? getComputedStyle(heading) : null;
  const listStyle = list ? getComputedStyle(list) : null;
  const headingSpacing =
    (Number.parseFloat(headingStyle?.marginTop ?? '0') || 0) +
    (Number.parseFloat(headingStyle?.marginBottom ?? '0') || 0);
  const listSpacing =
    (Number.parseFloat(listStyle?.marginTop ?? '0') || 0) +
    (Number.parseFloat(listStyle?.marginBottom ?? '0') || 0);
  return Math.max(
    0,
    page.instructionColumn.clientHeight -
      headingHeight -
      headingSpacing -
      listSpacing -
      INSTRUCTION_LAYOUT_SAFETY_MARGIN,
  );
}

function measureSteps(
  sourceItems: HTMLElement[],
  page: OutputPage,
  settings: RecipeOutputSettings,
): MeasuredStep[] {
  if (!page.instructionsList) return [];
  const measurementList = document.createElement('ol');
  measurementList.className = page.instructionsList.className;
  measurementList.style.cssText = `position:absolute;left:-12000px;top:0;width:${page.instructionColumn.clientWidth}px;margin:0;padding-left:24px;`;
  page.instructionColumn.append(measurementList);
  const measured = sourceItems.map((source, index) => {
    const element = cloneReadableNode(source, settings);
    measurementList.append(element);
    const style = getComputedStyle(element);
    const height =
      element.getBoundingClientRect().height +
      (Number.parseFloat(style.marginTop) || 0) +
      (Number.parseFloat(style.marginBottom) || 0) +
      (index === 0 ? 0 : 8);
    element.remove();
    return { index, element, height, continuationHeight: height };
  });
  measurementList.remove();
  return measured;
}

type OutputImage = HTMLImageElement | SVGImageElement;

function getImageUrl(image: OutputImage): string {
  if (image instanceof HTMLImageElement) return image.currentSrc || image.src;
  return image.href.baseVal || image.getAttribute('href') || image.getAttribute('xlink:href') || '';
}

function setImageUrl(image: OutputImage, source: string): void {
  if (image instanceof HTMLImageElement) {
    image.src = source;
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
  } else {
    image.setAttribute('href', source);
    image.removeAttribute('xlink:href');
  }
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('An instruction photo could not be embedded.'));
    });
    reader.addEventListener('error', () =>
      reject(new Error('An instruction photo could not be embedded.')),
    );
    reader.readAsDataURL(blob);
  });
}

async function embedImages(
  roots: HTMLElement[],
  signal: AbortSignal,
  progress: RecipeOutputProgress,
): Promise<void> {
  const images: OutputImage[] = roots.flatMap((root) => [
    ...Array.from(root.querySelectorAll<HTMLImageElement>('img')),
    ...Array.from(root.querySelectorAll<SVGImageElement>('svg image')),
  ]);
  const embedded = new Map<string, string>();
  for (const [index, image] of images.entries()) {
    throwIfAborted(signal);
    const source = getImageUrl(image);
    if (!source) throw new Error('An instruction photo is missing its image source.');
    if (!source.startsWith('data:')) {
      let dataUri = embedded.get(source);
      if (!dataUri) {
        const response = await fetch(source, { signal });
        if (!response.ok) {
          throw new Error(
            'An instruction photo could not be loaded. Check the connection and retry.',
          );
        }
        try {
          dataUri = await blobToDataUri(await response.blob());
        } catch (error) {
          if (signal.aborted) throw error;
          throw new Error(
            'An instruction photo could not be embedded. Check the connection and retry.',
          );
        }
        embedded.set(source, dataUri);
      }
      setImageUrl(image, dataUri);
    }
    progress(`Preparing images (${index + 1} of ${images.length})...`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function inlineStylesheetAssets(
  css: string,
  baseUri: string,
  signal: AbortSignal,
): Promise<string> {
  const urls = Array.from(css.matchAll(/url\((['"]?)(.*?)\1\)/gi), (match) => match[2]).filter(
    (url): url is string => Boolean(url) && !url.startsWith('data:') && !url.startsWith('#'),
  );
  const assets = new Map<string, string>();
  for (const assetPath of urls) {
    throwIfAborted(signal);
    if (assets.has(assetPath)) continue;
    const url = new URL(assetPath, baseUri);
    if (url.origin !== window.location.origin) {
      throw new Error(`The standalone HTML styles require an external resource (${url.origin}).`);
    }
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(
        `A stylesheet resource could not be embedded for offline HTML (${url.pathname}, ${response.status}).`,
      );
    }
    assets.set(assetPath, await blobToDataUri(await response.blob()));
  }

  return css.replace(/url\((['"]?)(.*?)\1\)/gi, (match, _quote: string, assetPath: string) => {
    const embedded = assets.get(assetPath);
    return embedded ? `url("${embedded}")` : match;
  });
}

async function getStandaloneStyles(signal: AbortSignal): Promise<string> {
  const stylesheetRules: string[] = [];
  for (const stylesheet of Array.from(document.styleSheets)) {
    if (
      stylesheet.ownerNode instanceof HTMLStyleElement &&
      stylesheet.ownerNode.textContent === outputStyles
    ) {
      continue;
    }
    if (stylesheet.href && new URL(stylesheet.href).origin !== window.location.origin) continue;
    let css: string;
    try {
      css = Array.from(stylesheet.cssRules)
        .filter((rule) => rule.type !== CSSRule.IMPORT_RULE)
        .map((rule) => rule.cssText)
        .join('\n');
    } catch {
      throw new Error('A recipe stylesheet could not be embedded for offline HTML.');
    }
    stylesheetRules.push(
      await inlineStylesheetAssets(css, stylesheet.href ?? document.baseURI, signal),
    );
  }
  const baseStyles = stylesheetRules.join('\n');
  return `${baseStyles}
    .recipe-output-document { display: block; min-height: 100vh; }
    .recipe-output-document.private-content { display: block; }
    .recipe-output-document .recipe-attribution {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0 6px;
    }
    .recipe-output-document .recipe-output-metadata {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 4px 16px;
      margin: 8px 0 0;
      line-height: 1.3;
    }
    .recipe-output-document .recipe-output-metadata > div {
      display: flex;
      align-items: baseline;
      gap: 6px;
      line-height: 1.3;
    }
    .recipe-output-document .recipe-output-metadata dt {
      font-size: 13px;
      line-height: 1.2;
    }
    .recipe-output-document .recipe-output-metadata dd {
      margin: 0;
      font-size: 14px;
      line-height: 1.3;
    }
    .recipe-output-document .recipe-reader-table-name,
    .recipe-output-document .recipe-reader-specifics {
      display: block;
    }
    .recipe-output-document .recipe-reader-table-name {
      font-weight: 500;
    }
    .recipe-output-document .recipe-reader-specifics {
      margin: 2px 0 0 0.75em;
      color: #596057;
      font-size: inherit;
      font-weight: 400;
      text-transform: none;
    }
    .recipe-output-document .recipe-output-metadata dd { margin: 0; }
    .recipe-output-document .recipe-summary-layout { display: block; }
    .recipe-output-document .recipe-public-overview { display: block; }
    .recipe-output-document .recipe-photo-gallery,
    .recipe-output-document .recipe-detail-tags-row,
    .recipe-output-document .offline-page-status { display: none !important; }
    .recipe-output-document .recipe-reader-unit-trigger,
    .recipe-output-document .recipe-reader-unit-trigger *,
    .recipe-output-document .recipe-instruction-photo { cursor: default !important; }
    .recipe-output-document .recipe-reader-unit-trigger,
    .recipe-output-document .recipe-reader-unit-trigger * { text-decoration: none !important; }
    .recipe-output-document .recipe-instruction-photo {
      display: block;
      clear: both;
      float: none !important;
      margin: 12px 0;
    }
    .recipe-output-document main.recipes-main { min-height: 0; }
    .recipe-output-document .recipe-instruction-list { list-style: decimal; counter-reset: none; }
    .recipe-output-document .recipe-instruction-list > li { display: list-item; position: static; }
    .recipe-output-document .recipe-instruction-list > li::before { content: none !important; }
    @media print {
      .recipe-output-document { min-height: 0; }
    }`;
}

function createStandaloneMain(source: HTMLElement, settings: RecipeOutputSettings): HTMLElement {
  const clone = cloneReadableNode(source, settings, true);
  clone.removeAttribute('id');
  clone.removeAttribute('aria-labelledby');
  clone
    .querySelectorAll<HTMLElement>('.recipe-print-metadata, .recipe-public-summary')
    .forEach((metadata) => {
      const outputMetadata = createOutputMetadata(metadata, settings);
      if (outputMetadata) metadata.replaceWith(outputMetadata);
      else metadata.remove();
    });
  clone.querySelectorAll('.recipe-photo-gallery, .offline-page-status').forEach((element) => {
    element.remove();
  });
  clone.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    const url = new URL(link.href, window.location.origin);
    if (url.origin === window.location.origin) {
      link.replaceWith(...Array.from(link.childNodes));
    }
  });
  return clone;
}

function serializeHtml(
  title: string,
  recipeMain: HTMLElement,
  styles: string,
  wrapperClass: string,
): string {
  const privateContentClass = wrapperClass ? ` ${escapeHtml(wrapperClass)}` : '';
  const bodyClass = escapeHtml(document.body.className);
  return `<!doctype html>
<html lang="${escapeHtml(document.documentElement.lang || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${styles}</style>
</head>
<body class="${bodyClass}"><div class="recipe-output-document${privateContentClass}">${recipeMain.outerHTML}</div></body>
</html>`;
}

function serializePrintHtml(title: string, pages: OutputPage[], wrapperClass: string): string {
  const printPages = document.createElement('div');
  printPages.className = 'recipe-output-print-pages';
  for (const { paper } of pages) {
    printPages.append(paper.cloneNode(true));
  }
  return serializeHtml(title, printPages, outputStyles, wrapperClass);
}

export async function generateRecipeOutputDocument(
  main: HTMLElement,
  settings: RecipeOutputSettings,
  format: RecipeOutputFormat,
  signal: AbortSignal,
  progress: RecipeOutputProgress,
): Promise<RenderedRecipeOutput> {
  const titleSource = main.querySelector<HTMLElement>('h1');
  if (!titleSource) throw new Error('The recipe title is unavailable for output.');
  const title =
    Array.from(titleSource.childNodes)
      .filter(
        (node) =>
          !(
            node instanceof HTMLElement &&
            (node.classList.contains('recipe-public-serves-inline') ||
              node.classList.contains('recipe-public-makes-inline'))
          ),
      )
      .map((node) => node.textContent ?? '')
      .join('')
      .trim() || 'Recipe';
  const ingredientSource = main.querySelector<HTMLElement>('[aria-labelledby="ingredients-title"]');
  const instructionSource = main.querySelector<HTMLElement>(
    'section[aria-labelledby="instructions-title"]',
  );
  const metadataSources = Array.from(
    main.querySelectorAll<HTMLElement>('.recipe-print-metadata, .recipe-public-summary'),
  );
  const excludedSources = [ingredientSource, instructionSource, ...metadataSources].filter(
    (source): source is HTMLElement => source !== null,
  );
  const extraSources = Array.from(
    main.querySelectorAll<HTMLElement>('.recipe-detail-section'),
  ).filter(
    (section) =>
      !excludedSources.some((source) => source === section || source.contains(section)) &&
      (settings.includePrivateDetails || !section.hasAttribute('data-private-output-only')),
  );
  const sourceList = instructionSource?.querySelector<HTMLOListElement>(
    'ol.recipe-instruction-list',
  );
  const sourceSteps = sourceList
    ? Array.from(sourceList.children).filter(
        (element): element is HTMLElement => element instanceof HTMLElement,
      )
    : [];
  const privateContentClass = main.closest<HTMLElement>('.private-content')?.className ?? '';
  const stage = document.createElement('div');
  stage.className = `recipe-output-stage${privateContentClass ? ` ${privateContentClass}` : ''}`;
  const style = document.createElement('style');
  style.textContent = outputStyles;
  stage.append(style);
  document.body.append(stage);
  try {
    let measurementPage = createOutputPage(
      titleSource,
      metadataSources,
      ingredientSource,
      instructionSource,
      settings,
      0,
      0,
      stage,
    );
    let continuationMeasurementPage = createOutputPage(
      titleSource,
      metadataSources,
      ingredientSource,
      instructionSource,
      settings,
      1,
      0,
      stage,
    );
    await nextFrame(signal);
    let ingredientPageUnits: IngredientUnit[][] | null = null;
    const ingredientOverflow =
      ingredientSource &&
      measurementPage.ingredientColumn.scrollHeight > measurementPage.ingredientColumn.clientHeight;
    if (ingredientOverflow) {
      if (format !== 'print' || !ingredientSource) {
        throw new Error(
          'The complete ingredients column cannot fit at the minimum 3 mm text size.',
        );
      }

      measurementPage.paper.remove();
      continuationMeasurementPage.paper.remove();
      ingredientPageUnits = await paginateIngredientsForPrint(
        titleSource,
        metadataSources,
        ingredientSource,
        instructionSource,
        settings,
        stage,
        signal,
      );
      const emptyIngredientFragment = createIngredientFragment(ingredientSource, []);
      measurementPage = createOutputPage(
        titleSource,
        metadataSources,
        ingredientSource,
        instructionSource,
        settings,
        0,
        0,
        stage,
        emptyIngredientFragment,
      );
      continuationMeasurementPage = createOutputPage(
        titleSource,
        metadataSources,
        ingredientSource,
        instructionSource,
        settings,
        1,
        0,
        stage,
        emptyIngredientFragment,
      );
      await nextFrame(signal);
    }

    const availableInstructionHeight = instructionCapacity(measurementPage);
    const continuationInstructionHeight = instructionCapacity(continuationMeasurementPage);
    const firstPageSteps = measureSteps(sourceSteps, measurementPage, settings);
    const continuationSteps = measureSteps(sourceSteps, continuationMeasurementPage, settings);
    const measuredSteps = firstPageSteps.map((step, index) => ({
      ...step,
      continuationHeight: continuationSteps[index]?.height ?? step.height,
    }));
    measurementPage.paper.remove();
    continuationMeasurementPage.paper.remove();
    const instructionPageGroups = paginateInstructionSteps(
      measuredSteps,
      availableInstructionHeight,
      continuationInstructionHeight,
    );
    const pageCount = Math.max(instructionPageGroups.length, ingredientPageUnits?.length ?? 0);
    const pages = Array.from({ length: pageCount }, (_, pageIndex) => {
      const steps = instructionPageGroups[pageIndex] ?? [];
      const firstStep = steps[0]?.index ?? 0;
      const ingredientContent =
        ingredientPageUnits && ingredientSource
          ? ingredientPageUnits[pageIndex]
            ? createIngredientFragment(ingredientSource, ingredientPageUnits[pageIndex] ?? [])
            : null
          : undefined;
      const outputPage = createOutputPage(
        titleSource,
        metadataSources,
        ingredientSource,
        instructionSource,
        settings,
        pageIndex,
        firstStep,
        stage,
        ingredientContent,
      );
      for (const step of steps) {
        const source = sourceSteps[step.index];
        if (!source || !outputPage.instructionsList) continue;
        outputPage.instructionsList.append(cloneReadableNode(source, settings));
      }
      return outputPage;
    });

    if (pages.length === 0) {
      pages.push(
        createOutputPage(
          titleSource,
          metadataSources,
          ingredientSource,
          instructionSource,
          settings,
          0,
          0,
          stage,
          ingredientPageUnits ? null : undefined,
        ),
      );
    }

    await nextFrame(signal);
    for (const page of pages) {
      if (
        ingredientSource &&
        page.ingredientColumn.scrollHeight > page.ingredientColumn.clientHeight
      ) {
        throw new Error(
          ingredientPageUnits
            ? 'An ingredient item cannot fit on a page at the minimum readable text size.'
            : 'The complete ingredients column cannot fit at the minimum 3 mm text size.',
        );
      }
      if (
        page.instructionsList &&
        page.instructionColumn.scrollHeight > page.instructionColumn.clientHeight
      ) {
        throw new Error(
          'An instruction step cannot fit on a page at the minimum readable text size.',
        );
      }
    }

    for (const source of extraSources) {
      throwIfAborted(signal);
      let page = pages[pages.length - 1];
      if (!page) throw new Error('The recipe output could not create a page.');
      const extra = cloneReadableNode(source, settings);
      page.extraColumn.append(extra);
      await nextFrame(signal);
      if (page.instructionColumn.scrollHeight > page.instructionColumn.clientHeight) {
        extra.remove();
        page = createOutputPage(
          titleSource,
          metadataSources,
          ingredientSource,
          instructionSource,
          settings,
          pages.length,
          sourceSteps.length,
          stage,
          ingredientPageUnits ? null : undefined,
        );
        pages.push(page);
        page.extraColumn.append(extra);
        await nextFrame(signal);
        if (page.instructionColumn.scrollHeight > page.instructionColumn.clientHeight) {
          throw new Error(
            'A recipe detail section cannot fit on a page at the minimum readable text size.',
          );
        }
      }
    }

    for (const [pageIndex, page] of pages.entries()) {
      page.footer.textContent = `Page ${pageIndex + 1} of ${pages.length}`;
    }

    if (format === 'html') {
      const standaloneMain = createStandaloneMain(main, settings);
      await embedImages([...pages.map(({ page }) => page), standaloneMain], signal, progress);
      throwIfAborted(signal);
      const printHtml = serializePrintHtml(title, pages, privateContentClass);
      progress('Preparing standalone HTML styles...');
      const standaloneStyles = await getStandaloneStyles(signal);
      return {
        format,
        html: serializeHtml(title, standaloneMain, standaloneStyles, privateContentClass),
        printHtml,
        pages: pages.map(({ page }) => page),
        title,
      };
    }

    await embedImages(
      pages.map(({ page }) => page),
      signal,
      progress,
    );
    throwIfAborted(signal);
    const printHtml = serializePrintHtml(title, pages, privateContentClass);
    return {
      format,
      html: null,
      printHtml,
      pages: pages.map(({ page }) => page),
      title,
    };
  } finally {
    stage.remove();
  }
}

async function renderPageCanvas(
  page: HTMLElement,
  signal: AbortSignal,
): Promise<HTMLCanvasElement> {
  throwIfAborted(signal);
  const paperWidth = OUTPUT_PAGE_WIDTH + PAGE_MARGIN * 2;
  const paperHeight = OUTPUT_PAGE_HEIGHT + PAGE_MARGIN * 2;
  const stage = document.createElement('div');
  stage.style.cssText = `position:fixed;left:-12000px;top:0;width:${paperWidth}px;height:${paperHeight}px;pointer-events:none;`;
  const style = document.createElement('style');
  style.textContent = outputStyles;
  const paper = document.createElement('div');
  paper.className = 'recipe-output-paper';
  paper.append(page.cloneNode(true));
  stage.append(style, paper);
  document.body.append(stage);
  try {
    const canvas = await html2canvas(paper, {
      backgroundColor: '#ffffff',
      height: paperHeight,
      scale: RECIPE_OUTPUT_PAGE.dpi / CSS_PIXELS_PER_INCH,
      width: paperWidth,
      windowHeight: paperHeight,
      windowWidth: paperWidth,
    });
    throwIfAborted(signal);
    if (canvas.width !== PNG_PAGE_WIDTH || canvas.height !== PNG_PAGE_HEIGHT) {
      throw new Error('The browser rendered a recipe page at an unexpected size.');
    }
    return canvas;
  } finally {
    stage.remove();
  }
}

export async function renderRecipePageBlob(
  page: HTMLElement,
  mimeType: 'image/png' | 'image/jpeg',
  signal: AbortSignal,
): Promise<Blob> {
  const canvas = await renderPageCanvas(page, signal);
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The browser could not create the recipe image.'));
      },
      mimeType,
      mimeType === 'image/jpeg' ? 0.92 : undefined,
    );
  });
}

function concatenateBytes(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function createImagePdf(jpegPages: Blob[]): Promise<Blob> {
  if (jpegPages.length === 0) {
    throw new Error('The PDF output contains no pages.');
  }
  const encoder = new TextEncoder();
  const objects: Uint8Array[] = [];
  const pageIds = jpegPages.map((_, index) => 3 + index * 3);
  const pagesId = 2;
  const catalogId = 1;
  objects[catalogId] = encoder.encode(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  objects[pagesId] = encoder.encode(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
  );

  for (const [index, imageBlob] of jpegPages.entries()) {
    const pageId = pageIds[index];
    if (!pageId) throw new Error('The PDF output could not create a page reference.');
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const imageBytes = new Uint8Array(await imageBlob.arrayBuffer());
    const content = encoder.encode(
      `q\n${RECIPE_OUTPUT_PAGE.widthPoints} 0 0 ${RECIPE_OUTPUT_PAGE.heightPoints} 0 0 cm\n/Im0 Do\nQ`,
    );
    objects[pageId] = encoder.encode(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${RECIPE_OUTPUT_PAGE.widthPoints} ${RECIPE_OUTPUT_PAGE.heightPoints}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects[contentId] = concatenateBytes([
      encoder.encode(`<< /Length ${content.length} >>\nstream\n`),
      content,
      encoder.encode('\nendstream'),
    ]);
    objects[imageId] = concatenateBytes([
      encoder.encode(
        `<< /Type /XObject /Subtype /Image /Width ${PNG_PAGE_WIDTH} /Height ${PNG_PAGE_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
      ),
      imageBytes,
      encoder.encode('\nendstream'),
    ]);
  }

  const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n%RecipeBox\n')];
  const offsets = [0];
  let byteLength = chunks[0]?.length ?? 0;
  for (let id = 1; id < objects.length; id += 1) {
    const object = objects[id];
    if (!object) throw new Error('The PDF output could not serialize a page.');
    const start = encoder.encode(`${id} 0 obj\n`);
    const end = encoder.encode('\nendobj\n');
    offsets[id] = byteLength;
    chunks.push(start, object, end);
    byteLength += start.length + object.length + end.length;
  }
  const xrefOffset = byteLength;
  const xref = [
    `xref\n0 ${objects.length}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
  ].join('');
  const trailer = `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(encoder.encode(xref), encoder.encode(trailer));
  const pdfBytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    pdfBytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new Blob([pdfBytes], { type: 'application/pdf' });
}
