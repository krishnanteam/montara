import { ArrowRight } from 'lucide-react'

interface SkillCardProps {
  title: string
  description: string
  url: string
  icon: React.ReactNode
  gradient: string
  category: string
}

export function SkillCard({ title, description, url, icon, gradient, category }: SkillCardProps) {
  const handleClick = () => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      className="group block p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300 cursor-pointer"
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} text-white shadow-lg`}>
          {icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              {category}
            </span>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors">
            {title}
          </h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      {/* Action */}
      <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
        <span className="text-sm text-slate-500">Launch skill</span>
        <div className="flex items-center gap-2 text-blue-400 group-hover:gap-3 transition-all">
          <span className="text-sm font-medium">Open</span>
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </div>
  )
}
