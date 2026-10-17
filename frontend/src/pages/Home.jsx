import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { APP_NAME } from '../components/Layout.jsx'

export default function Home() {
  const { user } = useAuth()
  return (
    <div className="py-8 text-center">
      <h1 className="text-3xl font-bold sm:text-4xl">{APP_NAME}</h1>
      <p className="mx-auto mt-3 max-w-xl text-slate-600">
        Buy and sell second-hand college accessories with other students: drafters, calculators, lab coats and more.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        {user ? (
          <>
            <Link to="/sell" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Sell an item</Link>
            <Link to="/my-listings" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">My listings</Link>
          </>
        ) : (
          <>
            <Link to="/signup" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Create an account</Link>
            <Link to="/login" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Log in</Link>
          </>
        )}
      </div>
      <p className="mt-10 text-xs text-slate-500">Browsing, semester kits and lost &amp; found are being built next.</p>
    </div>
  )
}
