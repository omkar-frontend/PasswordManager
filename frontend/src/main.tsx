import { createRoot } from 'react-dom/client'
import './index.css'
import { Navigate, Route, RouterProvider, createBrowserRouter, createRoutesFromElements, useParams } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
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
    <>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/app" element={<Layout />}>
        <Route index element={<Categories />} />
        <Route path="category/:id" element={<CategoryItems />} />
      </Route>
      <Route path="/category/:id" element={<LegacyCategoryRedirect />} />
    </>
))

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <RouterProvider router={router} />
    <Toaster position="top-center" />
  </AuthProvider>
)
