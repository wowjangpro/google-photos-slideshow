import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from '../styles/Slideshow.module.css'

interface MediaItem {
  id: string
  baseUrl: string
  mimeType: string
  filename: string
  creationTime: string
  albumId: string
  cachedAt: number
}

interface Album {
  id: string
  title: string
}

type TransitionEffect = 'none' | 'fade' | 'slide' | 'zoom'

// baseUrl 만료 시간 (50분)
const BASE_URL_TTL = 50 * 60 * 1000
// 이미지 미리 로드 개수
const PRELOAD_COUNT = 3
// 메모리에 유지할 최대 이미지 수
const MAX_CACHED_IMAGES = 10
// 미디어 로딩 타임아웃 (10초)
const LOAD_TIMEOUT = 10000

// 날짜 포맷 함수
const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    })
  } catch {
    return ''
  }
}

// 이미지 캐시 (메모리)
const slideshowImageCache = new Map<string, string>()

// 슬라이드 미디어 컴포넌트 (이미지/동영상 프록시를 통해 로드)
function SlideImage({ item, className, onVideoEnd, onLoadTimeout }: { item: MediaItem; className?: string; onVideoEnd?: () => void; onLoadTimeout?: () => void }) {
  const [mediaSrc, setMediaSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fitClass, setFitClass] = useState<string>(styles.imageFitWidth)
  const isVideo = item.mimeType?.startsWith('video/')

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null
    let isCancelled = false

    const loadMedia = async () => {
      setIsLoading(true)
      const cacheKey = `${item.id}-full`

      if (slideshowImageCache.has(cacheKey)) {
        setMediaSrc(slideshowImageCache.get(cacheKey)!)
        setIsLoading(false)
        return
      }

      // 10초 타임아웃 설정
      timeoutId = setTimeout(() => {
        if (!isCancelled && isLoading) {
          console.warn(`미디어 로딩 타임아웃 (10초 초과): ${item.filename}`)
          setIsLoading(false)
          onLoadTimeout?.()
        }
      }, LOAD_TIMEOUT)

      try {
        if (isVideo) {
          // 동영상: 로컬 파일로 다운로드
          const result = await window.electronAPI.photos.getVideo(item.baseUrl, item.id)
          if (isCancelled) return
          if (result.success && result.filePath) {
            // video-cache:// custom protocol 사용
            const encodedPath = encodeURIComponent(result.filePath)
            const videoUrl = `video-cache://${encodedPath}`
            console.log('Video URL:', videoUrl)
            slideshowImageCache.set(cacheKey, videoUrl)
            setMediaSrc(videoUrl)
          } else {
            console.error('Failed to get video:', result.error)
            onLoadTimeout?.()
          }
        } else {
          // 이미지: base64 data URL (디스크 캐싱 포함)
          const result = await window.electronAPI.photos.getImage(item.baseUrl, 'w1920-h1080', `slide-${item.id}`)
          if (isCancelled) return
          if (result.success && result.dataUrl) {
            slideshowImageCache.set(cacheKey, result.dataUrl)
            setMediaSrc(result.dataUrl)
          } else {
            onLoadTimeout?.()
          }
        }
      } catch (err) {
        console.error('Failed to load slideshow media:', err)
        if (!isCancelled) {
          onLoadTimeout?.()
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
          if (timeoutId) clearTimeout(timeoutId)
        }
      }
    }

    loadMedia()

    return () => {
      isCancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [item.id, item.baseUrl, isVideo, onLoadTimeout])

  // 미디어 로드 후 비율 계산
  const handleMediaLoad = (mediaWidth: number, mediaHeight: number) => {
    const containerWidth = window.innerWidth
    const containerHeight = window.innerHeight
    const containerRatio = containerWidth / containerHeight
    const mediaRatio = mediaWidth / mediaHeight

    // 컨테이너 비율 > 미디어 비율: 높이 100%, 너비 auto
    // 컨테이너 비율 < 미디어 비율: 너비 100%, 높이 auto
    if (containerRatio > mediaRatio) {
      setFitClass(styles.imageFitHeight)
    } else {
      setFitClass(styles.imageFitWidth)
    }
  }

  if (isLoading || !mediaSrc) {
    return <div className={styles.imageLoading}><div className={styles.spinner}></div></div>
  }

  if (isVideo) {
    return (
      <video
        src={mediaSrc}
        className={`${className} ${fitClass}`}
        autoPlay
        muted
        playsInline
        onEnded={onVideoEnd}
        onLoadedMetadata={(e) => {
          const video = e.currentTarget
          handleMediaLoad(video.videoWidth, video.videoHeight)
        }}
        onError={(e) => console.error('Video error:', e.currentTarget.error)}
      />
    )
  }

  return (
    <img
      src={mediaSrc}
      alt={item.filename}
      className={`${className} ${fitClass}`}
      onLoad={(e) => {
        const img = e.currentTarget
        handleMediaLoad(img.naturalWidth, img.naturalHeight)
      }}
    />
  )
}

function Slideshow() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [previousIndex, setPreviousIndex] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [showControls, setShowControls] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preloadedImagesRef = useRef<Set<string>>(new Set())
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())

  const navigate = useNavigate()
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const controlsTimerRef = useRef<NodeJS.Timeout | null>(null)
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null)
  const clockTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 설정 상태
  const [slideInterval, setSlideInterval] = useState(10000)
  const [transitionEffect, setTransitionEffect] = useState<TransitionEffect>('fade')
  const [windowMode, setWindowMode] = useState<'windowed' | 'fullscreen'>('windowed')
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  // 설정에서 슬라이드 간격, 전환 효과, 창 모드 가져오기
  useEffect(() => {
    const loadSettings = async () => {
      const result = await window.electronAPI.store.get('settings')
      if (result.success && result.value) {
        const parsed = result.value as { slideInterval?: number; transitionEffect?: TransitionEffect; windowMode?: 'windowed' | 'fullscreen' }
        setSlideInterval((parsed.slideInterval || 10) * 1000)
        setTransitionEffect((parsed.transitionEffect || 'fade') as TransitionEffect)
        setWindowMode((parsed.windowMode || 'windowed') as 'windowed' | 'fullscreen')
      }
      setSettingsLoaded(true)
    }
    loadSettings()
  }, [])

  // 시계 업데이트
  useEffect(() => {
    clockTimerRef.current = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => {
      if (clockTimerRef.current) clearInterval(clockTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!settingsLoaded) return

    loadMediaItems()
    // 슬라이드쇼 시작 상태 알림
    window.electronAPI.slideshow.setState(true)

    // 설정에 따라 창 모드 적용
    if (windowMode === 'fullscreen') {
      window.electronAPI.window.fullscreen(true).then(isFs => {
        setIsFullscreen(isFs)
      })
    }

    return () => {
      cleanup()
      // 슬라이드쇼 종료 상태 알림
      window.electronAPI.slideshow.setState(false)
    }
  }, [settingsLoaded, windowMode])

  // 슬라이드 전환 함수
  const transitionTo = useCallback((newIndex: number) => {
    if (isTransitioning || mediaItems.length === 0) return

    setIsTransitioning(true)
    setPreviousIndex(currentIndex)

    // 전환 효과에 따른 딜레이
    const transitionDuration = transitionEffect === 'none' ? 0 : 500

    setTimeout(() => {
      setCurrentIndex(newIndex)
      setTimeout(() => {
        setPreviousIndex(null)
        setIsTransitioning(false)
      }, transitionDuration)
    }, 50)
  }, [currentIndex, isTransitioning, transitionEffect, mediaItems.length])

  // 현재 미디어가 동영상인지 확인
  const currentMedia = mediaItems[currentIndex]
  const isCurrentVideo = currentMedia?.mimeType?.startsWith('video/')

  // 슬라이드쇼 자동 재생 (동영상이 아닌 경우에만 타이머 사용)
  useEffect(() => {
    if (isPlaying && mediaItems.length > 0 && !isTransitioning && !isCurrentVideo) {
      timerRef.current = setInterval(() => {
        transitionTo((currentIndex + 1) % mediaItems.length)
      }, slideInterval)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPlaying, mediaItems.length, slideInterval, currentIndex, isTransitioning, transitionTo, isCurrentVideo])

  // 동영상 종료 시 다음 슬라이드로 이동
  const handleVideoEnd = useCallback(() => {
    if (isPlaying && mediaItems.length > 0) {
      transitionTo((currentIndex + 1) % mediaItems.length)
    }
  }, [isPlaying, mediaItems.length, currentIndex, transitionTo])

  // 로딩 타임아웃 시 다음 슬라이드로 이동
  const handleLoadTimeout = useCallback(() => {
    if (mediaItems.length > 0) {
      transitionTo((currentIndex + 1) % mediaItems.length)
    }
  }, [mediaItems.length, currentIndex, transitionTo])

  // 키보드 이벤트
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          handleEscape()
          break
        case ' ':
          e.preventDefault()
          togglePlayPause()
          break
        case 'ArrowLeft':
          goToPrevious()
          break
        case 'ArrowRight':
          goToNext()
          break
        case 'f':
          toggleFullscreen()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mediaItems.length])

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    if (clockTimerRef.current) clearInterval(clockTimerRef.current)
    window.electronAPI.power.preventSleep(false)
  }

  const loadMediaItems = async () => {
    try {
      setIsLoading(true)

      // Picker API로 선택한 미디어 아이템 가져오기 (electron-store 사용)
      const mediaResult = await window.electronAPI.store.get('pickedMediaItems')
      if (!mediaResult.success || !mediaResult.value || !Array.isArray(mediaResult.value)) {
        navigate('/albums')
        return
      }

      const allMediaItems: MediaItem[] = mediaResult.value as MediaItem[]

      if (allMediaItems.length === 0) {
        setError('선택한 사진이 없습니다')
        return
      }

      // 설정에 따라 정렬
      const settingsResult = await window.electronAPI.store.get('settings')
      let sortedItems = [...allMediaItems]

      if (settingsResult.success && settingsResult.value) {
        const parsed = settingsResult.value as { photoOrder?: string }
        switch (parsed.photoOrder) {
          case 'latest':
            sortedItems.sort((a, b) =>
              new Date(b.creationTime).getTime() - new Date(a.creationTime).getTime()
            )
            break
          case 'oldest':
            sortedItems.sort((a, b) =>
              new Date(a.creationTime).getTime() - new Date(b.creationTime).getTime()
            )
            break
          case 'random':
            sortedItems = sortedItems.sort(() => Math.random() - 0.5)
            break
        }
      }

      setMediaItems(sortedItems)

      // 화면 절전 모드 방지
      await window.electronAPI.power.preventSleep(true)

      // baseUrl 자동 갱신 타이머 설정 (50분마다)
      refreshTimerRef.current = setInterval(() => {
        refreshBaseUrls(sortedItems)
      }, BASE_URL_TTL)

    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  // baseUrl 갱신
  const refreshBaseUrls = async (items: MediaItem[]) => {
    try {
      const ids = items.map(item => item.id)
      const result = await window.electronAPI.photos.refreshUrls(ids)

      if (result.success && result.urls) {
        setMediaItems(prev => prev.map(item => ({
          ...item,
          baseUrl: result.urls![item.id] || item.baseUrl,
          cachedAt: Date.now()
        })))
      }
    } catch (err) {
      console.error('Failed to refresh URLs:', err)
    }
  }

  // 이미지 미리 로드 (IPC 프록시를 통해 백그라운드 로드)
  const preloadNextImages = useCallback(() => {
    const preloaded = preloadedImagesRef.current

    // 다음 이미지들 미리 로드 (병렬 처리)
    for (let i = 1; i <= PRELOAD_COUNT; i++) {
      const nextIndex = (currentIndex + i) % mediaItems.length
      const nextItem = mediaItems[nextIndex]

      if (nextItem && !preloaded.has(nextItem.id)) {
        const isVideo = nextItem.mimeType?.startsWith('video/')
        preloaded.add(nextItem.id)

        // 백그라운드에서 IPC를 통해 미리 로드 (디스크 캐시에 저장됨)
        if (isVideo) {
          window.electronAPI.photos.getVideo(nextItem.baseUrl, nextItem.id)
            .catch(err => console.error('Video preload failed:', err))
        } else {
          window.electronAPI.photos.getImage(nextItem.baseUrl, 'w1920-h1080', `slide-${nextItem.id}`)
            .catch(err => console.error('Image preload failed:', err))
        }
      }
    }

    // 메모리 최적화: preloaded Set 크기 제한
    if (preloaded.size > MAX_CACHED_IMAGES) {
      const idsToKeep = new Set<string>()

      // 현재 이미지와 앞뒤 이미지들은 유지
      for (let i = -2; i <= PRELOAD_COUNT; i++) {
        const idx = (currentIndex + i + mediaItems.length) % mediaItems.length
        if (mediaItems[idx]) {
          idsToKeep.add(mediaItems[idx].id)
        }
      }

      // 유지할 이미지만 남기고 나머지 제거
      preloaded.forEach(id => {
        if (!idsToKeep.has(id)) {
          preloaded.delete(id)
        }
      })
    }
  }, [currentIndex, mediaItems])

  // 이미지 미리 로드
  useEffect(() => {
    if (mediaItems.length > 0) {
      preloadNextImages()
    }
  }, [currentIndex, mediaItems, preloadNextImages])

  const togglePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev)
    showControlsTemporarily()
  }, [])

  const goToNext = useCallback(() => {
    transitionTo((currentIndex + 1) % mediaItems.length)
    showControlsTemporarily()
  }, [currentIndex, mediaItems.length, transitionTo])

  const goToPrevious = useCallback(() => {
    transitionTo((currentIndex - 1 + mediaItems.length) % mediaItems.length)
    showControlsTemporarily()
  }, [currentIndex, mediaItems.length, transitionTo])

  const toggleFullscreen = async () => {
    const isFs = await window.electronAPI.window.fullscreen()
    setIsFullscreen(isFs)
    showControlsTemporarily()
  }

  // ESC 키: 슬라이드쇼 중지 + 창모드로 변경
  const handleEscape = async () => {
    setIsPlaying(false)
    // 항상 창모드로 전환
    await window.electronAPI.window.fullscreen(false)
    setIsFullscreen(false)
    showControlsTemporarily()
    // 버튼 포커스 제거
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }

  // X 버튼: 슬라이드쇼 완전 종료
  const handleExit = async () => {
    cleanup()
    if (isFullscreen) {
      await window.electronAPI.window.fullscreen(false)
    }
    navigate('/albums')
  }

  const showControlsTemporarily = () => {
    setShowControls(true)
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current)
    }
    controlsTimerRef.current = setTimeout(() => {
      setShowControls(false)
    }, 3000)
  }

  const handleMouseMove = () => {
    showControlsTemporarily()
  }

  const handleClick = () => {
    setShowControls((prev) => !prev)
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>사진을 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={() => navigate('/albums')}>앨범으로 돌아가기</button>
        </div>
      </div>
    )
  }

  const previousMedia = previousIndex !== null ? mediaItems[previousIndex] : null

  // 전환 효과 클래스 결정
  const getTransitionClass = (isCurrent: boolean) => {
    if (transitionEffect === 'none') return ''
    if (isCurrent) {
      return styles[`${transitionEffect}Enter`] || ''
    }
    return styles[`${transitionEffect}Exit`] || ''
  }

  return (
    <div
      className={styles.container}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
    >
      {/* 이전 이미지 (전환 효과용) */}
      {previousMedia && transitionEffect !== 'none' && (
        <div className={`${styles.imageWrapper} ${styles.previous} ${getTransitionClass(false)}`}>
          <SlideImage item={previousMedia} className={styles.image} />
        </div>
      )}

      {/* 현재 이미지 */}
      {currentMedia && (
        <div className={`${styles.imageWrapper} ${getTransitionClass(true)}`} key={currentMedia.id}>
          <SlideImage item={currentMedia} className={styles.image} onVideoEnd={handleVideoEnd} onLoadTimeout={handleLoadTimeout} />
        </div>
      )}

      {/* 시계 - 오른쪽 상단 */}
      <div className={styles.clockOverlay}>
        <span>{currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
      </div>

      {/* 날짜 - 항상 표시 */}
      {currentMedia?.creationTime && (
        <div className={styles.dateOverlay}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
          </svg>
          <span>{formatDate(currentMedia.creationTime)}</span>
        </div>
      )}

      <div
        className={`${styles.controls} ${showControls ? styles.visible : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.progress}>
          <span>{currentIndex + 1} / {mediaItems.length}</span>
        </div>

        <div className={styles.buttons}>
          <button onClick={(e) => { e.stopPropagation(); goToPrevious(); }} title="이전 (←)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>

          <button onClick={(e) => { e.stopPropagation(); togglePlayPause(); }} title="재생/일시정지 (Space)">
            {isPlaying ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button onClick={(e) => { e.stopPropagation(); goToNext(); }} title="다음 (→)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </button>

          <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} title="전체화면 (F)">
            {isFullscreen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
              </svg>
            )}
          </button>

          <button onClick={(e) => { e.stopPropagation(); handleExit(); }} title="종료 (ESC)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Slideshow
