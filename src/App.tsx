import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { SessionProvider } from './hooks/useSession'
import { Layout } from './components/Layout'
import { Loading, NotFound } from './components/States'

const Home = lazy(() => import('./pages/Home'))
const Create = lazy(() => import('./pages/Create'))
const Game = lazy(() => import('./pages/Game'))
const Admin = lazy(() => import('./pages/Admin'))
const Result = lazy(() => import('./pages/Result'))

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Suspense fallback={<Layout><Loading /></Layout>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<Create />} />
            <Route path="/g/:id" element={<Game />} />
            <Route path="/g/:id/admin" element={<Admin />} />
            <Route path="/g/:id/result" element={<Result />} />
            <Route path="*" element={<Layout><NotFound message="없는 페이지예요." /></Layout>} />
          </Routes>
        </Suspense>
      </SessionProvider>
    </BrowserRouter>
  )
}
