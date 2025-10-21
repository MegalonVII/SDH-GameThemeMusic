/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  afterPatch,
  fakeRenderComponent,
  findInReactTree,
  findModuleChild,
  findInTree,
  MenuItem,
  Navigation,
  Patch
} from '@decky/ui'
import useTranslations from '../hooks/useTranslations'

function ChangeMusicButton({ appId }: { appId: number }) {
  const t = useTranslations()
  return (
    <MenuItem
      key="game-theme-music-change-music"
      onSelected={() => {
        Navigation.Navigate(`/gamethememusic/${appId}`)
      }}
    >
      {t('changeThemeMusic')}...
    </MenuItem>
  )
}

// Always add before "Properties...". If not found, skip insertion.
const spliceChangeMusic = (children: any, appid: number | undefined) => {
  if (!Array.isArray(children) || typeof appid !== 'number') return

  try {
    const existingIdx = children.findIndex(
      (x: any) => x?.key === 'game-theme-music-change-music'
    )
    if (existingIdx !== -1) children.splice(existingIdx, 1)
  } catch (_) {
    // no-op
  }

  let insertIdx = -1
  try {
    insertIdx = children.findIndex((item: any) =>
      findInReactTree(
        item,
        (x: any) => x?.onSelected && x.onSelected.toString().includes('AppProperties')
      )
    )
  } catch (_) {
    insertIdx = -1
  }

  if (insertIdx < 0) return
  children.splice(insertIdx, 0, <ChangeMusicButton appId={appid} />)
}

/**
 * Patches the game context menu.
 * @param LibraryContextMenu The game context menu.
 * @returns A patch to remove when the plugin dismounts.
 */
const contextMenuPatch = (LibraryContextMenu: any) => {
  const patches: {
    outer?: Patch
    inner?: Patch
    unpatch: () => void
  } = {
    unpatch: () => {
      return null
    }
  }
  patches.outer = afterPatch(
    LibraryContextMenu.prototype,
    'render',
    (_: Record<string, unknown>[], component: any) => {
      let appid: number | undefined
      try {
        appid = component?._owner?.pendingProps?.overview?.appid
      } catch (_) {
        appid = undefined
      }

      // Oct 2025 client
      if (typeof appid !== 'number') {
        try {
          const found = findInTree(
            component?.props?.children,
            (x: any) => x?.app?.appid,
            { walkable: ['props', 'children'] }
          )
          if (found?.app?.appid) appid = found.app.appid
        } catch (_) {
          // no-op
        }
      }

      if (!patches.inner) {
        patches.inner = afterPatch(
          component.type?.prototype ?? component,
          'shouldComponentUpdate',
          ([nextProps]: any, shouldUpdate: any) => {
            const nextChildren = nextProps?.children
            if (!Array.isArray(nextChildren)) return shouldUpdate

            try {
              const gtmIdx = nextChildren.findIndex(
                (x: any) => x?.key === 'game-theme-music-change-music'
              )
              if (gtmIdx !== -1) nextChildren.splice(gtmIdx, 1)
            } catch (_) {
              return shouldUpdate
            }

            if (shouldUpdate === true) {
              let updatedAppid: number | undefined = appid
              try {
                const parentOverview = nextChildren.find(
                  (x: any) => x?._owner?.pendingProps?.overview?.appid
                )
                if (typeof parentOverview?._owner?.pendingProps?.overview?.appid === 'number') {
                  updatedAppid = parentOverview._owner.pendingProps.overview.appid
                }
              } catch (_) {
                // no-op
              }

              // Oct 2025 client
              if (typeof updatedAppid !== 'number') {
                try {
                  const found = findInTree(
                    nextChildren,
                    (x: any) => x?.app?.appid,
                    { walkable: ['props', 'children'] }
                  )
                  if (found?.app?.appid) updatedAppid = found.app.appid
                } catch (_) {
                  // no-op
                }
              }

              spliceChangeMusic(nextChildren, updatedAppid)
            }

            return shouldUpdate
          }
        )
      } else {
        const compChildren = component?.props?.children
        spliceChangeMusic(compChildren, appid)
      }

      return component
    }
  )
  patches.unpatch = () => {
    patches.outer?.unpatch()
    patches.inner?.unpatch()
  }
  return patches
}

/**
 * Game context menu component.
 */
export const LibraryContextMenu = fakeRenderComponent(
  findModuleChild((m: any) => {
    if (typeof m !== 'object') return
    for (const prop in m) {
      if (
        m[prop]?.toString() &&
        m[prop].toString().includes('().LibraryContextMenu')
      ) {
        return Object.values(m).find(
          (sibling) =>
            sibling?.toString().includes('createElement') &&
            sibling?.toString().includes('navigator:')
        )
      }
    }
    return
  })
).type

export default contextMenuPatch
