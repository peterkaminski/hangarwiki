import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pages as pagesApi, wikis as wikisApi, type PageInfo, type Wiki } from '../lib/api';

export function WikiHome() {
  const { wiki: wikiSlug } = useParams<{ wiki: string }>();
  const [wiki, setWiki] = useState<Wiki | null>(null);
  const [pageList, setPageList] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wikiSlug) return;

    Promise.all([
      wikisApi.get(wikiSlug),
      pagesApi.list(wikiSlug),
    ]).then(([{ wiki }, { pages }]) => {
      setWiki(wiki);
      setPageList(pages);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [wikiSlug]);

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!wiki) return <div className="p-8 text-red-600">Wiki not found</div>;

  // Separate special pages from regular pages
  const specialPages = pageList.filter((p) => p.path.startsWith('_'));
  const regularPages = pageList.filter((p) => !p.path.startsWith('_') && !p.path.startsWith('.'));

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{wiki.title}</h1>
        <Link
          to={`/${wikiSlug}/_new`}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          New Page
        </Link>
      </div>

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
    </div>
  );
}
