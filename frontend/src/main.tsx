import { createRoot } from 'react-dom/client'
import './index.css'
import { Route, RouterProvider, createBrowserRouter, createRoutesFromElements } from 'react-router-dom'
import Layout from './layout/Layout.tsx'
import Login from './pages/Login.tsx'
import Signup from './pages/Signup.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import Categories from './pages/Categories.tsx'
import './lib/axiosAuth'
import CategoryItems from './pages/CategoryItems.tsx'

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Categories />} />
        <Route path="/category/:id" element={<CategoryItems />} />
      </Route>
    </>
))

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <RouterProvider router={router} />
  </AuthProvider>
)
