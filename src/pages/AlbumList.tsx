import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from '../styles/AlbumList.module.css'

interface MediaItem {
  id: string
  baseUrl: string
  mimeType: string
  filename: string
}

// 개별 사진 카드 컴포넌트 (프록시를 통해 이미지 로드 - 디스크 캐싱)
function PhotoCard({ item, onDelete }: { item: MediaItem; onDelete?: () => void }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const retryCountRef = useRef(0)

  const loadImage = useCallback(async () => {
    setIsLoading(true)
    setHasError(false)

    try {
      // imageId를 전달하여 디스크 캐싱 활용
      const result = await window.electronAPI.photos.getImage(item.baseUrl, 'w200-h200-c', `thumb-${item.id}`)
      if (result.success && result.dataUrl) {
        setImageSrc(result.dataUrl)
        retryCountRef.current = 0
      } else {
        setHasError(true)
      }
    } catch (err) {
      console.error('Failed to load image:', err)
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }, [item.id, item.baseUrl])

  useEffect(() => {
    loadImage()
  }, [loadImage])

  // 앱 포커스 시 에러 상태면 재시도
  useEffect(() => {
    const handleFocus = () => {
      if (hasError && retryCountRef.current < 3) {
        retryCountRef.current++
        loadImage()
      }
    }

    window.electronAPI.on.appFocus(handleFocus)
  }, [hasError, loadImage])

  const handleRetry = () => {
    if (retryCountRef.current < 3) {
      retryCountRef.current++
      loadImage()
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete?.()
  }

  return (
    <div className={styles.photoCard}>
      {isLoading ? (
        <div className={styles.photoLoading}>
          <div className={styles.photoSpinner}></div>
        </div>
      ) : imageSrc ? (
        <>
          <img src={imageSrc} alt={item.filename} />
          {onDelete && (
            <button className={styles.deleteButton} onClick={handleDelete} title="삭제">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          )}
        </>
      ) : (
        <div className={styles.photoError} onClick={handleRetry} title="클릭하여 다시 시도">
          <span>!</span>
        </div>
      )}
    </div>
  )
}

function AlbumList() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isPicking, setIsPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const navigate = useNavigate()

  // 저장된 미디어 아이템 로드 (electron-store 사용)
  useEffect(() => {
    const loadMediaItems = async () => {
      const result = await window.electronAPI.store.get('pickedMediaItems')
      if (result.success && result.value && Array.isArray(result.value)) {
        setMediaItems(result.value as MediaItem[])
      }
    }
    loadMediaItems()
  }, [])

  // 세션 상태 폴링
  useEffect(() => {
    if (!sessionId || !isPicking) return

    const pollSession = async () => {
      try {
        const result = await window.electronAPI.photos.getSessionStatus(sessionId)
        if (result.success && result.mediaItemsSet) {
          // 선택 완료
          setIsPicking(false)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
          }
          await fetchPickedMedia(sessionId)
        }
      } catch (err) {
        console.error('Poll error:', err)
      }
    }

    pollIntervalRef.current = setInterval(pollSession, 2000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [sessionId, isPicking])

  const handlePickPhotos = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const result = await window.electronAPI.photos.createPickerSession()

      if (!result.success || !result.sessionId) {
        throw new Error(result.error || '세션 생성에 실패했습니다')
      }

      setSessionId(result.sessionId)
      setIsPicking(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchPickedMedia = async (sid: string) => {
    try {
      setIsLoading(true)
      const result = await window.electronAPI.photos.getPickedMedia(sid)

      if (!result.success || !result.mediaItems) {
        throw new Error(result.error || '사진을 불러오는데 실패했습니다')
      }

      // 기존 항목에 새 항목 추가 (중복 제거)
      const newItems = result.mediaItems
      const existingIds = new Set(mediaItems.map(item => item.id))
      const uniqueNewItems = newItems.filter(item => !existingIds.has(item.id))
      const mergedItems = [...mediaItems, ...uniqueNewItems]

      setMediaItems(mergedItems)
      await window.electronAPI.store.set('pickedMediaItems', mergedItems)
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  // 개별 항목 삭제
  const handleDeleteItem = async (itemId: string) => {
    const updatedItems = mediaItems.filter(item => item.id !== itemId)
    setMediaItems(updatedItems)
    if (updatedItems.length > 0) {
      await window.electronAPI.store.set('pickedMediaItems', updatedItems)
    } else {
      await window.electronAPI.store.delete('pickedMediaItems')
    }
  }

  const handleStartSlideshow = async () => {
    if (mediaItems.length === 0) {
      return
    }
    await window.electronAPI.store.set('pickedMediaItems', mediaItems)
    navigate('/slideshow')
  }

  const handleClearSelection = async () => {
    setMediaItems([])
    await window.electronAPI.store.delete('pickedMediaItems')
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Google Photos</h1>
          <p>슬라이드쇼에서 재생할 사진을 선택하세요</p>
        </div>
      </header>

      {/* 사진 선택 버튼 */}
      <div className={styles.pickerSection}>
        <button
          className={styles.pickerButton}
          onClick={handlePickPhotos}
          disabled={isLoading || isPicking}
        >
          {isLoading ? (
            <>
              <div className={styles.buttonSpinner}></div>
              로딩 중...
            </>
          ) : isPicking ? (
            <>
              <div className={styles.buttonSpinner}></div>
              Google Photos에서 선택 중...
            </>
          ) : (
            <>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 7v2.99s-1.99.01-2 0V7h-3s.01-1.99 0-2h3V2h2v3h3v2h-3zm-3 4V8h-3V5H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8h-3zM5 19l3-4 2 3 3-4 4 5H5z"/>
              </svg>
              {mediaItems.length > 0 ? 'Google Photos에서 사진 추가' : 'Google Photos에서 사진 선택'}
            </>
          )}
        </button>

        {isPicking && (
          <p className={styles.pickingHint}>
            브라우저에서 Google Photos가 열렸습니다. 사진을 선택한 후 "완료"를 클릭하세요.
          </p>
        )}
      </div>

      {error && (
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={() => setError(null)}>닫기</button>
        </div>
      )}

      {/* 선택된 사진 미리보기 */}
      {mediaItems.length > 0 && (
        <>
          <div className={styles.toolbar}>
            <span className={styles.count}>{mediaItems.length}장의 사진 선택됨</span>
            <button className={styles.clearButton} onClick={handleClearSelection}>
              선택 초기화
            </button>
          </div>

          <div className={styles.grid}>
            {mediaItems.map((item) => (
              <PhotoCard
                key={item.id}
                item={item}
                onDelete={() => handleDeleteItem(item.id)}
              />
            ))}
          </div>
        </>
      )}

      {mediaItems.length === 0 && !isPicking && (
        <div className={styles.empty}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
            <path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/>
          </svg>
          <p>선택된 사진이 없습니다</p>
          <p className={styles.hint}>위의 버튼을 클릭해서 Google Photos에서 사진을 선택하세요</p>
        </div>
      )}
    </div>
  )
}

export default AlbumList
