import { useState } from 'react'
import styles from '../styles/Login.module.css'

interface LoginProps {
  onLogin: () => Promise<void>
}

function Login({ onLogin }: LoginProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await onLogin()
    } catch (err) {
      setError('로그인에 실패했습니다. 다시 시도해주세요.')
      console.error('Login error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <svg
            width="64"
            height="64"
            viewBox="0 0 80 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="80" height="80" rx="16" fill="url(#gradient)" />
            <path
              d="M20 25C20 22.2386 22.2386 20 25 20H55C57.7614 20 60 22.2386 60 25V55C60 57.7614 57.7614 60 55 60H25C22.2386 60 20 57.7614 20 55V25Z"
              fill="white"
              fillOpacity="0.9"
            />
            <circle cx="32" cy="32" r="5" fill="#4285F4" />
            <path
              d="M25 55L35 42L42 50L52 38L55 55H25Z"
              fill="#34A853"
              fillOpacity="0.8"
            />
            <defs>
              <linearGradient
                id="gradient"
                x1="0"
                y1="0"
                x2="80"
                y2="80"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#4285F4" />
                <stop offset="0.5" stopColor="#34A853" />
                <stop offset="1" stopColor="#FBBC05" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <h1 className={styles.title}>PhotoSlide</h1>
        <p className={styles.description}>
          Google Photos 앨범을 슬라이드쇼로 즐기세요
        </p>

        {error && <div className={styles.error}>{error}</div>}

        <button
          className={styles.googleButton}
          onClick={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <span className={styles.loading}>로그인 중...</span>
          ) : (
            <>
              <svg
                className={styles.googleIcon}
                width="20"
                height="20"
                viewBox="0 0 24 24"
              >
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Google 계정으로 로그인
            </>
          )}
        </button>

        <p className={styles.terms}>
          로그인하면 Google Photos 앨범에 대한<br />
          읽기 권한을 허용하게 됩니다.
        </p>
      </div>
    </div>
  )
}

export default Login
