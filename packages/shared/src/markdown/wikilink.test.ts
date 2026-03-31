import { describe, it, expect } from 'vitest';
import { extractWikilinks, extractLinkTargets, extractEmbedTargets, isImageEmbed } from './wikilink.js';

describe('extractWikilinks', () => {
  it('extracts simple wikilinks', () => {
    const tokens = extractWikilinks('See [[My Page]] for details.');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].target).toBe('My Page');
    expect(tokens[0].display).toBe('My Page');
    expect(tokens[0].isEmbed).toBe(false);
  });

  it('extracts wikilinks with display text', () => {
    const tokens = extractWikilinks('Check [[My Page|this page]] out.');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].target).toBe('My Page');
    expect(tokens[0].display).toBe('this page');
  });

  it('extracts embed wikilinks', () => {
    const tokens = extractWikilinks('![[embedded page]]');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].target).toBe('embedded page');
    expect(tokens[0].isEmbed).toBe(true);
  });

  it('extracts image embeds', () => {
    const tokens = extractWikilinks('![[photo.png]]');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].target).toBe('photo.png');
    expect(tokens[0].isEmbed).toBe(true);
  });

  it('extracts image embeds with alt text', () => {
    const tokens = extractWikilinks('![[photo.png|My Photo]]');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].target).toBe('photo.png');
    expect(tokens[0].display).toBe('My Photo');
  });

  it('extracts multiple wikilinks', () => {
    const tokens = extractWikilinks('Link to [[Page A]] and [[Page B|B]] and ![[image.jpg]].');
    expect(tokens).toHaveLength(3);
    expect(tokens[0].target).toBe('Page A');
    expect(tokens[1].target).toBe('Page B');
    expect(tokens[2].target).toBe('image.jpg');
  });

  it('handles folder-qualified links', () => {
    const tokens = extractWikilinks('See [[Projects/Alpha]].');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].target).toBe('Projects/Alpha');
  });

  it('returns empty array for no wikilinks', () => {
    expect(extractWikilinks('No links here.')).toHaveLength(0);
  });

  it('trims whitespace in targets and display text', () => {
    const tokens = extractWikilinks('[[ Page Name | display ]]');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].target).toBe('Page Name');
    expect(tokens[0].display).toBe('display');
  });
});

describe('extractLinkTargets', () => {
  it('returns unique non-embed targets', () => {
    const targets = extractLinkTargets('[[A]] and [[B]] and [[A]] and ![[C]]');
    expect(targets).toEqual(['A', 'B']);
  });
});

describe('extractEmbedTargets', () => {
  it('returns unique embed targets', () => {
    const targets = extractEmbedTargets('[[A]] and ![[B]] and ![[C]] and ![[B]]');
    expect(targets).toEqual(['B', 'C']);
  });
});

describe('isImageEmbed', () => {
  it('recognizes image extensions', () => {
    expect(isImageEmbed('photo.png')).toBe(true);
    expect(isImageEmbed('photo.jpg')).toBe(true);
    expect(isImageEmbed('photo.jpeg')).toBe(true);
    expect(isImageEmbed('photo.gif')).toBe(true);
    expect(isImageEmbed('photo.svg')).toBe(true);
    expect(isImageEmbed('photo.webp')).toBe(true);
  });

  it('rejects non-image extensions', () => {
    expect(isImageEmbed('document.pdf')).toBe(false);
    expect(isImageEmbed('page.md')).toBe(false);
    expect(isImageEmbed('My Page')).toBe(false);
  });
});
