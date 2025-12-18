import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Splash from './components/Splash'
import Login from './components/Login'
import Layout from './components/Layout'
import AlbumList from './pages/AlbumList'
import Slideshow from './pages/Slideshow'
import Settings from './pages/Settings'

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const navigate = useNavigate()
  const scheduleListenerRef = useRef(false)

  useEffect(() => {
    checkAuth()
  }, [])

  // 전역 ESC 키 처리 (전체화면 -> 창모드)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 전체화면이면 창모드로 전환
        await window.electronAPI.window.fullscreen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 이벤트 리스너 등록
  useEffect(() => {
    if (!isAuthenticated || scheduleListenerRef.current) return

    scheduleListenerRef.current = true

    // 스케줄 이벤트 리스너
    window.electronAPI.on.scheduleStateChanged(async (shouldPlay) => {
      console.log('Schedule state changed:', shouldPlay)
      if (shouldPlay) {
        const result = await window.electronAPI.store.get('pickedMediaItems')
        if (result.success && result.value && Array.isArray(result.value) && result.value.length > 0) {
          if (!window.location.pathname.includes('slideshow')) {
            navigate('/slideshow')
          }
        }
      } else {
        // 스케줄 시간이 아니면 슬라이드쇼 중지
        if (window.location.pathname.includes('slideshow')) {
          // 전체화면이면 창모드로 전환
          await window.electronAPI.window.fullscreen(false)
          navigate('/albums')
        }
      }
    })

    // 트레이에서 슬라이드쇼 시작 이벤트
    window.electronAPI.on.slideshowStart(async () => {
      const result = await window.electronAPI.store.get('pickedMediaItems')
      if (result.success && result.value && Array.isArray(result.value) && result.value.length > 0) {
        if (!window.location.pathname.includes('slideshow')) {
          navigate('/slideshow')
        }
      }
    })

    // 트레이에서 슬라이드쇼 중지 이벤트
    window.electronAPI.on.slideshowStop(() => {
      if (window.location.pathname.includes('slideshow')) {
        navigate('/albums')
      }
    })
  }, [isAuthenticated, navigate])

  const checkAuth = async () => {
    try {
      const result = await window.electronAPI.auth.check()
      if (result.success && result.isAuthenticated) {
        setIsAuthenticated(true)
      }
    } catch (error) {
      console.error('Auth check failed:', error)
    } finally {
      // 스플래시 화면 최소 표시 시간
      setTimeout(() => {
        setIsLoading(false)
      }, 1500)
    }
  }

  const handleLogin = async () => {
    try {
      const result = await window.electronAPI.auth.login()
      if (result.success) {
        setIsAuthenticated(true)
        navigate('/albums')
      }
    } catch (error) {
      console.error('Login failed:', error)
    }
  }

  const handleLogout = async () => {
    try {
      await window.electronAPI.auth.logout()
      setIsAuthenticated(false)
      navigate('/login')
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  if (isLoading) {
    return <Splash />
  }

  return (
    <ErrorBoundary>
      <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/albums" replace />
          ) : (
            <Login onLogin={handleLogin} />
          )
        }
      />
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Layout onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route index element={<Navigate to="/albums" replace />} />
        <Route path="albums" element={<AlbumList />} />
        <Route path="slideshow" element={<Slideshow />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default App
