import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'
import AuthPage from './pages/AuthPage.jsx'
import NewListing from './pages/NewListing.jsx'
import ItemPage from './pages/ItemPage.jsx'
import MyListings from './pages/MyListings.jsx'
import Marketplace from './pages/Marketplace.jsx'
import Kits from './pages/Kits.jsx'
import Wishlist from './pages/Wishlist.jsx'
import LostFound from './pages/LostFound.jsx'
import LostFoundNew from './pages/LostFoundNew.jsx'
import ProfileDashboard from './pages/ProfileDashboard.jsx'

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
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/sell" element={guard(<NewListing />)} />
        <Route path="/my-listings" element={guard(<MyListings />)} />
        <Route path="/items/:id" element={guard(<ItemPage />)} />
        <Route path="/kits" element={guard(<Kits />)} />
        <Route path="/marketplace" element={guard(<Marketplace />)} />
        <Route path="/lost-found" element={guard(<LostFound />)} />
        <Route path="/lost-found/report" element={guard(<LostFoundNew />)} />
        <Route path="/profile" element={guard(<ProfileDashboard />)} />
        <Route path="/wishlist" element={guard(<Wishlist />)} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
