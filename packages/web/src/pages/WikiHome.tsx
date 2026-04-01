import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pages as pagesApi, wikis as wikisApi, type PageInfo, type SearchResult, type RecentChange, type Wiki } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

export function WikiHome() {
  const { wiki: wikiSlug } = useParams<{ wiki: string }>();
  const { user } = useAuth();
  const [wiki, setWiki] = useState<Wiki | null>(null);
  const [pageList, setPageList] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [recentChanges, setRecentChanges] = useState<RecentChange[]>([]);
  const [activeTab, setActiveTab] = useState<'pages' | 'recent'>('pages');

  useEffect(() => {
    if (!wikiSlug) return;

    Promise.all([
      wikisApi.get(wikiSlug),
      pagesApi.list(wikiSlug),
      pagesApi.recent(wikiSlug),
    ]).then(([{ wiki }, { pages }, { changes }]) => {
      setWiki(wiki);
      setPageList(pages);
      setRecentChanges(changes);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [wikiSlug]);

  const doSearch = useCallback(async (q: string) => {
    if (!wikiSlug || !q.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const { results } = await pagesApi.search(wikiSlug, q.trim());
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [wikiSlug]);

  // Debounce search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => doSearch(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery, doSearch]);

  if (loading && !wiki) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!wiki) return <div className="p-8 text-red-600">Wiki not found</div>;

  // Separate special pages from regular pages
  const specialPages = pageList.filter((p) => p.path.startsWith('_'));
  const regularPages = pageList.filter((p) => !p.path.startsWith('_') && !p.path.startsWith('.'));

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{wiki.title}</h1>
        <div className="flex gap-2">
          {user && (
            <Link
              to={`/${wikiSlug}/_settings`}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
            >
              Settings
            </Link>
          )}
          <Link
            to={`/${wikiSlug}/_new`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            New Page
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search pages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
      </div>

      {searchResults !== null ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">
              {searching ? 'Searching...' : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
            </span>
            <button
              onClick={() => { setSearchQuery(''); setSearchResults(null); }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
          <div className="space-y-2">
            {searchResults.map((result) => (
              <Link
                key={result.path}
                to={`/${wikiSlug}/${result.urlPath}`}
                className="block p-3 bg-white border rounded-lg hover:border-blue-300"
              >
                <div className="font-medium text-blue-600">{result.title}</div>
                <div
                  className="text-sm text-gray-600 mt-1"
                  dangerouslySetInnerHTML={{ __html: result.snippet }}
                />
              </Link>
            ))}
          </div>
          {searchResults.length === 0 && !searching && (
            <p className="text-gray-500 text-sm mt-2">No pages match your search.</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-4 border-b mb-4">
            <button
              onClick={() => setActiveTab('pages')}
              className={`pb-2 text-sm font-medium border-b-2 ${
                activeTab === 'pages'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              All Pages ({regularPages.length})
            </button>
            <button
              onClick={() => setActiveTab('recent')}
              className={`pb-2 text-sm font-medium border-b-2 ${
                activeTab === 'recent'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Recent Changes
            </button>
          </div>

          {activeTab === 'pages' ? (
            <>
              <div className="space-y-1">
                {regularPages.map((page) => (
                  <Link
                    key={page.path}
                    to={`/${wikiSlug}/${page.urlPath}`}
                    className="block px-3 py-2 rounded hover:bg-gray-50 text-blue-600 hover:text-blue-800"
                  >
                    {page.title}
                    {page.path.includes('/') && (
                      <span className="ml-2 text-xs text-gray-400">
                        {page.path.split('/').slice(0, -1).join('/')}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
              {regularPages.length === 0 && (
                <p className="text-gray-500 mt-4">No pages yet. Create one to get started.</p>
              )}
            </>
          ) : (
            <div className="space-y-1">
              {recentChanges.map((change, i) => (
                <Link
                  key={`${change.path}-${i}`}
                  to={`/${wikiSlug}/${change.urlPath}`}
                  className="block px-3 py-2 rounded hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-blue-600 hover:text-blue-800">{change.title}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(change.date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {change.authorName} &middot; {change.message}
                  </div>
                </Link>
              ))}
              {recentChanges.length === 0 && (
                <p className="text-gray-500 mt-4">No recent changes.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
