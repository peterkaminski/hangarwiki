import { useState } from 'react';
import { auth } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

export function UserSettings() {
  const { user, refresh } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [keyError, setKeyError] = useState('');
  const [keyLoading, setKeyLoading] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await auth.updateProfile({ displayName: displayName.trim() || null as unknown as string });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleExportKey() {
    setKeyLoading(true);
    setKeyError('');
    try {
      const { privateKey: key } = await auth.exportKey();
      setPrivateKey(key);
    } catch (err: unknown) {
      setKeyError(err instanceof Error ? err.message : 'Key export failed');
    } finally {
      setKeyLoading(false);
    }
  }

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Account Settings</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="text"
            value={user.email}
            disabled
            className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500"
          />
        </div>

        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
            Display name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={user.email.split('@')[0]}
            className="w-full px-3 py-2 border rounded-lg"
          />
          <p className="text-xs text-gray-500 mt-1">
            Shown in git commit history and the navigation bar.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saved && (
            <span className="text-sm text-green-600">Saved</span>
          )}
        </div>
      </div>

      <div className="mt-10 pt-6 border-t">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">SSH Key</h2>
        <p className="text-sm text-gray-600 mb-4">
          Your Ed25519 keypair is used for git access. Export your private key to use git push/pull with this wiki.
        </p>

        {!privateKey ? (
          <button
            onClick={handleExportKey}
            disabled={keyLoading}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
          >
            {keyLoading ? 'Exporting...' : 'Export Private Key'}
          </button>
        ) : (
          <div>
            <textarea
              readOnly
              value={privateKey}
              rows={8}
              className="w-full px-3 py-2 border rounded-lg font-mono text-xs bg-gray-50"
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
            <p className="text-xs text-gray-500 mt-1">
              Click to select, then copy. Save this to <code>~/.ssh/hangarwiki</code> and set permissions with <code>chmod 600</code>.
            </p>
          </div>
        )}

        {keyError && (
          <p className="text-sm text-red-600 mt-2">{keyError}</p>
        )}

        {user.publicKey && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Public key</label>
            <input
              type="text"
              readOnly
              value={user.publicKey}
              className="w-full px-3 py-2 border rounded-lg font-mono text-xs bg-gray-50 text-gray-500"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
          </div>
        )}
      </div>
    </div>
  );
}
