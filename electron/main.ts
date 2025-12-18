import { app, BrowserWindow, ipcMain, powerSaveBlocker, nativeTheme, Menu, Tray, shell, protocol } from 'electron'
import path from 'path'
import { config } from 'dotenv'
import Store from 'electron-store'

// 설정 저장소
const store = new Store({
  name: 'settings',
  defaults: {
    settings: {
      slideInterval: 10,
      windowMode: 'windowed',
      photoOrder: 'random',
      shuffleAlbums: true,
      transitionEffect: 'fade',
      launchAtLogin: false,
      schedule: {
        enabled: false,
        timeGrid: Array(7).fill(null).map(() => Array(24).fill(false))
      }
    },
    pickedMediaItems: []
  }
})

// .env 파일 로드
const isDev = !app.isPackaged

if (isDev) {
  // 개발 환경: 프로젝트 루트
  config({ path: path.join(__dirname, '../.env') })
  if (!process.env.GOOGLE_CLIENT_ID) {
    config({ path: path.join(__dirname, '../../.env') })
  }
} else {
  // 프로덕션 환경: extraResources
  config({ path: path.join(process.resourcesPath, '.env') })
}

import { GoogleAuthService } from './services/googleAuth'
import { photosApi } from './services/photosApi'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let powerSaveId: number | null = null
let scheduleCheckInterval: NodeJS.Timeout | null = null
let lastScheduleState: boolean | null = null
let isQuitting = false
let isSlideshowRunning = false

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false  // 로컬 파일 접근 허용
    },
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff'
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // macOS Dock 아이콘 설정
  if (process.platform === 'darwin' && app.dock) {
    const dockIconPath = isDev
      ? path.join(__dirname, '../build/icon_512.png')
      : path.join(process.resourcesPath, 'icon_512.png')
    try {
      app.dock.setIcon(dockIconPath)
    } catch (e) {
      console.log('Dock icon not set:', e)
    }
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 창 닫기 시 앱 종료
  mainWindow.on('close', () => {
    isQuitting = true
    app.quit()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 앱이 포커스를 받을 때 렌더러에 알림 (토큰 갱신용)
  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('app:focus')
  })
}

function createTray() {
  // 트레이 아이콘 경로 (개발/배포 환경에 따라 다름)
  let iconPath: string
  if (isDev) {
    iconPath = path.join(__dirname, '../public/tray-icon.png')
  } else {
    // 패키징된 앱에서는 extraResources에서 찾음
    iconPath = path.join(process.resourcesPath, 'tray-icon.png')
  }

  // 파일이 없으면 대체 경로 시도
  if (!require('fs').existsSync(iconPath)) {
    iconPath = path.join(__dirname, '../dist/tray-icon.png')
  }

  try {
    tray = new Tray(iconPath)
    updateTrayMenu()

    // 트레이 아이콘 클릭 시 창 표시
    tray.on('click', () => {
      if (mainWindow?.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow?.show()
      }
    })
  } catch {
    console.log('Tray icon not found, skipping tray creation')
  }
}

function updateTrayMenu() {
  if (!tray) return

  const contextMenu = Menu.buildFromTemplate([
    { label: 'PhotoSlide 열기', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    {
      label: isSlideshowRunning ? '슬라이드쇼 중지' : '슬라이드쇼 시작',
      click: () => {
        if (isSlideshowRunning) {
          mainWindow?.webContents.send('slideshow:stop')
        } else {
          mainWindow?.webContents.send('slideshow:start')
        }
      }
    },
    {
      label: isSlideshowRunning ? '재생 중...' : '대기 중',
      enabled: false
    },
    { type: 'separator' },
    { label: '종료', click: () => { isQuitting = true; app.quit() } }
  ])

  tray.setToolTip(isSlideshowRunning ? 'PhotoSlide - 재생 중' : 'PhotoSlide')
  tray.setContextMenu(contextMenu)
}

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: 'PhotoSlide 정보' },
        { type: 'separator' },
        { role: 'services', label: '서비스' },
        { type: 'separator' },
        { role: 'hide', label: 'PhotoSlide 가리기' },
        { role: 'hideOthers', label: '기타 가리기' },
        { role: 'unhide', label: '모두 표시' },
        { type: 'separator' },
        { role: 'quit', label: 'PhotoSlide 종료' }
      ]
    },
    {
      label: '편집',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '잘라내기' },
        { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '전체 선택' }
      ]
    },
    {
      label: '보기',
      submenu: [
        { role: 'reload', label: '새로고침' },
        { role: 'forceReload', label: '강제 새로고침' },
        { role: 'toggleDevTools', label: '개발자 도구' },
        { type: 'separator' },
        { role: 'resetZoom', label: '실제 크기' },
        { role: 'zoomIn', label: '확대' },
        { role: 'zoomOut', label: '축소' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '전체 화면' }
      ]
    },
    {
      label: '윈도우',
      submenu: [
        { role: 'minimize', label: '최소화' },
        { role: 'zoom', label: '확대/축소' },
        { type: 'separator' },
        { role: 'front', label: '앞으로 가져오기' }
      ]
    },
    {
      label: '도움말',
      submenu: [
        {
          label: 'GitHub 저장소',
          click: async () => {
            await shell.openExternal('https://github.com')
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// IPC 핸들러 등록
function registerIpcHandlers() {
  const authService = new GoogleAuthService()

  // Google OAuth 로그인
  ipcMain.handle('auth:google-login', async () => {
    try {
      const tokens = await authService.login()
      return { success: true, tokens }
    } catch (error) {
      console.error('Login failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // 로그아웃
  ipcMain.handle('auth:logout', async () => {
    try {
      await authService.logout()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // 인증 상태 확인
  ipcMain.handle('auth:check', async () => {
    try {
      const isAuthenticated = await authService.isAuthenticated()
      return { success: true, isAuthenticated }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // 액세스 토큰 가져오기
  ipcMain.handle('auth:get-token', async () => {
    try {
      const token = await authService.getAccessToken()
      return { success: true, token }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // 전체화면 토글
  ipcMain.handle('window:fullscreen', (_, enable?: boolean) => {
    if (mainWindow) {
      if (enable !== undefined) {
        mainWindow.setFullScreen(enable)
      } else {
        mainWindow.setFullScreen(!mainWindow.isFullScreen())
      }
      return mainWindow.isFullScreen()
    }
    return false
  })

  // 화면 절전 모드 방지
  ipcMain.handle('power:prevent-sleep', (_, prevent: boolean) => {
    if (prevent && powerSaveId === null) {
      powerSaveId = powerSaveBlocker.start('prevent-display-sleep')
      return true
    } else if (!prevent && powerSaveId !== null) {
      powerSaveBlocker.stop(powerSaveId)
      powerSaveId = null
      return true
    }
    return false
  })

  // 다크 모드 확인
  ipcMain.handle('theme:is-dark', () => {
    return nativeTheme.shouldUseDarkColors
  })

  // 로그인 시 자동 실행 설정
  ipcMain.handle('app:set-launch-at-login', (_, enable: boolean) => {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: false
    })
    return app.getLoginItemSettings().openAtLogin
  })

  // 로그인 시 자동 실행 상태 확인
  ipcMain.handle('app:get-launch-at-login', () => {
    return app.getLoginItemSettings().openAtLogin
  })

  // 슬라이드쇼 상태 업데이트
  ipcMain.handle('slideshow:set-state', (_, running: boolean) => {
    isSlideshowRunning = running
    updateTrayMenu()
    return true
  })

  // 설정 저장
  ipcMain.handle('store:set', (_, key: string, value: unknown) => {
    try {
      store.set(key, value)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // 설정 불러오기
  ipcMain.handle('store:get', (_, key: string) => {
    try {
      const value = store.get(key)
      return { success: true, value }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // 설정 삭제
  ipcMain.handle('store:delete', (_, key: string) => {
    try {
      store.delete(key as keyof typeof store.store)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Picker API 핸들러
  // 세션 생성 및 Picker 열기
  ipcMain.handle('photos:create-picker-session', async () => {
    try {
      const token = await authService.getAccessToken()
      if (!token) {
        return { success: false, error: '인증이 필요합니다' }
      }
      photosApi.setAccessToken(token)
      const session = await photosApi.createPickerSession()

      // Picker URI를 기본 브라우저에서 열기
      shell.openExternal(session.pickerUri)

      return { success: true, sessionId: session.id }
    } catch (error) {
      console.error('Create picker session failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // 세션 상태 확인
  ipcMain.handle('photos:get-session-status', async (_, sessionId: string) => {
    try {
      const token = await authService.getAccessToken()
      if (!token) {
        return { success: false, error: '인증이 필요합니다' }
      }
      photosApi.setAccessToken(token)
      const status = await photosApi.getSessionStatus(sessionId)
      return { success: true, ...status }
    } catch (error) {
      console.error('Get session status failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // 선택된 미디어 아이템 가져오기
  ipcMain.handle('photos:get-picked-media', async (_, sessionId: string) => {
    try {
      const token = await authService.getAccessToken()
      if (!token) {
        return { success: false, error: '인증이 필요합니다' }
      }
      photosApi.setAccessToken(token)
      const mediaItems = await photosApi.getPickedMediaItems(sessionId)
      return { success: true, mediaItems }
    } catch (error) {
      console.error('Get picked media failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // Photos API 핸들러
  // 앨범 목록 가져오기
  ipcMain.handle('photos:get-albums', async (_, forceRefresh?: boolean) => {
    try {
      const token = await authService.getAccessToken()
      if (!token) {
        return { success: false, error: '인증이 필요합니다' }
      }
      photosApi.setAccessToken(token)
      const albums = await photosApi.getAlbums(forceRefresh)
      return { success: true, albums }
    } catch (error) {
      console.error('Get albums failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // 앨범의 미디어 아이템 가져오기
  ipcMain.handle('photos:get-media', async (_, albumId: string, forceRefresh?: boolean) => {
    try {
      const token = await authService.getAccessToken()
      if (!token) {
        return { success: false, error: '인증이 필요합니다' }
      }
      photosApi.setAccessToken(token)
      const mediaItems = await photosApi.getMediaItems(albumId, forceRefresh)
      return { success: true, mediaItems }
    } catch (error) {
      console.error('Get media failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // baseUrl 갱신
  ipcMain.handle('photos:refresh-urls', async (_, mediaItemIds: string[]) => {
    try {
      const token = await authService.getAccessToken()
      if (!token) {
        return { success: false, error: '인증이 필요합니다' }
      }
      photosApi.setAccessToken(token)
      const urlMap = await photosApi.refreshBaseUrls(mediaItemIds)
      return { success: true, urls: Object.fromEntries(urlMap) }
    } catch (error) {
      console.error('Refresh URLs failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // 이미지 캐시
  ipcMain.handle('photos:cache-image', async (_, mediaItem: { id: string; baseUrl: string; mimeType: string }) => {
    try {
      const localPath = await photosApi.cacheImage(mediaItem as never)
      return { success: true, localPath }
    } catch (error) {
      console.error('Cache image failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // 캐시 통계
  ipcMain.handle('photos:cache-stats', () => {
    const stats = photosApi.getCacheStats()
    return { success: true, stats }
  })

  // 캐시 초기화
  ipcMain.handle('photos:clear-cache', () => {
    try {
      photosApi.clearCache()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // 이미지 프록시 (Picker API의 baseUrl은 인증 필요) - 디스크 캐싱 포함
  ipcMain.handle('photos:get-image', async (_, baseUrl: string, size?: string, imageId?: string) => {
    const fs = require('fs')
    const crypto = require('crypto')

    try {
      // 캐시 디렉토리 설정
      const cacheDir = path.join(app.getPath('userData'), 'image-cache')
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true })
      }

      // 캐시 키 생성 (imageId가 없으면 URL 해시 사용)
      const cacheKey = imageId || crypto.createHash('md5').update(baseUrl + (size || '')).digest('hex')
      const cachePath = path.join(cacheDir, `${cacheKey}.cache`)

      // 캐시된 파일이 있으면 반환
      if (fs.existsSync(cachePath)) {
        try {
          const cached = fs.readFileSync(cachePath, 'utf8')
          return { success: true, dataUrl: cached }
        } catch {
          // 캐시 읽기 실패 시 다시 다운로드
        }
      }

      const token = await authService.getAccessToken()
      if (!token) {
        return { success: false, error: '인증이 필요합니다' }
      }

      const imageUrl = size ? `${baseUrl}=${size}` : baseUrl
      const response = await fetch(imageUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` }
      }

      const buffer = await response.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      const dataUrl = `data:${contentType};base64,${base64}`

      // 디스크에 캐싱
      try {
        fs.writeFileSync(cachePath, dataUrl)
      } catch {
        // 캐시 저장 실패 무시
      }

      return { success: true, dataUrl }
    } catch (error) {
      console.error('Get image failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // 이미지 캐시 초기화
  ipcMain.handle('photos:clear-image-cache', () => {
    const fs = require('fs')
    try {
      const cacheDir = path.join(app.getPath('userData'), 'image-cache')
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir)
        for (const file of files) {
          fs.unlinkSync(path.join(cacheDir, file))
        }
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // 동영상 다운로드 및 로컬 파일 경로 반환
  ipcMain.handle('photos:get-video', async (_, baseUrl: string, videoId: string) => {
    console.log('=== Get Video Request ===')
    console.log('baseUrl:', baseUrl)
    console.log('videoId:', videoId)

    try {
      const token = await authService.getAccessToken()
      if (!token) {
        return { success: false, error: '인증이 필요합니다' }
      }

      // 캐시 디렉토리에 동영상 저장
      const cacheDir = path.join(app.getPath('userData'), 'video-cache')
      if (!require('fs').existsSync(cacheDir)) {
        require('fs').mkdirSync(cacheDir, { recursive: true })
      }

      const videoPath = path.join(cacheDir, `${videoId}.mp4`)
      console.log('videoPath:', videoPath)

      // 이미 캐시된 파일이 있으면 반환
      if (require('fs').existsSync(videoPath)) {
        console.log('Video already cached')
        return { success: true, filePath: videoPath }
      }

      // 동영상 다운로드 (dv 파라미터 사용)
      const videoUrl = `${baseUrl}=dv`
      console.log('Downloading from:', videoUrl)

      const response = await fetch(videoUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      console.log('Response status:', response.status)

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` }
      }

      const buffer = await response.arrayBuffer()
      console.log('Downloaded bytes:', buffer.byteLength)

      require('fs').writeFileSync(videoPath, Buffer.from(buffer))
      console.log('Video saved to:', videoPath)

      return { success: true, filePath: videoPath }
    } catch (error) {
      console.error('Get video failed:', error)
      return { success: false, error: String(error) }
    }
  })
}

// 스케줄 체크 함수
function checkSchedule() {
  if (!mainWindow) return

  // electron-store에서 직접 설정 가져오기
  const settings = store.get('settings') as { schedule?: { enabled: boolean; timeGrid: boolean[][] } } | null

  if (!settings?.schedule?.enabled) {
    lastScheduleState = null
    return
  }

  const now = new Date()
  // 요일: 0(일) ~ 6(토) -> 우리 그리드: 0(월) ~ 6(일)
  let dayIndex = now.getDay() - 1
  if (dayIndex < 0) dayIndex = 6 // 일요일은 6
  const hourIndex = now.getHours()

  const shouldPlay = settings.schedule.timeGrid[dayIndex]?.[hourIndex] ?? false

  console.log(`Schedule check: day=${dayIndex}, hour=${hourIndex}, shouldPlay=${shouldPlay}, lastState=${lastScheduleState}, slideshowRunning=${isSlideshowRunning}`)

  // 슬라이드쇼가 재생 중이고 스케줄 시간이 아니면 중지 이벤트 발송
  if (isSlideshowRunning && !shouldPlay) {
    console.log('Slideshow running but not scheduled time - sending stop event')
    mainWindow?.webContents.send('schedule:state-changed', false)
  }

  // 상태가 변경되었을 때만 이벤트 발송
  if (shouldPlay !== lastScheduleState) {
    console.log(`Schedule state changed: ${lastScheduleState} -> ${shouldPlay}`)
    lastScheduleState = shouldPlay
    mainWindow?.webContents.send('schedule:state-changed', shouldPlay)
  }
}

// 스케줄 체크 시작
function startScheduleCheck() {
  if (scheduleCheckInterval) {
    clearInterval(scheduleCheckInterval)
  }
  // 1분마다 스케줄 체크
  scheduleCheckInterval = setInterval(checkSchedule, 60 * 1000)
  // 즉시 한 번 체크
  checkSchedule()
}

// 앱 시작
app.whenReady().then(() => {
  // video-cache 폴더에 대한 custom protocol 등록
  protocol.registerFileProtocol('video-cache', (request, callback) => {
    const filePath = request.url.replace('video-cache://', '')
    callback({ path: decodeURIComponent(filePath) })
  })

  createWindow()
  createMenu()
  createTray()
  registerIpcHandlers()

  // 창이 준비되면 스케줄 체크 시작
  mainWindow?.once('ready-to-show', () => {
    setTimeout(startScheduleCheck, 3000) // 앱 초기화 후 3초 대기
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  if (powerSaveId !== null) {
    powerSaveBlocker.stop(powerSaveId)
  }
  if (scheduleCheckInterval) {
    clearInterval(scheduleCheckInterval)
  }
})
