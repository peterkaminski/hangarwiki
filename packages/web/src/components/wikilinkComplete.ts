import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { Facet, type Extension } from '@codemirror/state';
import type { PageInfo } from '../lib/api';

/** Facet to provide the current page list to the autocomplete source. */
const pageListFacet = Facet.define<PageInfo[], PageInfo[]>({
  combine: (values) => values.flat(),
});

/** Completion source that triggers after `[[`. */
function wikilinkCompletions(context: CompletionContext): CompletionResult | null {
  // Match `[[` followed by optional partial text (but not if already closed with `]]`)
  const match = context.matchBefore(/\[\[[^\]\n]*/);
  if (!match) return null;

  // Need at least `[[`
  if (match.text.length < 2) return null;

  const query = match.text.slice(2).toLowerCase();

  // If there's a `|` the user is typing display text — don't suggest
  if (query.includes('|')) return null;

  const pages = context.state.facet(pageListFacet);

  const options = pages
    .filter((p) => !p.path.startsWith('_') && !p.path.startsWith('.'))
    .filter((p) => !query || p.title.toLowerCase().includes(query))
    .map((p) => ({
      label: p.title,
      detail: p.path.includes('/') ? p.path.split('/').slice(0, -1).join('/') : undefined,
      apply: `[[${p.title}]]`,
    }));

  return {
    from: match.from,
    options,
    filter: false,
  };
}

/** CodeMirror extension for wikilink autocompletion. */
export function wikilinkAutocomplete(pages: PageInfo[]): Extension {
  return [
    pageListFacet.of(pages),
    autocompletion({
      override: [wikilinkCompletions],
      activateOnTyping: true,
    }),
  ];
}
