import { useEffect, useState } from 'react'

import { getResolver } from '../actions/audio'

import { getCache } from '../cache/musicCache'
import { useSettings } from '../hooks/useSettings'

const useThemeMusic = (appId: number) => {
  const { settings, isLoading: settingsLoading } = useSettings()
  const [audio, setAudio] = useState<{ videoId: string; audioUrl: string }>({
    videoId: '',
    audioUrl: ''
  })
  const appDetails = appStore.GetAppOverviewByGameID(appId)
  const appName = appDetails?.display_name?.replace(/(™|®|©)/g, '')

  useEffect(() => {
    async function getData() {
      const resolver = getResolver(settings.musicProvider)
      const cache = await getCache(appId)
      if (cache?.videoId?.length == 0) {
        return setAudio({ videoId: '', audioUrl: '' })
      } else if (cache?.videoId?.length) {
        const newAudio = await resolver.getAudioUrlFromVideo({
          id: cache.videoId
        })
        if (newAudio?.length) {
          return setAudio({ videoId: cache.videoId, audioUrl: newAudio })
        }
      } else {
        return setAudio({ videoId: '', audioUrl: '' })
      }
    }
    if (appName?.length && !settingsLoading) {
      getData()
    }
  }, [appName, settingsLoading])

  return {
    audio
  }
}

export default useThemeMusic
