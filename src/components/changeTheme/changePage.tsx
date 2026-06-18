import {
  DialogButton,
  DropdownItem,
  Focusable,
  ModalRoot,
  PanelSection,
  PanelSectionRow,
  SteamSpinner,
  TextField,
  showModal,
  useParams
} from '@decky/ui'
import { useEffect, useState } from 'react'
import { Settings } from '../../hooks/useSettings'
import AudioPlayer from './audioPlayer'
import { getCache, updateCache } from '../../cache/musicCache'
import useTranslations from '../../hooks/useTranslations'
import { YouTubeVideoPreview } from '../../../types/YouTube'
import NoMusic from './noMusic'
import { getResolver } from '../../actions/audio'

export default function ChangePage({
  customSearch,
  currentSearch,
  setInitialSearch,
  handlePlay,
  loading,
  videos,
  settings,
  setMusicProvider
}: {
  videos: (YouTubeVideoPreview & { isPlaying: boolean })[]
  loading: boolean
  handlePlay: (idx: number, startPlaying: boolean) => void
  customSearch: (term: string) => void
  setInitialSearch: () => string
  currentSearch: string
  settings: Settings
  setMusicProvider: (value: Settings['musicProvider']) => void
}) {
  const t = useTranslations()
  const { appid } = useParams<{ appid: string }>()
  const appDetails = appStore.GetAppOverviewByGameID(parseInt(appid))
  const appName = appDetails?.display_name?.replace(/(™|®|©)/g, '')
  const [selected, setSelected] = useState<string | undefined>()
  const [searchTerm, setSearchTerm] = useState(currentSearch)

  useEffect(() => {
    setSearchTerm(currentSearch)
  }, [currentSearch])

  useEffect(() => {
    async function getData() {
      const cache = await getCache(parseInt(appid))
      setSelected(cache?.videoId)
    }
    getData()
  }, [appid])

  async function selectNewAudio(audio: {
    title: string
    videoId: string
    audioUrl: string
  }) {
    if (settings.downloadAudio) {
      const success = await getResolver(settings.useYtDlp, settings.musicProvider).downloadAudio({
        id: audio.videoId,
        url: audio.audioUrl
      })
      if (!success) {
        showModal(
          <ModalRoot>{t('downloadFailedDetail')}</ModalRoot>,
          undefined,
          { strTitle: t('downloadFailed') }
        )
        return
      }
    }
    setSelected(audio.videoId)
    updateCache(parseInt(appid), { videoId: audio.videoId })
  }

  return (
    <div>
      <h2 style={{ margin: '20px 0' }}>{appName}</h2>
      <PanelSection>
        <PanelSectionRow>
          <DropdownItem
            label={t('musicProvider')}
            rgOptions={[
              { data: 'youtube', label: 'YouTube' },
              { data: 'khinsider', label: 'KHInsider' }
            ]}
            selectedOption={settings.musicProvider || 'youtube'}
            onChange={(newVal: any) => setMusicProvider(newVal.data)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <Focusable
            style={{
              display: 'grid',
              gap: '6px',
              gridTemplateColumns: '2fr max-content max-content',
              height: 'max-content',
              background: 'var(--main-editor-bg-color)',
              borderRadius: '6px',
              padding: '10px'
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                customSearch(searchTerm)
              }}
            >
              <TextField
                onChange={(e) => setSearchTerm(e.target.value)}
                value={searchTerm}
              />
            </form>
            <DialogButton
              disabled={!searchTerm?.length}
              focusable={!loading && Boolean(searchTerm?.length)}
              onClick={() => customSearch(searchTerm)}
            >
              {t('search')}
            </DialogButton>
            <DialogButton
              disabled={!searchTerm?.length}
              focusable={!loading && Boolean(searchTerm?.length)}
              onClick={() => {
                setSearchTerm(setInitialSearch())
              }}
            >
              {t('reset')}
            </DialogButton>
          </Focusable>
        </PanelSectionRow>
      </PanelSection>
      {loading && videos?.length === 0 ? (
        <SteamSpinner />
      ) : (
        <>
          <Focusable
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '10px',
              flexDirection: 'row'
            }}
          >
            <NoMusic
              selected={selected === ''}
              selectNewAudio={selectNewAudio}
            />
            {videos.map((video, index) => (
              <AudioPlayer
                key={video.id}
                video={video}
                volume={settings.volume}
                handlePlay={(status) => {
                  handlePlay(index, status)
                }}
                selected={selected === video.id}
                selectNewAudio={selectNewAudio}
              />
            ))}
            {loading && <SteamSpinner />}
          </Focusable>
        </>
      )}
    </div>
  )
}
