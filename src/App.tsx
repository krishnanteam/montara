import { FileText, Home } from 'lucide-react'
import { AppCard } from './components/AppCard'

const apps = [
  {
    title: 'Disclosure AI',
    description: 'AI-powered real estate disclosure document analysis. Upload documents and get instant briefings.',
    url: 'https://disclosureai-7362d.web.app',
    icon: <FileText className="w-6 h-6" />,
    gradient: 'bg-gradient-to-br from-violet-500 to-purple-600',
  },
  {
    title: 'HomeMatch',
    description: 'Match buyers with sellers using intelligent algorithms. Upload listings and find perfect matches.',
    url: 'https://homematcher-86e14.web.app',
    icon: <Home className="w-6 h-6" />,
    gradient: 'bg-gradient-to-br from-emerald-500 to-teal-600',
  },
]

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Montara</h1>
          <p className="text-gray-600 mt-1">Your real estate toolkit</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Skills</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map((app) => (
              <AppCard key={app.title} {...app} />
            ))}
          </div>
        </section>
      </main>

      <footer className="mt-auto py-6 text-center text-gray-500 text-sm">
        <p>Montara</p>
      </footer>
    </div>
  )
}

export default App
