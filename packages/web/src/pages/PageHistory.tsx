import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pages as pagesApi, type HistoryEntry } from '../lib/api';

export function PageHistory() {
  const { wiki, '*': urlPath } = useParams<{ wiki: string; '*': string }>();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wiki || !urlPath) return;

    const cleanPath = urlPath.replace(/\/history$/, '');
    pagesApi.history(wiki, cleanPath).then(({ history }) => {
      setHistory(history);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [wiki, urlPath]);

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
          <div key={entry.hash} className="p-3 bg-white border rounded-lg">
            <div className="flex justify-between items-start">
              <div>
                <span className="font-medium text-gray-900">{entry.message}</span>
                <div className="text-sm text-gray-500 mt-1">
                  {entry.authorName} &middot; {new Date(entry.date).toLocaleString()}
                </div>
              </div>
              <code className="text-xs text-gray-400 font-mono">{entry.hash.slice(0, 7)}</code>
            </div>
          </div>
        ))}
      </div>

      {history.length === 0 && (
        <p className="text-gray-500">No history available.</p>
      )}
    </div>
  );
}
