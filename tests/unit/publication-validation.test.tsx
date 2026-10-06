import { describe, expect, it } from 'vitest';
import {
  formatIsbnInput,
  normalizeHttpUrl,
  normalizeIsbn,
} from '../../src/lib/publications/validation';

describe('normalizeHttpUrl', () => {
  it('normalizes www addresses to HTTPS', () => {
    expect(normalizeHttpUrl('  www.example.test/recipes/soup  ')).toBe(
      'https://www.example.test/recipes/soup',
    );
  });

  it('preserves explicit HTTP and HTTPS protocols', () => {
    expect(normalizeHttpUrl('http://kitchen.local/')).toBe('http://kitchen.local/');
    expect(normalizeHttpUrl('https://example.test')).toBe('https://example.test/');
  });

  it('rejects non-HTTP protocols and incomplete URLs', () => {
    expect(normalizeHttpUrl('ftp://example.test/book')).toBeNull();
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
