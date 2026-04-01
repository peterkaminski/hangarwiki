import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pages as pagesApi, type HistoryEntry } from '../lib/api';

export function PageHistory() {
  const { wiki, '*': urlPath } = useParams<{ wiki: string; '*': string }>();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [diff, setDiff] = useState('');
  const [diffLoading, setDiffLoading] = useState(false);

  useEffect(() => {
    if (!wiki || !urlPath) return;

    const cleanPath = urlPath.replace(/\/history$/, '');
    pagesApi.history(wiki, cleanPath).then(({ history }) => {
      setHistory(history);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [wiki, urlPath]);

  async function toggleDiff(hash: string) {
    if (expandedHash === hash) {
      setExpandedHash(null);
      setDiff('');
      return;
    }

    if (!wiki || !urlPath) return;
    setExpandedHash(hash);
    setDiffLoading(true);
    setDiff('');

    const cleanPath = urlPath.replace(/\/history$/, '');
    try {
      const { diff: d } = await pagesApi.diff(wiki, hash, cleanPath);
      setDiff(d);
    } catch {
      setDiff('Could not load diff.');
    } finally {
      setDiffLoading(false);
    }
  }

  if (loading && history.length === 0) return <div className="p-8 text-gray-500">Loading...</div>;

  const cleanPath = urlPath?.replace(/\/history$/, '') ?? '';

  return (
    <div className="max-w-3xl mx-auto p-8">
      <Link to={`/${wiki}/${cleanPath}`} className="text-sm text-gray-500 hover:text-gray-700">
        &larr; Back to page
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-6">Page History</h1>

      <div className="space-y-2">
        {history.map((entry) => (
          <div key={entry.hash}>
            <button
              onClick={() => toggleDiff(entry.hash)}
              className="w-full text-left p-3 bg-white border rounded-lg hover:bg-gray-50"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-medium text-gray-900">{entry.message}</span>
                  <div className="text-sm text-gray-500 mt-1">
                    {entry.authorName} &middot; {new Date(entry.date).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-gray-400 font-mono">{entry.hash.slice(0, 7)}</code>
                  <span className="text-xs text-gray-400">
                    {expandedHash === entry.hash ? '▲' : '▼'}
                  </span>
                </div>
              </div>
            </button>
            {expandedHash === entry.hash && (
              <div className="mt-1 border rounded-lg overflow-hidden">
                {diffLoading ? (
                  <div className="p-3 text-sm text-gray-500">Loading diff...</div>
                ) : (
                  <pre className="p-3 text-xs font-mono overflow-x-auto bg-gray-50 max-h-96 overflow-y-auto">
                    {diff.split('\n').map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.startsWith('+') && !line.startsWith('+++')
                            ? 'bg-green-50 text-green-800'
                            : line.startsWith('-') && !line.startsWith('---')
                              ? 'bg-red-50 text-red-800'
                              : line.startsWith('@@')
                                ? 'text-blue-600'
                                : 'text-gray-700'
                        }
                      >
                        {line}
                      </div>
                    ))}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {history.length === 0 && (
        <p className="text-gray-500">No history available.</p>
      )}
    </div>
  );
}
