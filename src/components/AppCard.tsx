import { ExternalLink } from 'lucide-react'

interface AppCardProps {
  title: string
  description: string
  url: string
  icon: React.ReactNode
  gradient: string
}

export function AppCard({ title, description, url, icon, gradient }: AppCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block p-6 rounded-2xl ${gradient} text-white shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200`}
    >
      <div className="flex items-start justify-between">
        <div className="p-3 bg-white/20 rounded-xl">
          {icon}
        </div>
        <ExternalLink className="w-5 h-5 opacity-70" />
      </div>
      <h3 className="mt-4 text-xl font-bold">{title}</h3>
      <p className="mt-2 text-white/80 text-sm">{description}</p>
    </a>
  )
}
