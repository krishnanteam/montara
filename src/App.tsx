import { FileText, Home, LogOut } from 'lucide-react'
import { SkillCard } from './components/SkillCard'
import { useAuth } from './contexts/AuthContext'

const skills = [
  {
    title: 'Disclosure AI',
    description: 'Analyze real estate disclosure documents instantly. Upload documents and receive comprehensive briefings with risk assessments.',
    url: 'https://disclosureai-7362d.web.app',
    icon: <FileText className="w-6 h-6" />,
    gradient: 'from-violet-500 to-purple-600',
    category: 'Document Analysis',
  },
  {
    title: 'HomeMatch',
    description: 'Intelligently match buyers with ideal properties. Upload listings and discover perfect matches using advanced algorithms.',
    url: 'https://homematcher-86e14.web.app',
    icon: <Home className="w-6 h-6" />,
    gradient: 'from-emerald-500 to-teal-600',
    category: 'Matching',
  },
]

function App() {
  const { user, loading, error, signInWithGoogle, logout } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <img src="/sg-logo.png" alt="Montara" className="w-16 h-16 rounded-xl mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-2">Montara</h1>
          <p className="text-slate-400 mb-8">Sign in to access your digital employee</p>
          {error && (
            <p className="text-red-400 mb-4 text-sm">{error}</p>
          )}
          <button
            onClick={signInWithGoogle}
            className="inline-flex items-center gap-3 px-6 py-3 bg-white text-slate-900 rounded-lg font-medium hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/sg-logo.png" alt="Montara" className="w-8 h-8 rounded-lg" />
            <span className="text-white font-semibold text-lg">Montara</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              Online
            </div>
            <div className="flex items-center gap-3">
              {user.photoURL && (
                <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 rounded-full" />
              )}
              <button
                onClick={logout}
                className="p-2 text-slate-400 hover:text-white transition-colors"
                title="Sign out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Skills Section */}
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Skills</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {skills.map((skill) => (
            <SkillCard key={skill.title} {...skill} />
          ))}
        </div>

        {/* Coming Soon Hint */}
        <div className="mt-8 text-center">
          <p className="text-slate-500 text-sm">
            More skills coming soon...
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-sm text-slate-500">
          <p>© 2025 Montara</p>
          <p>Created by Steady Green Labs</p>
        </div>
      </footer>
    </div>
  )
}

export default App
