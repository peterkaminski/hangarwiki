import {
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  EditorView,
} from '@codemirror/view';
import { type Extension } from '@codemirror/state';

const IMAGE_RE = /!\[\[([^\]\n]+?\.(png|jpe?g|gif|svg|webp))(?:\|[^\]\n]*)?\]\]/gi;

/** Widget that renders an inline image thumbnail below the embed syntax. */
class ImageWidget extends WidgetType {
  constructor(
    private src: string,
    private alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return this.src === other.src;
  }

  toDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-image-preview';

    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.alt;
    img.loading = 'lazy';
    img.style.maxWidth = '300px';
    img.style.maxHeight = '200px';
    img.style.borderRadius = '4px';
    img.style.marginTop = '4px';
    img.style.marginBottom = '4px';
    img.style.display = 'block';
    img.onerror = () => { wrapper.style.display = 'none'; };

    wrapper.appendChild(img);
    return wrapper;
  }

  ignoreEvent() {
    return true;
  }
}

function buildImageDecorations(
  view: EditorView,
  wikiSlug: string,
): DecorationSet {
  const widgets: { pos: number; widget: WidgetType }[] = [];

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    IMAGE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = IMAGE_RE.exec(text)) !== null) {
      const filename = match[1];
      const lineEnd = text.indexOf('\n', match.index);
      const pos = from + (lineEnd === -1 ? text.length : lineEnd);

      const src = `/api/wikis/${wikiSlug}/attachments/${filename}`;
      widgets.push({
        pos,
        widget: new ImageWidget(src, filename),
      });
    }
  }

  widgets.sort((a, b) => a.pos - b.pos);
  return Decoration.set(
    widgets.map((w) =>
      Decoration.widget({ widget: w.widget, side: 1, block: true }).range(w.pos),
    ),
  );
}

/** CodeMirror extension that shows inline image previews for ![[image.ext]] embeds. */
export function imagePreview(wikiSlug: string): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildImageDecorations(view, wikiSlug);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildImageDecorations(update.view, wikiSlug);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
