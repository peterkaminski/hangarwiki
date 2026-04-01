import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { wikis as wikisApi, type Wiki } from '../lib/api';

export function WikiList() {
  const [wikiList, setWikiList] = useState<Wiki[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importSlug, setImportSlug] = useState('');
  const [importTitle, setImportTitle] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    wikisApi.list().then(({ wikis }) => {
      setWikiList(wikis);
      setLoading(false);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load wikis');
      setLoading(false);
    });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { wiki } = await wikisApi.create(slug, title);
      navigate(`/${wiki.slug}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create wiki');
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setImporting(true);
    try {
      const { wiki } = await wikisApi.import(importUrl, importSlug, importTitle);
      navigate(`/${wiki.slug}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setImporting(false);
    }
  }

  /** Derive a slug from a git URL (e.g., https://github.com/user/repo.git -> repo). */
  function slugFromUrl(url: string): string {
    const name = url.split('/').pop()?.replace(/\.git$/, '') ?? '';
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Your Wikis</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowImport(!showImport); setShowCreate(false); }}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            Import
          </button>
          <button
            onClick={() => { setShowCreate(!showCreate); setShowImport(false); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            New Wiki
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-8 p-4 bg-gray-50 rounded-lg space-y-3">
          <input
            type="text"
            placeholder="Wiki title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
            }}
            className="w-full px-3 py-2 border rounded-lg"
          />
          <div className="flex gap-2 items-center">
            <span className="text-gray-500 text-sm">Slug:</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
            Create
          </button>
        </form>
      )}

      {showImport && (
        <form onSubmit={handleImport} className="mb-8 p-4 bg-gray-50 rounded-lg space-y-3">
          <input
            type="text"
            placeholder="Git repository URL (https://...)"
            value={importUrl}
            onChange={(e) => {
              setImportUrl(e.target.value);
              const derived = slugFromUrl(e.target.value);
              setImportSlug(derived);
              if (!importTitle) setImportTitle(derived.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
            }}
            className="w-full px-3 py-2 border rounded-lg"
            autoFocus
          />
          <input
            type="text"
            placeholder="Wiki title"
            value={importTitle}
            onChange={(e) => setImportTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          />
          <div className="flex gap-2 items-center">
            <span className="text-gray-500 text-sm">Slug:</span>
            <input
              type="text"
              value={importSlug}
              onChange={(e) => setImportSlug(e.target.value)}
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={importing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
          >
            {importing ? 'Importing...' : 'Import'}
          </button>
          <p className="text-xs text-gray-500">
            Clones the repository and indexes all Markdown pages. Public repos only (no auth yet).
          </p>
        </form>
      )}

      {wikiList.length === 0 ? (
        <p className="text-gray-500">No wikis yet. Create one or import from a git repo.</p>
      ) : (
        <div className="space-y-2">
          {wikiList.map((wiki) => (
            <Link
              key={wiki.id}
              to={`/${wiki.slug}`}
              className="block p-4 bg-white rounded-lg border hover:border-blue-300 transition-colors"
            >
              <div className="font-medium text-gray-900">{wiki.title}</div>
              <div className="text-sm text-gray-500">/{wiki.slug}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
