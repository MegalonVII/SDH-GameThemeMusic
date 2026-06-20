import { DialogButton, Focusable } from '@decky/ui'
import { useEffect, useRef, useState } from 'react'
import { toaster } from '@decky/api'
import useTranslations from '../../hooks/useTranslations'
import { getResolver } from '../../actions/audio'
import { MediaContentPreview } from 'types/media'
import { FaCheck, FaExclamationTriangle } from 'react-icons/fa'
import useAudioPlayer from '../../hooks/useAudioPlayer'
import { useSettings } from '../../hooks/useSettings'

export default function AudioPlayer({
  handlePlay,
  selected,
  selectNewAudio,
  video,
  volume
}: {
  video: MediaContentPreview & { isPlaying: boolean }
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
  const [fetching, setFetching] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [audioUrl, setAudio] = useState<string | undefined>(
    video.url && !video.url.includes('youtube.com') && !video.url.includes('youtu.be') ? video.url : undefined
  )
  const { settings } = useSettings()

  const audioPlayer = useAudioPlayer(audioUrl)

  const [isPlaying, setIsPlaying] = useState(false)
  const fetchIdRef = useRef(0)

  useEffect(() => {
    setIsPlaying(video.isPlaying)
  }, [video.isPlaying])

  async function getUrl() {
    if (audioUrl?.length && !audioUrl.includes('youtube.com') && !audioUrl.includes('youtu.be')) return audioUrl
    try {
      const resolver = getResolver(settings.musicProvider)
      const res = await resolver.getAudioUrlFromVideo(video)
      setAudio(res)
      return res
    } catch (err) {
      console.error(err)
      return undefined
    }
  }

  useEffect(() => {
    if (audioPlayer.isReady) {
      audioPlayer.setVolume(volume)
      if (video.isPlaying) {
        audioPlayer.play()
      } else {
        audioPlayer.stop()
      }
    }
  }, [video.isPlaying, audioPlayer.isReady])

  async function togglePlay() {
    const startPlaying = !isPlaying
    setIsPlaying(startPlaying)
    if (startPlaying) {
      const id = ++fetchIdRef.current
      setFetching(true)
      try {
        const url = audioUrl || (await getUrl())
        if (id !== fetchIdRef.current) return
        if (url?.length) {
          handlePlay(true)
        } else {
          setIsPlaying(false)
          toaster.toast({
            title: t('playbackFailed'),
            body: t('playbackFailedDetail'),
            icon: <FaExclamationTriangle />,
            duration: 3000
          })
        }
      } finally {
        setFetching(false)
      }
    } else {
      handlePlay(false)
    }
  }

  async function selectAudio() {
    if (!video.id.length) return
    setDownloading(true)
    setFetching(true)
    try {
      const url = audioUrl || (await getUrl())
      if (!url?.length) {
        toaster.toast({
          title: t('playbackFailed'),
          body: t('playbackFailedDetail'),
          icon: <FaExclamationTriangle />,
          duration: 3000
        })
        return
      }
      await selectNewAudio({
        title: video.title,
        videoId: video.id,
        audioUrl: url
      })
    } finally {
      setFetching(false)
      setDownloading(false)
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
            disabled={fetching}
            focusable={true}
          >
            {isPlaying ? t('stop') : t('play')}
          </DialogButton>
          <div style={{ position: 'relative' }}>
            <DialogButton
              disabled={selected || downloading || fetching}
              focusable={!selected && !downloading}
              onClick={selectAudio}
            >
              {selected
                ? t('selected')
                : downloading
                  ? t('downloading')
                  : t('download')}
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
      </Focusable>
    </div>
  )
}
