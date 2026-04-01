import { Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { type Extension } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

/** Decorations for wikilink brackets and content. */
const wikilinkBracket = Decoration.mark({ class: 'cm-wikilink-bracket' });
const wikilinkContent = Decoration.mark({ class: 'cm-wikilink-content' });
const embedMarker = Decoration.mark({ class: 'cm-wikilink-embed' });

/** Regex to find wikilinks: [[target]], [[target|display]], ![[embed]] */
const WIKILINK_RE = /(!?\[\[)([^\]\n]+?)(\]\])/g;

function buildDecorations(view: import('@codemirror/view').EditorView): DecorationSet {
  const decorations: { from: number; to: number; deco: Decoration }[] = [];

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    let match: RegExpExecArray | null;
    WIKILINK_RE.lastIndex = 0;

    while ((match = WIKILINK_RE.exec(text)) !== null) {
      const start = from + match.index;
      const openBracket = match[1]; // `[[` or `![[`
      const content = match[2];
      const closeBracket = match[3]; // `]]`

      // Opening brackets
      if (openBracket.startsWith('!')) {
        decorations.push({ from: start, to: start + 1, deco: embedMarker });
        decorations.push({ from: start + 1, to: start + openBracket.length, deco: wikilinkBracket });
      } else {
        decorations.push({ from: start, to: start + openBracket.length, deco: wikilinkBracket });
      }

      // Content
      const contentStart = start + openBracket.length;
      decorations.push({ from: contentStart, to: contentStart + content.length, deco: wikilinkContent });

      // Closing brackets
      const closeStart = contentStart + content.length;
      decorations.push({ from: closeStart, to: closeStart + closeBracket.length, deco: wikilinkBracket });
    }
  }

  // Decorations must be sorted by position
  decorations.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(decorations.map((d) => d.deco.range(d.from, d.to)));
}

const wikilinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: import('@codemirror/view').EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Theme for wikilink highlighting in the editor. */
import { EditorView } from '@codemirror/view';

const wikilinkTheme = EditorView.baseTheme({
  '.cm-wikilink-bracket': {
    color: '#9333ea',
    opacity: '0.5',
  },
  '.cm-wikilink-content': {
    color: '#7c3aed',
    textDecoration: 'underline',
    textDecorationColor: '#c4b5fd',
  },
  '.cm-wikilink-embed': {
    color: '#9333ea',
    fontWeight: 'bold',
  },
});

/** CodeMirror extension for wikilink syntax highlighting. */
export function wikilinkHighlight(): Extension {
  return [wikilinkPlugin, wikilinkTheme];
}
