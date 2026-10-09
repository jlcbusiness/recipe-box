import { describe, expect, it } from 'vitest';
import {
  formatIsbnInput,
  normalizeHttpUrl,
  normalizeIsbn,
  validatePublicationDetails,
} from '../../src/lib/publications/validation';

describe('normalizeHttpUrl', () => {
  it('normalizes scheme-less hosts to HTTPS', () => {
    expect(normalizeHttpUrl('  www.example.test/recipes/soup  ')).toBe(
      'https://www.example.test/recipes/soup',
    );
    expect(normalizeHttpUrl('google.com')).toBe('https://google.com/');
  });

  it('preserves explicit HTTP and HTTPS protocols', () => {
    expect(normalizeHttpUrl('http://kitchen.local/')).toBe('http://kitchen.local/');
    expect(normalizeHttpUrl('https://example.test')).toBe('https://example.test/');
  });

  it('rejects non-HTTP protocols and incomplete URLs', () => {
    expect(normalizeHttpUrl('ftp://example.test/book')).toBeNull();
    expect(normalizeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeHttpUrl('//example.test/book')).toBeNull();
    expect(normalizeHttpUrl('www.')).toBeNull();
  });
});

describe('normalizeIsbn', () => {
  it('accepts ISBN-10 and ISBN-13 with separators and returns canonical digits', () => {
    expect(normalizeIsbn('0-306-40615-2')).toBe('0306406152');
    expect(normalizeIsbn('978-0-306-40615-7')).toBe('9780306406157');
  });

  it('accepts an ISBN-10 X check digit', () => {
    expect(normalizeIsbn('0-8044-2957-X')).toBe('080442957X');
  });

  it('rejects invalid check digits and unsupported formats', () => {
    expect(normalizeIsbn('0306406153')).toBeNull();
    expect(normalizeIsbn('9780306406158')).toBeNull();
    expect(normalizeIsbn('12345')).toBeNull();
    expect(normalizeIsbn('')).toBeNull();
  });
});

describe('formatIsbnInput', () => {
  it('adds registered ISBN-10 and ISBN-13 separators while typing', () => {
    expect(formatIsbnInput('030640615')).toBe('0-306-40615');
    expect(formatIsbnInput('978030640615')).toBe('978-0-306-40615');
  });

  it('strips pasted separators and applies the registered hyphenation', () => {
    expect(formatIsbnInput('0-306-40615-2')).toBe('0-306-40615-2');
    expect(formatIsbnInput('978-0-306-40615-7')).toBe('978-0-306-40615-7');
  });

  it('preserves the ISBN-10 X check character', () => {
    expect(formatIsbnInput('080442957X')).toBe('0-8044-2957-X');
  });
});

describe('validatePublicationDetails', () => {
  it('trims and normalizes Book fields while clearing empty optional values', () => {
    expect(
      validatePublicationDetails('book', {
        name: '  Kitchen Notes  ',
        author: '  A. Cook  ',
        edition: ' ',
        isbn: '0-306-40615-2',
        retailerUrl: ' books.example.test/kitchen-notes ',
        siteUrl: 'ignored.example.test',
      }),
    ).toEqual({
      data: {
        name: 'Kitchen Notes',
        author: 'A. Cook',
        edition: null,
        isbn: '0306406152',
        retailerUrl: 'https://books.example.test/kitchen-notes',
        siteUrl: null,
      },
      error: null,
    });
  });

  it('rejects an invalid ISBN and an invalid retailer URL', () => {
    expect(
      validatePublicationDetails('book', {
        name: 'Kitchen Notes',
        author: '',
        edition: '',
        isbn: '0306406153',
        retailerUrl: '',
        siteUrl: '',
      }).error,
    ).toBe('Enter a valid ISBN-10 or ISBN-13.');
    expect(
      validatePublicationDetails('book', {
        name: 'Kitchen Notes',
        author: '',
        edition: '',
        isbn: '',
        retailerUrl: 'javascript:alert(1)',
        siteUrl: '',
      }).error,
    ).toBe('Enter a valid HTTP(S) Retailer URL.');
  });

  it('requires a valid Site URL and ignores fields from other publication types', () => {
    expect(
      validatePublicationDetails('site', {
        name: 'Kitchen Online',
        author: 'Ignored',
        edition: 'Ignored',
        isbn: 'Ignored',
        retailerUrl: 'Ignored',
        siteUrl: '',
      }).error,
    ).toBe('Enter the Site URL.');
    expect(
      validatePublicationDetails('magazine', {
        name: '  Seasonal Table  ',
        author: 'Ignored',
        edition: 'Ignored',
        isbn: 'Ignored',
        retailerUrl: 'Ignored',
        siteUrl: 'Ignored',
      }),
    ).toEqual({
      data: {
        name: 'Seasonal Table',
        author: null,
        edition: null,
        isbn: null,
        retailerUrl: null,
        siteUrl: null,
      },
      error: null,
    });
  });
});
