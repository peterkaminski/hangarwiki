import { Routes, Route, Link, Navigate, useParams } from 'react-router-dom';
import { AuthContext, useAuth, useAuthProvider } from './hooks/useAuth';
import { Login } from './pages/Login';
import { WikiList } from './pages/WikiList';
import { WikiHome } from './pages/WikiHome';
import { PageView } from './pages/PageView';
import { PageEdit } from './pages/PageEdit';
import { PageHistory } from './pages/PageHistory';

function NavBar() {
  const { user, logout } = useAuth();

  return (
    <nav className="bg-white border-b px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <Link to="/" className="font-bold text-gray-900 hover:text-blue-600">
          HangarWiki
        </Link>
        {user && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500">{user.displayName ?? user.email}</span>
            <button onClick={logout} className="text-gray-500 hover:text-gray-700">
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

/** Dispatch /:wiki/* based on URL suffix: /edit, /history, or plain view. */
function WikiPageRouter() {
  const { '*': splat } = useParams();
  const { user, loading } = useAuth();

  if (splat?.endsWith('/edit')) {
    if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
    if (!user) return <Navigate to="/login" />;
    return <PageEdit />;
  }
  if (splat?.endsWith('/history')) {
    return <PageHistory />;
  }
  return <PageView />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

export function App() {
  const authValue = useAuthProvider();

  return (
    <AuthContext.Provider value={authValue}>
      <div className="min-h-screen bg-gray-50">
        <NavBar />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <WikiList />
              </ProtectedRoute>
            }
          />
          <Route path="/:wiki" element={<WikiHome />} />
          <Route path="/:wiki/_new" element={
            <ProtectedRoute><PageEdit /></ProtectedRoute>
          } />
          <Route path="/:wiki/*" element={<WikiPageRouter />} />
        </Routes>
      </div>
    </AuthContext.Provider>
  );
}
