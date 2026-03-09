
import useTranslations from '../../hooks/useTranslations'


export default function AboutPage() {
  const t = useTranslations()
  return (
    <div>
      <h1>{t('aboutLabel')}</h1>
      <p>{t('aboutDescription')}</p>

    </div>
  )
}
