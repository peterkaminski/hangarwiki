import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pages as pagesApi, type PageContent } from '../lib/api';
import { renderMarkdown } from '../lib/markdown';

export function PageView() {
  const { wiki, '*': urlPath } = useParams<{ wiki: string; '*': string }>();
  const [page, setPage] = useState<PageContent | null>(null);
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!wiki || !urlPath) return;

    pagesApi.get(wiki, urlPath).then(async ({ page }) => {
      setPage(page);
      const rendered = await renderMarkdown(page.content, `/${wiki}`);
      setHtml(rendered);
      setLoading(false);
    }).catch((err) => {
      setError(err.message);
      setLoading(false);
    });
  }, [wiki, urlPath]);

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!page) return <div className="p-8 text-red-600">Page not found</div>;

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to={`/${wiki}`} className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Back to wiki
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{page.title}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/${wiki}/${urlPath}/edit`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Edit
          </Link>
          <Link
            to={`/${wiki}/${urlPath}/history`}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            History
          </Link>
        </div>
      </div>

      <div
        className="prose prose-blue max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
