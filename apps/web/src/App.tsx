import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { HomePage } from './pages/HomePage'

// As demais páginas carregam sob demanda para o primeiro acesso (muitas vezes no celular) ser leve.
const NewsListPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.NewsListPage })))
const NewsDetailPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.NewsDetailPage })))
const ProjectsListPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.ProjectsListPage })))
const ProjectDetailPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.ProjectDetailPage })))
const PartnersListPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.PartnersListPage })))
const PartnerDetailPage = lazy(() => import('./pages/ContentPages').then((m) => ({ default: m.PartnerDetailPage })))
const ProductsPage = lazy(() => import('./pages/ProductsPage').then((m) => ({ default: m.ProductsPage })))
const ProductDetailPage = lazy(() => import('./pages/ProductsPage').then((m) => ({ default: m.ProductDetailPage })))
const ServicesPage = lazy(() => import('./pages/ServicesPage').then((m) => ({ default: m.ServicesPage })))
const DonationsPage = lazy(() => import('./pages/DonationsPage').then((m) => ({ default: m.DonationsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="noticias" element={<NewsListPage />} />
        <Route path="noticias/:id" element={<NewsDetailPage />} />
        <Route path="projetos" element={<ProjectsListPage />} />
        <Route path="projetos/:id" element={<ProjectDetailPage />} />
        <Route path="parceiros" element={<PartnersListPage />} />
        <Route path="parceiros/:id" element={<PartnerDetailPage />} />
        <Route path="produtos" element={<ProductsPage />} />
        <Route path="produtos/:id" element={<ProductDetailPage />} />
        <Route path="servicos" element={<ServicesPage />} />
        <Route path="doacoes" element={<DonationsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
