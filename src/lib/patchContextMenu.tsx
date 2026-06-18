
import {
  afterPatch,
  fakeRenderComponent,
  findInReactTree,
  findInTree,
  findModuleByExport,
  MenuItem,
  Navigation,
  Patch
} from '@decky/ui'
import { FC } from 'react'

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

// Always add before "Properties..."
const spliceChangeMusic = (children: any[], appid: number) => {
  const propertiesMenuItemIdx = children.findIndex((item) =>
    findInReactTree(
      item,
      (x) => x?.onSelected && x.onSelected.toString().includes('AppProperties')
    )
  )
  children.splice(
    propertiesMenuItemIdx,
    0,
    <ChangeMusicButton key="game-theme-music-change-music" appId={appid} />
  )
}

const handleItemDupes = (items: any[]) => {
  const gtmIdx = items.findIndex(
    (x: any) => x?.key === 'game-theme-music-change-music'
  )
  if (gtmIdx !== -1) items.splice(gtmIdx, 1)
}

const isOpeningAppContextMenu = (items: any[]) => {
  if (!items?.length) {
    return false
  }
  return !!findInReactTree(
    items,
    (x) =>
      x?.props?.onSelected &&
      x?.props?.onSelected.toString().includes('launchSource')
  )
}

const patchMenuItems = (menuItems: any[], appid: number) => {
  let updatedAppid: number = appid
  // find the first menu component that has the correct appid, sometimes the one
  // passed is cached from another context menu
  const parentOverview = menuItems.find(
    (x: any) =>
      x?._owner?.pendingProps?.overview?.appid &&
      x._owner.pendingProps.overview.appid !== appid
  )
  if (parentOverview) {
    updatedAppid = parentOverview._owner.pendingProps.overview.appid
  }
  // Oct 2025 client
  if (updatedAppid === appid) {
    const foundApp = findInTree(
      menuItems,
      (x) => x?.app?.appid,
      { walkable: ['props', 'children'] }
    )
    if (foundApp) {
      updatedAppid = foundApp.app.appid
    }
  }
  spliceChangeMusic(menuItems, updatedAppid)
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
      let appid: number = 0
      if (component._owner) {
        appid = component._owner.pendingProps.overview.appid
      } else {
        // Oct 2025 client
        const foundApp = findInTree(
          component.props.children,
          (x) => x?.app?.appid,
          { walkable: ['props', 'children'] }
        )
        if (foundApp) {
          appid = foundApp.app.appid
        }
      }

      if (!patches.inner) {
        patches.inner = afterPatch(component, 'type', (_: any, ret: any) => {
          // initial render
          afterPatch(ret.type.prototype, 'render', (_: any, ret2: any) => {
            const menuItems = ret2.props.children[0] // always the first child
            if (!isOpeningAppContextMenu(menuItems)) return ret2
            try {
              handleItemDupes(menuItems)
            } catch (error) {
              return ret2
            }
            patchMenuItems(menuItems, appid)
            return ret2
          })

          // when steam decides to refresh app overview
          afterPatch(
            ret.type.prototype,
            'shouldComponentUpdate',
            ([nextProps]: any, shouldUpdate: any) => {
              try {
                handleItemDupes(nextProps.children)
              } catch (error) {
                // wrong context menu (probably)
                return shouldUpdate
              }

              if (shouldUpdate === true) {
                patchMenuItems(nextProps.children, appid)
              }

              return shouldUpdate
            }
          )
          return ret
        })
      } else {
        spliceChangeMusic(component.props.children, appid)
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
let LibraryContextMenu: any = null
try {
  LibraryContextMenu = fakeRenderComponent(
    Object.values(
      findModuleByExport(
        (e: any) => e?.toString && e.toString().includes('().LibraryContextMenu')
      ) ?? {}
    ).find((sibling: any) => sibling?.toString().includes('navigator:')) as FC
  )?.type
} catch (e) {
  console.warn('[GameThemeMusic] Could not find game context menu:', e)
}

export { LibraryContextMenu }

export default contextMenuPatch
