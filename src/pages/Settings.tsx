import { useState, useEffect, useRef, useCallback } from 'react'
import styles from '../styles/Settings.module.css'

interface Settings {
  slideInterval: number
  windowMode: 'windowed' | 'fullscreen'
  photoOrder: 'latest' | 'oldest' | 'random'
  shuffleAlbums: boolean
  transitionEffect: 'none' | 'fade' | 'slide' | 'zoom'
  launchAtLogin: boolean
  schedule: {
    enabled: boolean
    timeGrid: boolean[][]
  }
}

interface CacheStats {
  itemCount: number
  diskSize: number
}

const defaultSettings: Settings = {
  slideInterval: 10,
  windowMode: 'windowed',
  photoOrder: 'random',
  shuffleAlbums: true,
  transitionEffect: 'fade',
  launchAtLogin: false,
  schedule: {
    enabled: false,
    timeGrid: Array(7)
      .fill(null)
      .map(() => Array(24).fill(false))
  }
}

const DAYS = ['월', '화', '수', '목', '금', '토', '일']

function Settings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [isSaved, setIsSaved] = useState(false)
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [isClearing, setIsClearing] = useState(false)

  // 드래그 선택 관련 상태
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ day: number; hour: number } | null>(null)
  const [dragValue, setDragValue] = useState<boolean>(true)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 저장된 설정 불러오기 (electron-store 사용)
    const loadSettings = async () => {
      const result = await window.electronAPI.store.get('settings')
      if (result.success && result.value) {
        setSettings(result.value as Settings)
      }
    }
    loadSettings()
    // 캐시 통계 불러오기
    loadCacheStats()
    // 시스템의 실제 자동 실행 상태 동기화
    syncLaunchAtLogin()
  }, [])

  const syncLaunchAtLogin = async () => {
    const systemSetting = await window.electronAPI.app.getLaunchAtLogin()
    if (systemSetting !== settings.launchAtLogin) {
      const result = await window.electronAPI.store.get('settings')
      if (result.success && result.value) {
        const parsedSettings = result.value as Settings
        parsedSettings.launchAtLogin = systemSetting
        setSettings(parsedSettings)
        await window.electronAPI.store.set('settings', parsedSettings)
      }
    }
  }

  const loadCacheStats = async () => {
    const result = await window.electronAPI.photos.getCacheStats()
    if (result.success && result.stats) {
      setCacheStats(result.stats)
    }
  }

  const handleClearCache = async () => {
    setIsClearing(true)
    await window.electronAPI.photos.clearCache()
    await loadCacheStats()
    setIsClearing(false)
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  }

  const saveSettings = async (newSettings: Settings) => {
    setSettings(newSettings)
    await window.electronAPI.store.set('settings', newSettings)
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  const handleSlideIntervalChange = (value: number) => {
    saveSettings({ ...settings, slideInterval: value })
  }

  const handleWindowModeChange = (mode: 'windowed' | 'fullscreen') => {
    saveSettings({ ...settings, windowMode: mode })
  }

  const handlePhotoOrderChange = (order: 'latest' | 'oldest' | 'random') => {
    saveSettings({ ...settings, photoOrder: order })
  }

  const handleTransitionEffectChange = (
    effect: 'none' | 'fade' | 'slide' | 'zoom'
  ) => {
    saveSettings({ ...settings, transitionEffect: effect })
  }

  const handleShuffleAlbumsChange = (shuffle: boolean) => {
    saveSettings({ ...settings, shuffleAlbums: shuffle })
  }

  const handleLaunchAtLoginChange = async (enable: boolean) => {
    // 시스템 설정 변경
    const result = await window.electronAPI.app.setLaunchAtLogin(enable)
    // 로컬 설정 저장
    saveSettings({ ...settings, launchAtLogin: result })
  }

  const handleScheduleToggle = () => {
    saveSettings({
      ...settings,
      schedule: { ...settings.schedule, enabled: !settings.schedule.enabled }
    })
  }

  // 드래그 시작
  const handleCellMouseDown = (day: number, hour: number) => {
    setIsDragging(true)
    setDragStart({ day, hour })
    setDragValue(!settings.schedule.timeGrid[day][hour])

    const newGrid = settings.schedule.timeGrid.map((row, d) =>
      row.map((cell, h) => (d === day && h === hour ? !cell : cell))
    )
    setSettings({
      ...settings,
      schedule: { ...settings.schedule, timeGrid: newGrid }
    })
  }

  // 드래그 중
  const handleCellMouseEnter = (day: number, hour: number) => {
    if (!isDragging || !dragStart) return

    const minDay = Math.min(dragStart.day, day)
    const maxDay = Math.max(dragStart.day, day)
    const minHour = Math.min(dragStart.hour, hour)
    const maxHour = Math.max(dragStart.hour, hour)

    const newGrid = settings.schedule.timeGrid.map((row, d) =>
      row.map((cell, h) => {
        if (d >= minDay && d <= maxDay && h >= minHour && h <= maxHour) {
          return dragValue
        }
        return cell
      })
    )
    setSettings({
      ...settings,
      schedule: { ...settings.schedule, timeGrid: newGrid }
    })
  }

  // 드래그 종료
  const handleMouseUp = useCallback(async () => {
    if (isDragging) {
      setIsDragging(false)
      setDragStart(null)
      await window.electronAPI.store.set('settings', settings)
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
    }
  }, [isDragging, settings])

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  const handleDayToggle = (day: number) => {
    const allSelected = settings.schedule.timeGrid[day].every((cell) => cell)
    const newGrid = settings.schedule.timeGrid.map((row, d) =>
      d === day ? row.map(() => !allSelected) : row
    )
    saveSettings({
      ...settings,
      schedule: { ...settings.schedule, timeGrid: newGrid }
    })
  }

  const handleHourToggle = (hour: number) => {
    const allSelected = settings.schedule.timeGrid.every((row) => row[hour])
    const newGrid = settings.schedule.timeGrid.map((row) =>
      row.map((cell, h) => (h === hour ? !allSelected : cell))
    )
    saveSettings({
      ...settings,
      schedule: { ...settings.schedule, timeGrid: newGrid }
    })
  }

  const applyPreset = (preset: 'all' | 'none' | 'weekdays' | 'weekends') => {
    let newGrid: boolean[][]
    switch (preset) {
      case 'all':
        newGrid = Array(7)
          .fill(null)
          .map(() => Array(24).fill(true))
        break
      case 'none':
        newGrid = Array(7)
          .fill(null)
          .map(() => Array(24).fill(false))
        break
      case 'weekdays':
        newGrid = Array(7)
          .fill(null)
          .map((_, d) =>
            Array(24)
              .fill(false)
              .map((_, h) => d < 5 && h >= 6 && h <= 22)
          )
        break
      case 'weekends':
        newGrid = Array(7)
          .fill(null)
          .map((_, d) => Array(24).fill(d >= 5))
        break
    }
    saveSettings({
      ...settings,
      schedule: { ...settings.schedule, timeGrid: newGrid }
    })
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>설정</h1>
        {isSaved && <span className={styles.savedBadge}>저장됨</span>}
      </header>

      <div className={styles.sections}>
        {/* 슬라이드 간격 */}
        <section className={styles.section}>
          <h2>슬라이드 간격</h2>
          <div className={styles.sliderContainer}>
            <input
              type="range"
              min="5"
              max="60"
              value={settings.slideInterval}
              onChange={(e) =>
                handleSlideIntervalChange(parseInt(e.target.value))
              }
              className={styles.slider}
            />
            <span className={styles.sliderValue}>{settings.slideInterval}초</span>
          </div>
        </section>

        {/* 창 모드 */}
        <section className={styles.section}>
          <h2>창 모드</h2>
          <div className={styles.radioGroup}>
            <label>
              <input
                type="radio"
                name="windowMode"
                checked={settings.windowMode === 'windowed'}
                onChange={() => handleWindowModeChange('windowed')}
              />
              <span>창 모드</span>
            </label>
            <label>
              <input
                type="radio"
                name="windowMode"
                checked={settings.windowMode === 'fullscreen'}
                onChange={() => handleWindowModeChange('fullscreen')}
              />
              <span>전체 화면</span>
            </label>
          </div>
        </section>

        {/* 사진 순서 */}
        <section className={styles.section}>
          <h2>사진 순서</h2>
          <div className={styles.radioGroup}>
            <label>
              <input
                type="radio"
                name="photoOrder"
                checked={settings.photoOrder === 'latest'}
                onChange={() => handlePhotoOrderChange('latest')}
              />
              <span>최신순</span>
            </label>
            <label>
              <input
                type="radio"
                name="photoOrder"
                checked={settings.photoOrder === 'oldest'}
                onChange={() => handlePhotoOrderChange('oldest')}
              />
              <span>오래된순</span>
            </label>
            <label>
              <input
                type="radio"
                name="photoOrder"
                checked={settings.photoOrder === 'random'}
                onChange={() => handlePhotoOrderChange('random')}
              />
              <span>랜덤</span>
            </label>
          </div>
        </section>

        {/* 전환 효과 */}
        <section className={styles.section}>
          <h2>전환 효과</h2>
          <div className={styles.radioGroup}>
            <label>
              <input
                type="radio"
                name="transition"
                checked={settings.transitionEffect === 'none'}
                onChange={() => handleTransitionEffectChange('none')}
              />
              <span>없음</span>
            </label>
            <label>
              <input
                type="radio"
                name="transition"
                checked={settings.transitionEffect === 'fade'}
                onChange={() => handleTransitionEffectChange('fade')}
              />
              <span>페이드</span>
            </label>
            <label>
              <input
                type="radio"
                name="transition"
                checked={settings.transitionEffect === 'slide'}
                onChange={() => handleTransitionEffectChange('slide')}
              />
              <span>슬라이드</span>
            </label>
            <label>
              <input
                type="radio"
                name="transition"
                checked={settings.transitionEffect === 'zoom'}
                onChange={() => handleTransitionEffectChange('zoom')}
              />
              <span>줌</span>
            </label>
          </div>
        </section>

        {/* 앨범 섞기 */}
        <section className={styles.section}>
          <h2>앨범 섞기</h2>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.shuffleAlbums}
              onChange={(e) => handleShuffleAlbumsChange(e.target.checked)}
            />
            <span className={styles.toggleSlider}></span>
            <span>여러 앨범 사진 섞어서 재생</span>
          </label>
        </section>

        {/* 시작 시 자동 실행 */}
        <section className={styles.section}>
          <h2>시작 시 자동 실행</h2>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.launchAtLogin}
              onChange={(e) => handleLaunchAtLoginChange(e.target.checked)}
            />
            <span className={styles.toggleSlider}></span>
            <span>macOS 로그인 시 앱 자동 실행</span>
          </label>
        </section>

        {/* 스케줄 설정 */}
        <section className={styles.section}>
          <h2>스케줄 설정</h2>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.schedule.enabled}
              onChange={handleScheduleToggle}
            />
            <span className={styles.toggleSlider}></span>
            <span>스케줄 사용</span>
          </label>

          {settings.schedule.enabled && (
            <div className={styles.scheduleContainer}>
              <p className={styles.scheduleHint}>
                셀을 드래그하여 여러 시간대를 한 번에 선택할 수 있습니다
              </p>
              <div className={styles.presets}>
                <button onClick={() => applyPreset('all')}>전체 선택</button>
                <button onClick={() => applyPreset('none')}>전체 해제</button>
                <button onClick={() => applyPreset('weekdays')}>평일만</button>
                <button onClick={() => applyPreset('weekends')}>주말만</button>
              </div>

              <div className={styles.scheduleGrid} ref={gridRef}>
                <div className={styles.hourLabels}>
                  <div className={styles.corner}></div>
                  {Array.from({ length: 24 }, (_, h) => (
                    <div
                      key={h}
                      className={styles.hourLabel}
                      onClick={() => handleHourToggle(h)}
                    >
                      {h}
                    </div>
                  ))}
                </div>
                {DAYS.map((day, d) => (
                  <div key={d} className={styles.row}>
                    <div
                      className={styles.dayLabel}
                      onClick={() => handleDayToggle(d)}
                    >
                      {day}
                    </div>
                    {settings.schedule.timeGrid[d].map((active, h) => (
                      <div
                        key={h}
                        className={`${styles.cell} ${active ? styles.active : ''}`}
                        onMouseDown={() => handleCellMouseDown(d, h)}
                        onMouseEnter={() => handleCellMouseEnter(d, h)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 캐시 관리 */}
        <section className={styles.section}>
          <h2>캐시 관리</h2>
          <div className={styles.cacheInfo}>
            {cacheStats ? (
              <>
                <div className={styles.cacheStats}>
                  <div className={styles.cacheStat}>
                    <span className={styles.cacheLabel}>캐시된 항목</span>
                    <span className={styles.cacheValue}>{cacheStats.itemCount}개</span>
                  </div>
                  <div className={styles.cacheStat}>
                    <span className={styles.cacheLabel}>디스크 사용량</span>
                    <span className={styles.cacheValue}>{formatBytes(cacheStats.diskSize)}</span>
                  </div>
                </div>
                <button
                  className={styles.clearCacheButton}
                  onClick={handleClearCache}
                  disabled={isClearing || cacheStats.itemCount === 0}
                >
                  {isClearing ? '삭제 중...' : '캐시 삭제'}
                </button>
              </>
            ) : (
              <p className={styles.cacheLoading}>캐시 정보 로딩 중...</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default Settings
