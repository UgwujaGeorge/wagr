import { NavLink, Route, Routes } from 'react-router-dom'
import { Crosshair, Plus, Trophy, UserRound } from 'lucide-react'
import { LandingPage } from './pages/LandingPage'
import { ExplorePage } from './pages/ExplorePage'
import { CreateDuelPage } from './pages/CreateDuelPage'
import { DuelDetailPage } from './pages/DuelDetailPage'
import { MyDuelsPage } from './pages/MyDuelsPage'
import { ResultPage } from './pages/ResultPage'
import { BaseNetworkProvider } from './lib/network'
import { NetworkSelector } from './components/NetworkSelector'
import { WalletButton } from './components/WalletButton'

export function App() {
  return (
    <BaseNetworkProvider>
      <AppContent />
    </BaseNetworkProvider>
  )
}

function AppContent() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">W</span>
          <span>
            <strong>Wagr</strong>
            <small>PvP prediction battles</small>
          </span>
        </NavLink>

        <nav className="nav-links">
          <NavLink to="/explore">
            <Crosshair size={16} /> Explore
          </NavLink>
          <NavLink to="/create">
            <Plus size={16} /> Create
          </NavLink>
          <NavLink to="/my-duels">
            <UserRound size={16} /> My Duels
          </NavLink>
          <NavLink to="/results/103">
            <Trophy size={16} /> Results
          </NavLink>
        </nav>

        <div className="topbar-actions">
          <NetworkSelector />
          <WalletButton />
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/create" element={<CreateDuelPage />} />
          <Route path="/duels/:duelId" element={<DuelDetailPage />} />
          <Route path="/my-duels" element={<MyDuelsPage />} />
          <Route path="/results/:duelId" element={<ResultPage />} />
        </Routes>
      </main>
    </div>
  )
}
