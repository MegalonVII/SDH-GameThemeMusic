import { useState } from 'react'
import languages from '../lib/translations'

function getCurrentLanguage(): keyof typeof languages {
  const steamLang = window.LocalizationManager.m_rgLocalesToUse[0]
  const lang = steamLang.replace(/-([a-z])/g, (_, letter: string) =>
    letter.toUpperCase()
  ) as keyof typeof languages
  return languages[lang] ? lang : 'en'
}

function useTranslations() {
  const [lang] = useState<keyof typeof languages>(getCurrentLanguage())
  return function (
    key: keyof (typeof languages)['en'],
    replacements: { [key: string]: string } = {}
  ): string {
    let result: string
    const langObj = (languages as any)[lang]
    const enObj = (languages as any).en

    if (langObj?.[key]?.length) {
      result = langObj[key]
    } else if (enObj?.[key]?.length) {
      result = enObj[key]
    } else {
      result = key
    }
    return result.replace(
      /{\w+}/g,
      (placeholder: string) =>
        replacements[placeholder.substring(1, placeholder.length - 1)] ||
        placeholder
    )
  }
}

export default useTranslations
