import { createRoot } from 'react-dom/client'
import './index.css'
import { Navigate, Outlet, Route, RouterProvider, createBrowserRouter, createRoutesFromElements, useParams } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import RootErrorBoundary from './components/RootErrorBoundary.tsx'
import RouteErrorFallback from './components/RouteErrorFallback.tsx'
import RootRedirect from './components/RootRedirect.tsx'
import Layout from './layout/Layout.tsx'
import Login from './pages/Login.tsx'
import Signup from './pages/Signup.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import Categories from './pages/Categories.tsx'
import './lib/axiosAuth'
import CategoryItems from './pages/CategoryItems.tsx'

function LegacyCategoryRedirect() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/app" replace />
  return <Navigate to={`/app/category/${id}`} replace />
}

const router = createBrowserRouter(
  createRoutesFromElements(
  <Route element={<Outlet />} errorElement={<RouteErrorFallback />}>
    <Route path="/" element={<RootRedirect />} />
    <Route path="/login" element={<Login />} />
    <Route path="/signup" element={<Signup />} />
    <Route path="/app" element={<Layout />}>
      <Route index element={<Categories />} />
      <Route path="category/:id" element={<CategoryItems />} />
    </Route>
    <Route path="/category/:id" element={<LegacyCategoryRedirect />} />
  </Route>,
  ),
)

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </AuthProvider>
  </RootErrorBoundary>,
)
