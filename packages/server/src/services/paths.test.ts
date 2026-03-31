import { describe, it, expect } from 'vitest';
import {
  scrubPath,
  titleToFilename,
  filenameToTitle,
  filePathToUrlPath,
  resolveWikilink,
} from './paths.js';

describe('scrubPath', () => {
  it('replaces spaces with underscores', () => {
    expect(scrubPath('My Cool Page')).toBe('My_Cool_Page');
  });

  it('collapses runs of scrubbed characters', () => {
    expect(scrubPath('what   about? #??____this ##page')).toBe('what_about_this_page');
  });

  it('preserves commas, colons, hyphens, periods', () => {
    expect(scrubPath('Filename, with a comma')).toBe('Filename,_with_a_comma');
    expect(scrubPath('Test Page: With A Colon')).toBe('Test_Page:_With_A_Colon');
    expect(scrubPath('keep-hyphens.and.dots')).toBe('keep-hyphens.and.dots');
  });

  it('handles percent and double quotes', () => {
    expect(scrubPath('the 80% good enough claim')).toBe('the_80_good_enough_claim');
    expect(scrubPath('This filename has "double" quotes')).toBe('This_filename_has_double_quotes');
  });

  it('handles leading special characters', () => {
    expect(scrubPath('#octothorpeFirstPage')).toBe('_octothorpeFirstPage');
  });
});

describe('titleToFilename / filenameToTitle', () => {
  it('round-trips a title', () => {
    expect(titleToFilename('My Page')).toBe('My Page.md');
    expect(filenameToTitle('My Page.md')).toBe('My Page');
  });
});

describe('filePathToUrlPath', () => {
  it('strips .md and scrubs', () => {
    expect(filePathToUrlPath('My Cool Page.md')).toBe('My_Cool_Page');
  });

  it('handles folders', () => {
    expect(filePathToUrlPath('Projects/Design Doc.md')).toBe('Projects/Design_Doc');
  });
});

describe('resolveWikilink', () => {
  const pages = [
    'README.md',
    'Projects/Alpha.md',
    'Projects/Beta.md',
    'Archive/Alpha.md',
    'Meeting Notes.md',
  ];

  it('resolves a simple wikilink by stem', () => {
    expect(resolveWikilink('Meeting Notes', pages)).toBe('Meeting Notes.md');
  });

  it('resolves case-insensitively', () => {
    expect(resolveWikilink('meeting notes', pages)).toBe('Meeting Notes.md');
    expect(resolveWikilink('readme', pages)).toBe('README.md');
  });

  it('resolves a folder-qualified link', () => {
    expect(resolveWikilink('Projects/Alpha', pages)).toBe('Projects/Alpha.md');
    expect(resolveWikilink('Archive/Alpha', pages)).toBe('Archive/Alpha.md');
  });

  it('prefers closest folder when ambiguous', () => {
    // From within Projects/, prefer Projects/Alpha over Archive/Alpha
    expect(resolveWikilink('Alpha', pages, 'Projects')).toBe('Projects/Alpha.md');
  });

  it('returns null for non-existent pages', () => {
    expect(resolveWikilink('Does Not Exist', pages)).toBeNull();
  });
});
