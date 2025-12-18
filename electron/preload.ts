import { contextBridge, ipcRenderer } from 'electron'

// 타입 정의
export interface AuthResult {
  success: boolean
  tokens?: {
    access_token: string
    refresh_token: string
    expiry_date: number
  }
  error?: string
}

export interface AuthCheckResult {
  success: boolean
  isAuthenticated?: boolean
  error?: string
}

export interface TokenResult {
  success: boolean
  token?: string
  error?: string
}

export interface Album {
  id: string
  title: string
  coverPhotoBaseUrl?: string
  mediaItemsCount?: string
}

export interface MediaItem {
  id: string
  baseUrl: string
  mimeType: string
  filename: string
  creationTime: string
  albumId: string
  cachedAt: number
}

export interface ElectronAPI {
  auth: {
    login: () => Promise<AuthResult>
    logout: () => Promise<{ success: boolean; error?: string }>
    check: () => Promise<AuthCheckResult>
    getToken: () => Promise<TokenResult>
  }
  photos: {
    getAlbums: (forceRefresh?: boolean) => Promise<{ success: boolean; albums?: Album[]; error?: string }>
    getMedia: (albumId: string, forceRefresh?: boolean) => Promise<{ success: boolean; mediaItems?: MediaItem[]; error?: string }>
    refreshUrls: (mediaItemIds: string[]) => Promise<{ success: boolean; urls?: Record<string, string>; error?: string }>
    cacheImage: (mediaItem: { id: string; baseUrl: string; mimeType: string }) => Promise<{ success: boolean; localPath?: string; error?: string }>
    getCacheStats: () => Promise<{ success: boolean; stats?: { itemCount: number; diskSize: number } }>
    clearCache: () => Promise<{ success: boolean; error?: string }>
    createPickerSession: () => Promise<{ success: boolean; sessionId?: string; error?: string }>
    getSessionStatus: (sessionId: string) => Promise<{ success: boolean; mediaItemsSet?: boolean; error?: string }>
    getPickedMedia: (sessionId: string) => Promise<{ success: boolean; mediaItems?: MediaItem[]; error?: string }>
    getImage: (baseUrl: string, size?: string, imageId?: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>
    getVideo: (baseUrl: string, videoId: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
    clearImageCache: () => Promise<{ success: boolean; error?: string }>
  }
  window: {
    fullscreen: (enable?: boolean) => Promise<boolean>
  }
  power: {
    preventSleep: (prevent: boolean) => Promise<boolean>
  }
  theme: {
    isDark: () => Promise<boolean>
  }
  app: {
    setLaunchAtLogin: (enable: boolean) => Promise<boolean>
    getLaunchAtLogin: () => Promise<boolean>
  }
  slideshow: {
    setState: (running: boolean) => Promise<boolean>
  }
  store: {
    set: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>
    get: (key: string) => Promise<{ success: boolean; value?: unknown; error?: string }>
    delete: (key: string) => Promise<{ success: boolean; error?: string }>
  }
  on: {
    slideshowToggle: (callback: () => void) => void
    slideshowStart: (callback: () => void) => void
    slideshowStop: (callback: () => void) => void
    scheduleStateChanged: (callback: (shouldPlay: boolean) => void) => void
    appFocus: (callback: () => void) => void
  }
}

// Renderer 프로세스에 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
  // 인증 관련
  auth: {
    login: () => ipcRenderer.invoke('auth:google-login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    check: () => ipcRenderer.invoke('auth:check'),
    getToken: () => ipcRenderer.invoke('auth:get-token')
  },

  // Photos API
  photos: {
    getAlbums: (forceRefresh?: boolean) => ipcRenderer.invoke('photos:get-albums', forceRefresh),
    getMedia: (albumId: string, forceRefresh?: boolean) => ipcRenderer.invoke('photos:get-media', albumId, forceRefresh),
    refreshUrls: (mediaItemIds: string[]) => ipcRenderer.invoke('photos:refresh-urls', mediaItemIds),
    cacheImage: (mediaItem: { id: string; baseUrl: string; mimeType: string }) => ipcRenderer.invoke('photos:cache-image', mediaItem),
    getCacheStats: () => ipcRenderer.invoke('photos:cache-stats'),
    clearCache: () => ipcRenderer.invoke('photos:clear-cache'),
    createPickerSession: () => ipcRenderer.invoke('photos:create-picker-session'),
    getSessionStatus: (sessionId: string) => ipcRenderer.invoke('photos:get-session-status', sessionId),
    getPickedMedia: (sessionId: string) => ipcRenderer.invoke('photos:get-picked-media', sessionId),
    getImage: (baseUrl: string, size?: string, imageId?: string) => ipcRenderer.invoke('photos:get-image', baseUrl, size, imageId),
    getVideo: (baseUrl: string, videoId: string) => ipcRenderer.invoke('photos:get-video', baseUrl, videoId),
    clearImageCache: () => ipcRenderer.invoke('photos:clear-image-cache')
  },

  // 창 관련
  window: {
    fullscreen: (enable?: boolean) => ipcRenderer.invoke('window:fullscreen', enable)
  },

  // 전원 관리
  power: {
    preventSleep: (prevent: boolean) => ipcRenderer.invoke('power:prevent-sleep', prevent)
  },

  // 테마
  theme: {
    isDark: () => ipcRenderer.invoke('theme:is-dark')
  },

  // 앱 설정
  app: {
    setLaunchAtLogin: (enable: boolean) => ipcRenderer.invoke('app:set-launch-at-login', enable),
    getLaunchAtLogin: () => ipcRenderer.invoke('app:get-launch-at-login')
  },

  // 슬라이드쇼
  slideshow: {
    setState: (running: boolean) => ipcRenderer.invoke('slideshow:set-state', running)
  },

  // 영구 저장소
  store: {
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key)
  },

  // 이벤트 리스너
  on: {
    slideshowToggle: (callback: () => void) => {
      ipcRenderer.on('slideshow:toggle', callback)
    },
    slideshowStart: (callback: () => void) => {
      ipcRenderer.on('slideshow:start', callback)
    },
    slideshowStop: (callback: () => void) => {
      ipcRenderer.on('slideshow:stop', callback)
    },
    scheduleStateChanged: (callback: (shouldPlay: boolean) => void) => {
      ipcRenderer.on('schedule:state-changed', (_, shouldPlay) => callback(shouldPlay))
    },
    appFocus: (callback: () => void) => {
      ipcRenderer.on('app:focus', callback)
    }
  }
} satisfies ElectronAPI)

// 전역 타입 선언
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
