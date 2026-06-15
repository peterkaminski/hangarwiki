import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { pages as pagesApi, wikis as wikisApi, type PageContent, type PageInfo, type Wiki } from '../lib/api';
import { renderMarkdown, resolveTransclusions } from '../lib/markdown';
import { useAuth } from '../hooks/useAuth';

// Module-level cache so remounted components show content instantly
const pageCache = new Map<string, { page: PageContent; html: string }>();
const sidebarCache = new Map<string, string | null>();

export function PageView() {
  const { wiki: wikiSlug, '*': urlPath } = useParams<{ wiki: string; '*': string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const cacheKey = `${wikiSlug}/${urlPath}`;
  const cached = pageCache.get(cacheKey);
  const [page, setPage] = useState<PageContent | null>(cached?.page ?? null);
  const [html, setHtml] = useState(cached?.html ?? '');
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState('');
  const [backlinks, setBacklinks] = useState<PageInfo[]>([]);
  const [sidebarHtml, setSidebarHtml] = useState<string | null>(sidebarCache.get(wikiSlug ?? '') ?? null);

  /** Intercept clicks on internal links so they use client-side navigation. */
  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    // Only intercept same-origin, non-external links
    if (href.startsWith('/') && !href.startsWith('//')) {
      e.preventDefault();
      navigate(href);
    }
  }, [navigate]);

  useEffect(() => {
    if (!wikiSlug || !urlPath) return;

    setError('');
    // If we have cached content for a different page, show loading
    const key = `${wikiSlug}/${urlPath}`;
    const hit = pageCache.get(key);
    if (hit) {
      setPage(hit.page);
      setHtml(hit.html);
      setLoading(false);
    } else if (!loading) {
      // Navigated to uncached page — don't flash, keep showing old content
    }

    Promise.all([
      pagesApi.get(wikiSlug, urlPath).catch(() => null),
      pagesApi.list(wikiSlug),
      wikisApi.get(wikiSlug),
      pagesApi.backlinks(wikiSlug, urlPath).catch(() => ({ backlinks: [] as PageInfo[] })),
      // Fetch sidebar (may not exist — that's fine)
      pagesApi.get(wikiSlug, '_sidebar').catch(() => null),
    ]).then(async ([pageResult, { pages: allPages }, { wiki }, { backlinks: bl }, sidebarResult]) => {
      // Missing page: follow the wiki's incipientLinkStyle setting for authenticated users.
      // Logged-out readers stay on "Page not found" rather than getting bounced through /login.
      if (!pageResult) {
        if ((wiki.incipientLinkStyle ?? 'create') === 'create' && user) {
          const derivedTitle = urlPath.replace(/_/g, ' ');
          navigate(`/${wikiSlug}/_new?title=${encodeURIComponent(derivedTitle)}`, { replace: true });
          return;
        }
        setPage(null);
        setLoading(false);
        return;
      }

      const newPage = pageResult.page;
      let rendered = await renderMarkdown(
        newPage.content,
        `/${wikiSlug}`,
        allPages,
      );
      rendered = await resolveTransclusions(rendered, wikiSlug, allPages);
      const finalHtml = applyIncipientLinkStyle(rendered, wiki, wikiSlug);
      pageCache.set(key, { page: newPage, html: finalHtml });
      setPage(newPage);
      setHtml(finalHtml);
      setBacklinks(bl);

      // Render sidebar if it exists
      if (sidebarResult && 'page' in sidebarResult) {
        const sidebarRendered = await renderMarkdown(
          sidebarResult.page.content,
          `/${wikiSlug}`,
          allPages,
        );
        sidebarCache.set(wikiSlug, sidebarRendered);
        setSidebarHtml(sidebarRendered);
      } else {
        sidebarCache.set(wikiSlug, null);
        setSidebarHtml(null);
      }

      setLoading(false);
    }).catch((err) => {
      setError(err.message);
      setPage(null);
      setLoading(false);
    });
  }, [wikiSlug, urlPath, user, navigate]);

  if (loading && !page) return <div className="p-8 text-gray-500">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!page) return <div className="p-8 text-red-600">Page not found</div>;

  const mainContent = (
    <div className={sidebarHtml ? 'flex-1 min-w-0' : 'max-w-3xl mx-auto w-full'}>
      <div className="flex flex-col min-[440px]:flex-row min-[440px]:items-center min-[440px]:justify-between gap-3 mb-6">
        <div className="min-w-0 flex-1">
          <Link to={`/${wikiSlug}`} className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Back to wiki
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1 break-words">{page.title}</h1>
        </div>
        <div className="flex gap-2 shrink-0">
          {user && (
            <Link
              to={`/${wikiSlug}/${urlPath}/edit`}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Edit
            </Link>
          )}
          <Link
            to={`/${wikiSlug}/${urlPath}/history`}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            History
          </Link>
        </div>
      </div>

      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="prose prose-blue max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleContentClick}
      />

      {backlinks.length > 0 && (
        <div className="mt-8 pt-6 border-t">
          <h2 className="text-sm font-medium text-gray-500 mb-2">
            Pages that link here
          </h2>
          <div className="flex flex-wrap gap-2">
            {backlinks.map((bl) => (
              <Link
                key={bl.path}
                to={`/${wikiSlug}/${bl.urlPath}`}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                {bl.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (sidebarHtml) {
    return (
      <div className="max-w-5xl mx-auto p-4 sm:p-8 flex flex-col sm:flex-row gap-4 sm:gap-8">
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <aside
          className="w-full sm:w-56 sm:flex-shrink-0 prose prose-sm prose-blue max-w-none"
          dangerouslySetInnerHTML={{ __html: sidebarHtml }}
          onClick={handleContentClick}
        />
        {mainContent}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8">
      {mainContent}
    </div>
  );
}

/**
 * Post-process rendered HTML to apply incipient link styling based on wiki setting.
 * Uses DOM parsing to avoid fragile regex matching on attribute order.
 */
function applyIncipientLinkStyle(html: string, wiki: Wiki, wikiSlug: string): string {
  const style = wiki.incipientLinkStyle ?? 'create';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const incipientLinks = doc.querySelectorAll('a.wikilink-new');

  for (const link of incipientLinks) {
    if (style === 'create') {
      const text = link.textContent ?? '';
      link.setAttribute('href', `/${wikiSlug}/_new?title=${encodeURIComponent(text)}`);
    } else {
      link.setAttribute('data-incipient', 'true');
    }
  }

  return doc.body.innerHTML;
}
