// Electron API 타입 선언

interface Album {
  id: string
  title: string
  coverPhotoBaseUrl?: string
  mediaItemsCount?: string
}

interface MediaItem {
  id: string
  baseUrl: string
  mimeType: string
  filename: string
  creationTime: string
  albumId: string
  cachedAt: number
}

interface AuthResult {
  success: boolean
  tokens?: {
    access_token: string
    refresh_token: string
    expiry_date: number
  }
  error?: string
}

interface AuthCheckResult {
  success: boolean
  isAuthenticated?: boolean
  error?: string
}

interface TokenResult {
  success: boolean
  token?: string
  error?: string
}

interface ElectronAPI {
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
  on: {
    slideshowToggle: (callback: () => void) => void
    slideshowStart: (callback: () => void) => void
    slideshowStop: (callback: () => void) => void
    scheduleStateChanged: (callback: (shouldPlay: boolean) => void) => void
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
