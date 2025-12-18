import { app } from 'electron'
import Store from 'electron-store'
import fs from 'fs'
import path from 'path'
import https from 'https'

// 타입 정의
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
  width?: string
  height?: string
}

interface CachedMediaItem extends MediaItem {
  albumId: string
  cachedAt: number
  localPath?: string
}

interface CacheData {
  albums: Album[]
  mediaItems: CachedMediaItem[]
  lastAlbumSync: number
  lastMediaSync: Record<string, number>
}

// 설정 저장소
const store = new Store<CacheData>({
  name: 'photoslide-cache',
  defaults: {
    albums: [],
    mediaItems: [],
    lastAlbumSync: 0,
    lastMediaSync: {}
  }
})

// 캐시 디렉토리
const getCacheDir = () => {
  const cacheDir = path.join(app.getPath('userData'), 'image-cache')
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

// 캐시 유효 시간 (24시간)
const CACHE_TTL = 24 * 60 * 60 * 1000
// baseUrl 유효 시간 (50분 - 60분 만료 전 갱신)
const BASE_URL_TTL = 50 * 60 * 1000
// 최대 캐시 크기 (500MB)
const MAX_CACHE_SIZE = 500 * 1024 * 1024

// Exponential backoff 설정
const MAX_RETRIES = 3
const INITIAL_DELAY = 1000

export class PhotosApiService {
  private accessToken: string | null = null

  setAccessToken(token: string) {
    console.log('setAccessToken called, token (first 20 chars):', token?.substring(0, 20))
    this.accessToken = token
  }

  // Exponential backoff를 적용한 fetch
  private async fetchWithRetry(url: string, options: RequestInit = {}, retries = MAX_RETRIES): Promise<Response> {
    console.log('=== fetchWithRetry Debug ===')
    console.log('URL:', url)
    console.log('Token (first 50 chars):', this.accessToken?.substring(0, 50))
    console.log('Full token length:', this.accessToken?.length)
    console.log('============================')

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Accept': 'application/json'
    }

    // POST 요청의 경우 Content-Type 추가
    if (options.method === 'POST') {
      headers['Content-Type'] = 'application/json'
    }

    // 기존 헤더 병합
    if (options.headers) {
      Object.assign(headers, options.headers)
    }

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, { ...options, headers })
        console.log('Response status:', response.status)
        console.log('Response headers:', Object.fromEntries(response.headers.entries()))

        if (response.status === 429) {
          // Rate limit - exponential backoff
          const delay = INITIAL_DELAY * Math.pow(2, i)
          console.log(`Rate limited. Retrying in ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        if (!response.ok && response.status >= 500) {
          // Server error - retry
          const delay = INITIAL_DELAY * Math.pow(2, i)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        return response
      } catch (error) {
        if (i === retries - 1) throw error
        const delay = INITIAL_DELAY * Math.pow(2, i)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw new Error('Max retries exceeded')
  }

  // Picker API: 세션 생성
  async createPickerSession(): Promise<{ id: string; pickerUri: string }> {
    console.log('=== Creating Picker Session ===')

    const response = await fetch('https://photospicker.googleapis.com/v1/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })

    const data = await response.json()
    console.log('Session created:', JSON.stringify(data, null, 2))

    if (data.error) {
      throw new Error(data.error.message)
    }

    return {
      id: data.id,
      pickerUri: data.pickerUri
    }
  }

  // Picker API: 세션 상태 확인
  async getSessionStatus(sessionId: string): Promise<{ mediaItemsSet: boolean }> {
    const response = await fetch(`https://photospicker.googleapis.com/v1/sessions/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    })

    const data = await response.json()
    return {
      mediaItemsSet: data.mediaItemsSet || false
    }
  }

  // Picker API: 선택된 미디어 아이템 가져오기
  async getPickedMediaItems(sessionId: string): Promise<MediaItem[]> {
    console.log('=== Getting Picked Media Items ===')

    const items: MediaItem[] = []
    let pageToken: string | undefined

    do {
      const url = new URL('https://photospicker.googleapis.com/v1/mediaItems')
      url.searchParams.set('sessionId', sessionId)
      url.searchParams.set('pageSize', '100')
      if (pageToken) url.searchParams.set('pageToken', pageToken)

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      })

      const data = await response.json()
      console.log('Media items response:', JSON.stringify(data, null, 2))

      if (data.error) {
        throw new Error(data.error.message)
      }

      if (data.mediaItems) {
        items.push(...data.mediaItems.map((item: { id: string; createTime?: string; mediaFile?: { baseUrl: string; mimeType: string; filename: string }; type?: string }) => ({
          id: item.id,
          baseUrl: item.mediaFile?.baseUrl || '',
          mimeType: item.mediaFile?.mimeType || 'image/jpeg',
          filename: item.mediaFile?.filename || item.id,
          creationTime: item.createTime || new Date().toISOString()
        })))
      }

      pageToken = data.nextPageToken
    } while (pageToken)

    console.log('Total picked items:', items.length)
    return items
  }

  // 앨범 목록 가져오기 (캐시 사용) - Picker API는 앨범 개념이 없음
  async getAlbums(forceRefresh = false): Promise<Album[]> {
    const cachedAlbums = store.get('albums')

    // Picker API는 앨범 목록을 제공하지 않음
    // 대신 "선택된 사진" 가상 앨범을 반환
    if (cachedAlbums.length > 0 && !forceRefresh) {
      return cachedAlbums
    }

    // 기본 가상 앨범 반환
    const defaultAlbum: Album = {
      id: 'picker-selected',
      title: '선택된 사진',
      mediaItemsCount: '0'
    }

    return [defaultAlbum]
  }

  // 앨범의 미디어 아이템 가져오기 (캐시 사용)
  async getMediaItems(albumId: string, forceRefresh = false): Promise<CachedMediaItem[]> {
    const lastMediaSync = store.get('lastMediaSync')
    const cachedItems = store.get('mediaItems').filter(item => item.albumId === albumId)

    // 캐시가 유효하면 캐시 반환
    if (!forceRefresh && cachedItems.length > 0 && lastMediaSync[albumId] && Date.now() - lastMediaSync[albumId] < CACHE_TTL) {
      return cachedItems
    }

    // API에서 미디어 아이템 가져오기
    const items: CachedMediaItem[] = []
    let pageToken: string | undefined

    do {
      const response = await this.fetchWithRetry(
        'https://photoslibrary.googleapis.com/v1/mediaItems:search',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            albumId,
            pageSize: 100,
            pageToken
          })
        }
      )

      const data = await response.json()

      if (data.mediaItems) {
        const mediaItems = data.mediaItems
          .filter((item: MediaItem) => item.mimeType.startsWith('image/'))
          .map((item: MediaItem) => ({
            ...item,
            albumId,
            cachedAt: Date.now()
          }))
        items.push(...mediaItems)
      }
      pageToken = data.nextPageToken
    } while (pageToken)

    // 기존 캐시에서 다른 앨범 아이템 유지하면서 업데이트
    const existingItems = store.get('mediaItems').filter(item => item.albumId !== albumId)
    store.set('mediaItems', [...existingItems, ...items])

    // 동기화 시간 업데이트
    const syncTimes = store.get('lastMediaSync')
    store.set('lastMediaSync', { ...syncTimes, [albumId]: Date.now() })

    return items
  }

  // baseUrl 갱신 (50분마다 필요)
  async refreshBaseUrls(mediaItemIds: string[]): Promise<Map<string, string>> {
    const urlMap = new Map<string, string>()

    // batchGet은 최대 50개까지
    for (let i = 0; i < mediaItemIds.length; i += 50) {
      const batch = mediaItemIds.slice(i, i + 50)
      const params = new URLSearchParams()
      batch.forEach(id => params.append('mediaItemIds', id))

      const response = await this.fetchWithRetry(
        `https://photoslibrary.googleapis.com/v1/mediaItems:batchGet?${params.toString()}`
      )

      const data = await response.json()

      if (data.mediaItemResults) {
        for (const result of data.mediaItemResults) {
          if (result.mediaItem) {
            urlMap.set(result.mediaItem.id, result.mediaItem.baseUrl)
          }
        }
      }
    }

    // 캐시 업데이트
    const cachedItems = store.get('mediaItems')
    const updatedItems = cachedItems.map(item => {
      const newUrl = urlMap.get(item.id)
      if (newUrl) {
        return { ...item, baseUrl: newUrl, cachedAt: Date.now() }
      }
      return item
    })
    store.set('mediaItems', updatedItems)

    return urlMap
  }

  // baseUrl이 만료되었는지 확인
  isBaseUrlExpired(cachedAt: number): boolean {
    return Date.now() - cachedAt > BASE_URL_TTL
  }

  // 이미지 다운로드 및 캐시
  async cacheImage(mediaItem: CachedMediaItem, size = 'w1920-h1080'): Promise<string> {
    const cacheDir = getCacheDir()
    const extension = mediaItem.mimeType.split('/')[1] || 'jpg'
    const localPath = path.join(cacheDir, `${mediaItem.id}.${extension}`)

    // 이미 캐시된 파일이 있으면 반환
    if (fs.existsSync(localPath)) {
      return localPath
    }

    // 캐시 크기 확인 및 정리
    await this.cleanupCacheIfNeeded()

    // 이미지 다운로드
    const imageUrl = `${mediaItem.baseUrl}=${size}`

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(localPath)

      https.get(imageUrl, response => {
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve(localPath)
        })
      }).on('error', err => {
        fs.unlink(localPath, () => {})
        reject(err)
      })
    })
  }

  // 캐시 정리 (LRU 방식)
  private async cleanupCacheIfNeeded(): Promise<void> {
    const cacheDir = getCacheDir()

    try {
      const files = fs.readdirSync(cacheDir)
      let totalSize = 0
      const fileStats: { path: string; size: number; mtime: number }[] = []

      for (const file of files) {
        const filePath = path.join(cacheDir, file)
        const stat = fs.statSync(filePath)
        totalSize += stat.size
        fileStats.push({ path: filePath, size: stat.size, mtime: stat.mtimeMs })
      }

      // 캐시 크기가 제한을 초과하면 오래된 파일 삭제
      if (totalSize > MAX_CACHE_SIZE) {
        // 수정 시간 기준 정렬 (오래된 것 먼저)
        fileStats.sort((a, b) => a.mtime - b.mtime)

        let deletedSize = 0
        const targetSize = MAX_CACHE_SIZE * 0.7 // 70%까지 줄임

        for (const file of fileStats) {
          if (totalSize - deletedSize <= targetSize) break
          try {
            fs.unlinkSync(file.path)
            deletedSize += file.size
          } catch {
            // 삭제 실패 무시
          }
        }
      }
    } catch (error) {
      console.error('Cache cleanup failed:', error)
    }
  }

  // 캐시된 이미지 경로 가져오기
  getCachedImagePath(mediaItemId: string): string | null {
    const cacheDir = getCacheDir()
    const files = fs.readdirSync(cacheDir)
    const cached = files.find(f => f.startsWith(mediaItemId))
    return cached ? path.join(cacheDir, cached) : null
  }

  // 캐시 초기화
  clearCache(): void {
    store.clear()
    const cacheDir = getCacheDir()
    const files = fs.readdirSync(cacheDir)
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(cacheDir, file))
      } catch {
        // 삭제 실패 무시
      }
    }
  }

  // 캐시 통계
  getCacheStats(): { itemCount: number; diskSize: number } {
    const cacheDir = getCacheDir()
    let diskSize = 0

    try {
      const files = fs.readdirSync(cacheDir)
      for (const file of files) {
        const stat = fs.statSync(path.join(cacheDir, file))
        diskSize += stat.size
      }
    } catch {
      // 오류 무시
    }

    return {
      itemCount: store.get('mediaItems').length,
      diskSize
    }
  }
}

export const photosApi = new PhotosApiService()
