import { Tabs, useParams } from '@decky/ui'
import { useEffect, useState } from 'react'

import useTranslations from '../../hooks/useTranslations'
import ChangePage from './changePage'
import AboutPage from './aboutPage'
import { getResolver, MusicSearchError, SearchFailure } from '../../actions/audio'
import { getInitialSearch as buildInitialSearch } from '../../lib/searchTerm'
import { MediaContentPreview } from 'types/media'
import GameSettings from './gameSettings'
import { useSettings } from '../../hooks/useSettings'

const searchErrorMessages = {
  blocked: 'searchBlocked',
  rate_limited: 'searchRateLimited',
  timeout: 'searchTimedOut',
  http_error: 'searchFailed',
  network_error: 'searchFailed',
  unknown: 'searchFailed'
} as const

export default function ChangeTheme() {
  const [currentTab, setCurrentTab] = useState<string>('change-music-tab')
  const t = useTranslations()
  const { settings, isLoading: settingsLoading, setMusicProvider } = useSettings()
  const { appid } = useParams<{ appid: string }>()
  const appDetails = appStore.GetAppOverviewByGameID(parseInt(appid))
  const appName = appDetails?.display_name?.replace(/(™|®|©)/g, '')

  const [videos, setVideos] = useState<
    (MediaContentPreview & { isPlaying: boolean })[]
  >([])
  const [loadingNum, setLoadingNum] = useState(0)
  const [searchError, setSearchError] = useState<SearchFailure | 'unknown' | null>(null)
  const [searchAttempt, setSearchAttempt] = useState(0)

  const getInitialSearch = (provider?: string) =>
    buildInitialSearch(appName, provider, settings.musicProvider)

  const [searchTerm, setSearchTerm] = useState(getInitialSearch())

  useEffect(() => {
    if (settingsLoading) return

    const ytDefault = getInitialSearch('youtube')
    const khDefault = getInitialSearch('khinsider')

    if (settings.musicProvider === 'khinsider' && searchTerm === ytDefault) {
      setSearchTerm(khDefault)
    } else if (settings.musicProvider === 'youtube' && searchTerm === khDefault) {
      setSearchTerm(ytDefault)
    } else if (!searchTerm) {
      setSearchTerm(getInitialSearch())
    }
  }, [settingsLoading, appName, settings.musicProvider])

  useEffect(() => {
    let ignore = false
    async function getData() {
      setLoadingNum((x) => x + 1)
      setVideos([])
      setSearchError(null)
      try {
        const resolver = getResolver(settings.musicProvider)
        const res = resolver.getYouTubeSearchResults(searchTerm)
        for await (const video of res) {
          if (ignore) break
          setVideos((oldVideos) => [...oldVideos, { isPlaying: false, ...video }])
        }
      } catch (error) {
        if (!ignore) {
          setSearchError(error instanceof MusicSearchError ? error.reason : 'unknown')
        }
      } finally {
        setLoadingNum((x) => x - 1)
      }
    }
    if (searchTerm.length > 0 && !settingsLoading) {
      getData()
    }
    return () => {
      ignore = true
    }
  }, [searchTerm, searchAttempt, settingsLoading, settings.musicProvider])

  function submitSearch(term: string) {
    setSearchTerm(term)
    // same text won't retrigger the effect on its own
    setSearchAttempt((attempt) => attempt + 1)
  }

  function handlePlay(index: number, startPlay: boolean) {
    setVideos((oldVideos) => {
      const newVideos = oldVideos.map((v, vIndex) => ({
        ...v,
        isPlaying: vIndex === index ? startPlay : false
      }))
      return newVideos
    })
  }

  function setInitialSearch() {
    const term = getInitialSearch()
    submitSearch(term)
    return term
  }

  return (
    <div
      style={{
        marginTop: '40px',
        height: 'calc(100% - 40px)'
      }}
    >
      <Tabs
        autoFocusContents
        activeTab={currentTab}
        onShowTab={setCurrentTab}
        tabs={[
          {
            title: t('changeThemeMusic'),
            content: (
              <ChangePage
                videos={videos}
                loading={loadingNum > 0}
                searchError={searchError ? t(searchErrorMessages[searchError]) : null}
                handlePlay={handlePlay}
                customSearch={submitSearch}
                currentSearch={searchTerm}
                setInitialSearch={setInitialSearch}
                settings={settings}
                setMusicProvider={setMusicProvider}
              />
            ),
            id: 'change-music-tab'
          },
          {
            title: t('gameSettings'),
            content: <GameSettings />,
            id: 'game-settings-tab'
          },
          { title: t('about'), content: <AboutPage />, id: 'about-tab' }
        ]}
      />
    </div>
  )
}
