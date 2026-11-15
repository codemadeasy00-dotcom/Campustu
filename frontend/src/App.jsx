import { lazy, Suspense } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import ShareQRWidget from './components/ShareQRWidget.jsx'
import { PageLoading } from './components/ui.jsx'

const Home = lazy(() => import('./pages/Home.jsx'))
const AuthPage = lazy(() => import('./pages/AuthPage.jsx'))
const NewListing = lazy(() => import('./pages/NewListing.jsx'))
const ItemPage = lazy(() => import('./pages/ItemPage.jsx'))
const MyListings = lazy(() => import('./pages/MyListings.jsx'))
const Marketplace = lazy(() => import('./pages/Marketplace.jsx'))
const Kits = lazy(() => import('./pages/Kits.jsx'))
const Wishlist = lazy(() => import('./pages/Wishlist.jsx'))
const LostFound = lazy(() => import('./pages/LostFound.jsx'))
const LostFoundNew = lazy(() => import('./pages/LostFoundNew.jsx'))
const ProfileDashboard = lazy(() => import('./pages/ProfileDashboard.jsx'))
const Messages = lazy(() => import('./pages/Messages.jsx'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'))
const SupportPage = lazy(() => import('./pages/SupportPage.jsx'))
const BarterLoops = lazy(() => import('./pages/BarterLoops.jsx'))
const Achievements = lazy(() => import('./pages/Achievements.jsx'))
const NeedBoard = lazy(() => import('./pages/NeedBoard.jsx'))
const CampusSearch = lazy(() => import('./pages/CampusSearch.jsx'))

function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link to="/" className="mt-3 inline-block text-brand-700 underline">Go home</Link>
    </div>
  )
}

const guard = (el) => <ProtectedRoute>{el}</ProtectedRoute>

export default function App() {
  return (
    <>
      <Suspense fallback={<PageLoading message="Loading Campustu…" />}>
        <Routes>
          <Route path="/admin" element={guard(<AdminDashboard />)} />
          <Route path="/admin/moderation" element={guard(<AdminDashboard />)} />
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/sell" element={guard(<NewListing />)} />
            <Route path="/my-listings" element={guard(<MyListings />)} />
            <Route path="/items/:id" element={guard(<ItemPage />)} />
            <Route path="/kits" element={guard(<Kits />)} />
            <Route path="/marketplace" element={guard(<Marketplace />)} />
            <Route path="/search" element={guard(<CampusSearch />)} />
            <Route path="/needs" element={guard(<NeedBoard />)} />
            <Route path="/needs/:id" element={guard(<NeedBoard />)} />
            <Route path="/lost-found" element={guard(<LostFound />)} />
            <Route path="/lost-found/report" element={guard(<LostFoundNew />)} />
            <Route path="/profile" element={guard(<ProfileDashboard />)} />
            <Route path="/messages" element={guard(<Messages />)} />
            <Route path="/messages/:conversationId" element={guard(<Messages />)} />
            <Route path="/wishlist" element={guard(<Wishlist />)} />
            <Route path="/barter" element={guard(<BarterLoops />)} />
            <Route path="/achievements" element={guard(<Achievements />)} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
      <ShareQRWidget />
    </>
  )
}
