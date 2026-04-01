import { useEffect, useRef, useState, useCallback } from 'react';
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
  onSave?: () => void;
  onCancel?: () => void;
  onUpload?: (file: File) => Promise<string | null>;
}

export function Editor({ value, onChange, placeholder, pages, onSave, onCancel, onUpload }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const autocompleteCompartment = useRef(new Compartment());
  const onSaveRef = useRef(onSave);
  const onCancelRef = useRef(onCancel);
  const onUploadRef = useRef(onUpload);
  onSaveRef.current = onSave;
  onCancelRef.current = onCancel;
  onUploadRef.current = onUpload;
  const [dragging, setDragging] = useState(false);

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
        keymap.of([
          { key: 'Mod-s', run: () => { onSaveRef.current?.(); return true; } },
          { key: 'Escape', run: () => { onCancelRef.current?.(); return true; } },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
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

  const insertTextAtCursor = useCallback((text: string) => {
    const view = viewRef.current;
    if (!view) return;
    const pos = view.state.selection.main.head;
    view.dispatch({
      changes: { from: pos, insert: text },
      selection: { anchor: pos + text.length },
    });
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!onUploadRef.current) return;

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      insertTextAtCursor(`![Uploading ${file.name}...]()\n`);
      const url = await onUploadRef.current(file);
      if (url) {
        // Replace the placeholder with the actual embed
        const view = viewRef.current;
        if (!view) continue;
        const doc = view.state.doc.toString();
        const placeholder = `![Uploading ${file.name}...]()`;
        const idx = doc.indexOf(placeholder);
        if (idx !== -1) {
          const isImage = /\.(png|jpe?g|gif|svg|webp)$/i.test(file.name);
          const markup = isImage ? `![[${file.name}]]` : `[${file.name}](${url})`;
          view.dispatch({
            changes: { from: idx, to: idx + placeholder.length, insert: markup },
          });
        }
      }
    }
  }, [insertTextAtCursor]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    if (!onUploadRef.current) return;
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) return;

    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;

    const name = `paste-${Date.now()}.png`;
    const renamedFile = new File([file], name, { type: file.type });
    insertTextAtCursor(`![Uploading ${name}...]()\n`);
    const url = await onUploadRef.current(renamedFile);
    if (url) {
      const view = viewRef.current;
      if (!view) return;
      const doc = view.state.doc.toString();
      const placeholder = `![Uploading ${name}...]()`;
      const idx = doc.indexOf(placeholder);
      if (idx !== -1) {
        view.dispatch({
          changes: { from: idx, to: idx + placeholder.length, insert: `![[${name}]]` },
        });
      }
    }
  }, [insertTextAtCursor]);

  return (
    <div
      ref={containerRef}
      className={`border rounded-lg overflow-hidden bg-white min-h-[400px] relative ${
        dragging ? 'ring-2 ring-blue-400 ring-inset' : ''
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      {dragging && (
        <div className="absolute inset-0 bg-blue-50/80 z-10 flex items-center justify-center pointer-events-none">
          <span className="text-blue-600 font-medium">Drop file to upload</span>
        </div>
      )}
    </div>
  );
}
