import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'

const languages = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
]

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()

  const currentLang = languages.find((l) => l.code === i18n.language) || languages[0]

  const handleChange = (langCode: string) => {
    i18n.changeLanguage(langCode)
    // Persist to localStorage (i18next-browser-languagedetector handles this)
  }

  return (
    <div className="relative inline-block">
      <select
        value={i18n.language}
        onChange={(e) => handleChange(e.target.value)}
        className="appearance-none bg-transparent pl-8 pr-8 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.label}
          </option>
        ))}
      </select>
      <Globe className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
    </div>
  )
}
