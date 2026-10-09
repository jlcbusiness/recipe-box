import { asIsbn10, parse } from 'isbn3';

export type PublicationDetails = {
  name: string;
  author: string | null;
  edition: string | null;
  isbn: string | null;
  retailerUrl: string | null;
  siteUrl: string | null;
};

type PublicationDetailsInput = Omit<PublicationDetails, 'name'> & { name: string };

export function validatePublicationDetails(
  publicationType: 'book' | 'magazine' | 'site',
  input: PublicationDetailsInput,
): { data: PublicationDetails | null; error: string | null } {
  const name = input.name.trim();
  if (!name) {
    return { data: null, error: 'Enter a publication name.' };
  }

  if (publicationType === 'book') {
    const isbnValue = input.isbn?.trim() ?? '';
    const isbn = isbnValue ? normalizeIsbn(isbnValue) : null;
    if (isbnValue && !isbn) {
      return { data: null, error: 'Enter a valid ISBN-10 or ISBN-13.' };
    }

    const retailerUrlValue = input.retailerUrl?.trim() ?? '';
    const retailerUrl = retailerUrlValue ? normalizeHttpUrl(retailerUrlValue) : null;
    if (retailerUrlValue && !retailerUrl) {
      return { data: null, error: 'Enter a valid HTTP(S) Retailer URL.' };
    }

    return {
      data: {
        name,
        author: input.author?.trim() || null,
        edition: input.edition?.trim() || null,
        isbn,
        retailerUrl,
        siteUrl: null,
      },
      error: null,
    };
  }

  if (publicationType === 'site') {
    const siteUrlValue = input.siteUrl?.trim() ?? '';
    const siteUrl = siteUrlValue ? normalizeHttpUrl(siteUrlValue) : null;
    if (!siteUrl) {
      return {
        data: null,
        error: siteUrlValue ? 'Enter a valid HTTP(S) Site URL.' : 'Enter the Site URL.',
      };
    }

    return {
      data: {
        name,
        author: null,
        edition: null,
        isbn: null,
        retailerUrl: null,
        siteUrl,
      },
      error: null,
    };
  }

  return {
    data: {
      name,
      author: null,
      edition: null,
      isbn: null,
      retailerUrl: null,
      siteUrl: null,
    },
    error: null,
  };
}

export function normalizeHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('//')) {
    return null;
  }

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== 'www.'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function isbn13CheckDigit(body: string): string {
  const checksum = [...body].reduce(
    (sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return String((10 - (checksum % 10)) % 10);
}

function applyIsbnHyphenation(value: string, template: string | null): string {
  if (!template) {
    return value;
  }

  let valueIndex = 0;
  let formatted = '';
  for (const character of template) {
    if (/[\dX]/.test(character)) {
      if (valueIndex >= value.length) {
        break;
      }
      formatted += value[valueIndex];
      valueIndex += 1;
    } else if (valueIndex > 0 && valueIndex < value.length) {
      formatted += '-';
    }
  }

  return formatted || value;
}

export function formatIsbnInput(value: string): string {
  const normalized = value.toUpperCase().replace(/[^\dX]/g, '');
  const digits = normalized.replace(/X/g, '');
  if (!digits) {
    return '';
  }

  const isIsbn13 = digits.startsWith('978') || digits.startsWith('979') || digits.length > 10;
  const isbn = isIsbn13
    ? digits.slice(0, 13)
    : `${digits.slice(0, 9)}${digits[9] ?? (normalized.endsWith('X') && digits.length === 9 ? 'X' : '')}`;

  if (isIsbn13) {
    const body = isbn.slice(0, 12).padEnd(12, '0');
    const provisionalIsbn = `${body}${isbn13CheckDigit(body)}`;
    return applyIsbnHyphenation(isbn, parse(provisionalIsbn)?.isbn13h ?? null);
  }

  const isbn10Body = isbn.slice(0, 9).replace(/X/g, '').padEnd(9, '0');
  const isbn13Body = `978${isbn10Body}`;
  const provisionalIsbn13 = `${isbn13Body}${isbn13CheckDigit(isbn13Body)}`;
  return applyIsbnHyphenation(isbn, asIsbn10(provisionalIsbn13, true));
}

export function normalizeIsbn(value: string): string | null {
  const isbn = value.replace(/[\s-]/g, '').toUpperCase();

  if (/^\d{9}[\dX]$/.test(isbn)) {
    const checksum = [...isbn].reduce(
      (sum, digit, index) => sum + (digit === 'X' ? 10 : Number(digit)) * (10 - index),
      0,
    );
    return checksum % 11 === 0 ? isbn : null;
  }

  if (/^\d{13}$/.test(isbn)) {
    const checksum = [...isbn.slice(0, 12)].reduce(
      (sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3),
      0,
    );
    const checkDigit = (10 - (checksum % 10)) % 10;
    return checkDigit === Number(isbn[12]) ? isbn : null;
  }

  return null;
}
