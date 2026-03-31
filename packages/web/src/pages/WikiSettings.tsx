import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { wikis as wikisApi, type Wiki } from '../lib/api';

export function WikiSettings() {
  const { wiki: wikiSlug } = useParams<{ wiki: string }>();
  const navigate = useNavigate();
  const [wiki, setWiki] = useState<Wiki | null>(null);
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [incipientLinkStyle, setIncipientLinkStyle] = useState<'create' | 'highlight'>('create');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!wikiSlug) return;
    wikisApi.get(wikiSlug).then(({ wiki }) => {
      setWiki(wiki);
      setTitle(wiki.title);
      setVisibility(wiki.visibility);
      setIncipientLinkStyle(wiki.incipientLinkStyle);
    }).catch((err) => setError(err.message));
  }, [wikiSlug]);

  async function handleSave() {
    if (!wikiSlug) return;
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const { wiki: updated } = await wikisApi.update(wikiSlug, {
        title: title.trim(),
        visibility,
        incipientLinkStyle,
      });
      setWiki(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!wiki && !error) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto p-8">
      <Link to={`/${wikiSlug}`} className="text-sm text-gray-500 hover:text-gray-700">
        &larr; Back to wiki
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-6">Wiki Settings</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label htmlFor="visibility" className="block text-sm font-medium text-gray-700 mb-1">
            Visibility
          </label>
          <select
            id="visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
            className="w-full px-3 py-2 border rounded-lg bg-white"
          >
            <option value="public">Public &mdash; anyone can view, logged-in users can edit</option>
            <option value="private">Private &mdash; only members can view and edit</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            How to display incipient links (links to pages that don't exist yet)
          </label>
          <div className="space-y-2">
            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="incipientLinkStyle"
                value="create"
                checked={incipientLinkStyle === 'create'}
                onChange={() => setIncipientLinkStyle('create')}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium text-gray-900">Create link</div>
                <div className="text-sm text-gray-500">
                  Clicking the link opens the editor to create the page. Link appears with a dashed underline.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="incipientLinkStyle"
                value="highlight"
                checked={incipientLinkStyle === 'highlight'}
                onChange={() => setIncipientLinkStyle('highlight')}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium text-gray-900">Highlight only</div>
                <div className="text-sm text-gray-500">
                  The link text is shown with a yellow highlight but is not clickable. Useful for seeing what's missing without encouraging premature page creation.
                </div>
              </div>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          <button
            onClick={() => navigate(`/${wikiSlug}`)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          {saved && (
            <span className="text-sm text-green-600">Settings saved</span>
          )}
        </div>
      </div>

      <div className="mt-8 pt-6 border-t">
        <div className="text-sm text-gray-500">
          <strong>Slug:</strong> {wiki?.slug} (cannot be changed)
        </div>
      </div>
    </div>
  );
}
