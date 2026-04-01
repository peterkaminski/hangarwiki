import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { pages as pagesApi, attachments as attachmentsApi, type PageInfo } from '../lib/api';
import { Editor } from '../components/Editor';
import { renderMarkdown } from '../lib/markdown';

export function PageEdit() {
  const { wiki, '*': urlPath } = useParams<{ wiki: string; '*': string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [pagePath, setPagePath] = useState('');
  const [preview, setPreview] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pageList, setPageList] = useState<PageInfo[]>([]);
  const isNew = !urlPath;

  // For new pages — pre-fill title from ?title= query param (incipient link click)
  const [newTitle, setNewTitle] = useState(searchParams.get('title') ?? '');

  useEffect(() => {
    if (!wiki) return;
    pagesApi.list(wiki).then(({ pages }) => setPageList(pages)).catch(() => {});
  }, [wiki]);

  useEffect(() => {
    if (!wiki || !urlPath || isNew) return;

    // Strip /edit suffix if present in urlPath
    const cleanPath = urlPath.replace(/\/edit$/, '');
    pagesApi.get(wiki, cleanPath).then(({ page }) => {
      setContent(page.content);
      setPagePath(page.path);
    }).catch((err) => setError(err.message));
  }, [wiki, urlPath, isNew]);

  const updatePreview = useCallback(async (md: string) => {
    if (showPreview && wiki) {
      const html = await renderMarkdown(md, `/${wiki}`);
      setPreview(html);
    }
  }, [showPreview, wiki]);

  useEffect(() => {
    updatePreview(content);
  }, [content, showPreview, updatePreview]);

  /** Intercept clicks on internal links in the preview pane. */
  const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    if (href.startsWith('/') && !href.startsWith('//')) {
      e.preventDefault();
      navigate(href);
    }
  }, [navigate]);

  async function handleSave() {
    if (!wiki) return;
    setSaving(true);
    setError('');

    try {
      if (isNew) {
        if (!newTitle.trim()) {
          setError('Title is required');
          setSaving(false);
          return;
        }
        const { page } = await pagesApi.create(wiki, newTitle.trim(), content);
        navigate(`/${wiki}/${page.urlPath}`);
      } else {
        await pagesApi.save(wiki, pagePath, content);
        const cleanPath = urlPath!.replace(/\/edit$/, '');
        navigate(`/${wiki}/${cleanPath}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-4">
        <Link to={`/${wiki}`} className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Back to wiki
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
          >
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
          <button
            onClick={() => {
              const cleanPath = urlPath?.replace(/\/edit$/, '');
              navigate(isNew ? `/${wiki}` : `/${wiki}/${cleanPath}`);
            }}
            className="px-4 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {isNew && (
        <input
          type="text"
          placeholder="Page title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg mb-4 text-lg"
          autoFocus
        />
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
          {error}
        </div>
      )}

      <div className={`${showPreview ? 'grid grid-cols-2 gap-4' : ''}`}>
        <div className={showPreview ? 'border rounded-lg overflow-hidden' : ''}>
          <Editor
            value={content}
            onChange={setContent}
            pages={pageList}
            onSave={handleSave}
            onCancel={() => {
              const cleanPath = urlPath?.replace(/\/edit$/, '');
              navigate(isNew ? `/${wiki}` : `/${wiki}/${cleanPath}`);
            }}
            onUpload={async (file) => {
              if (!wiki) return null;
              try {
                const { attachment } = await attachmentsApi.upload(wiki, file);
                return attachment.url;
              } catch {
                return null;
              }
            }}
          />
        </div>
        {showPreview && (
          <div
            className="border rounded-lg p-4 overflow-auto prose prose-blue max-w-none"
            onClick={handlePreviewClick}
          >
            <div dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
        )}
      </div>
    </div>
  );
}
