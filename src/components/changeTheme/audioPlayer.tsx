import { DialogButton, Focusable } from '@decky/ui'
import { useEffect, useState } from 'react'
import useTranslations from '../../hooks/useTranslations'
import { getResolver } from '../../actions/audio'
import { YouTubeVideoPreview } from '../../../types/YouTube'
import { FaCheck } from 'react-icons/fa'
import Spinner from '../spinner'
import useAudioPlayer from '../../hooks/useAudioPlayer'
import { useSettings } from '../../hooks/useSettings'

export default function AudioPlayer({
  handlePlay,
  selected,
  selectNewAudio,
  video,
  volume
}: {
  video: YouTubeVideoPreview & { isPlaying: boolean }
  volume: number
  handlePlay: (startPlaying: boolean) => void
  selected: boolean
  selectNewAudio: (audio: {
    title: string
    videoId: string
    audioUrl: string
  }) => Promise<void>
}) {
  const t = useTranslations()
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [audioUrl, setAudio] = useState<string | undefined>(
    video.url && !video.url.includes('youtube.com') && !video.url.includes('youtu.be') ? video.url : undefined
  )
  const { settings } = useSettings()

  const audioPlayer = useAudioPlayer(audioUrl)

  async function getUrl() {
    if (audioUrl?.length && !audioUrl.includes('youtube.com') && !audioUrl.includes('youtu.be')) return audioUrl
    setLoading(true)
    try {
      const resolver = getResolver(settings.useYtDlp, settings.musicProvider)
      const res = await resolver.getAudioUrlFromVideo(video)
      setAudio(res)
      setLoading(false)
      return res
    } catch (err) {
      console.error(err)
      setLoading(false)
      return undefined
    }
  }

  useEffect(() => {
    if (audioPlayer.isReady) {
      audioPlayer.setVolume(volume)
    }
  }, [audioPlayer.isReady, volume])

  useEffect(() => {
    if (audioPlayer.isReady) {
      if (video.isPlaying) audioPlayer.play()
      else audioPlayer.stop()
    }
  }, [video.isPlaying, audioPlayer.isReady])

  async function togglePlay() {
    const currentUrl = audioUrl || (await getUrl())
    if (currentUrl?.length) {
      handlePlay(!video.isPlaying)
    }
  }

  async function selectAudio() {
    if (video.id.length) {
      const currentUrl = audioUrl || (await getUrl())
      if (currentUrl?.length) {
        setDownloading(true)
        await selectNewAudio({
          title: video.title,
          videoId: video.id,
          audioUrl: currentUrl
        })
        setDownloading(false)
      }
    }
  }

  return (
    <div>
      <Focusable
        style={{
          background: 'var(--main-editor-bg-color)',
          borderRadius: '6px',
          display: 'grid',
          gridTemplateRows: 'max-content max-content max-content',
          overflow: 'hidden',
          padding: '10px',
          width: '230px'
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '230px',
            height: 0,
            paddingBottom: '56.25%',
            overflow: 'hidden'
          }}
        >
          <img
            src={video.thumbnail}
            alt={video.title}
            style={{
              overflow: 'hidden',
              width: '230px',
              borderRadius: '6px',
              position: 'absolute',
              top: '50%',
              left: 0,
              transform: 'translateY(-50%)',
              height: 'auto'
            }}
          />
        </div>
        <p
          style={{
            color: 'var(--main-editor-text-color)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            width: '230px',
            height: '68px'
          }}
        >
          {video.title}
        </p>

        {loading || downloading ? (
          <div
            style={{
              height: '85px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {downloading && <div>Downloading...</div>}
            <Spinner />
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              width: '230px'
            }}
          >
            <DialogButton
              onClick={togglePlay}
              disabled={loading}
              focusable={!loading}
            >
              {video.isPlaying ? t('stop') : t('play')}
            </DialogButton>
            <div style={{ position: 'relative' }}>
              <DialogButton
                disabled={selected || loading}
                focusable={!selected && !loading}
                onClick={selectAudio}
              >
                {selected
                  ? t('selected')
                  : settings.downloadAudio
                    ? t('download')
                    : t('select')}
              </DialogButton>
              {selected ? (
                <div
                  style={{
                    height: '20px',
                    width: '20px',
                    position: 'absolute',
                    bottom: '-6px',
                    right: '-6px',
                    background: '#59bf40',
                    borderRadius: '50%',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <FaCheck />
                </div>
              ) : (
                ''
              )}
            </div>
          </div>
        )}
      </Focusable>
    </div>
  )
}
