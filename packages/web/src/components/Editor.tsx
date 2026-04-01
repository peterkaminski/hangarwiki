import { useEffect, useRef } from 'react';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { wikilinkAutocomplete } from './wikilinkComplete';
import { wikilinkHighlight } from './wikilinkHighlight';
import type { PageInfo } from '../lib/api';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  pages?: PageInfo[];
}

export function Editor({ value, onChange, placeholder, pages }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const autocompleteCompartment = useRef(new Compartment());

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        markdown(),
        history(),
        bracketMatching(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        updateListener,
        EditorView.lineWrapping,
        placeholder ? cmPlaceholder(placeholder) : [],
        wikilinkHighlight(),
        autocompleteCompartment.current.of(
          pages?.length ? wikilinkAutocomplete(pages) : [],
        ),
        // Basic styling
        EditorView.theme({
          '&': {
            fontSize: '14px',
            minHeight: '400px',
          },
          '.cm-content': {
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            padding: '12px',
          },
          '.cm-gutters': {
            display: 'none',
          },
          '&.cm-focused': {
            outline: 'none',
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Only create once

  // Update content when value changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  // Update autocomplete when page list changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: autocompleteCompartment.current.reconfigure(
        pages?.length ? wikilinkAutocomplete(pages) : [],
      ),
    });
  }, [pages]);

  return (
    <div
      ref={containerRef}
      className="border rounded-lg overflow-hidden bg-white min-h-[400px]"
    />
  );
}
