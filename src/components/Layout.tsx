import { Outlet, NavLink, useLocation } from 'react-router-dom'
import styles from '../styles/Layout.module.css'

interface LayoutProps {
  onLogout: () => Promise<void>
}

function Layout({ onLogout }: LayoutProps) {
  const location = useLocation()
  const isSlideshow = location.pathname === '/slideshow'

  // 슬라이드쇼에서는 사이드바 없이 전체 화면 사용
  if (isSlideshow) {
    return <Outlet />
  }

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <svg
            width="32"
            height="32"
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
          <span className={styles.logoText}>PhotoSlide</span>
        </div>

        <nav className={styles.nav}>
          <NavLink
            to="/albums"
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z" />
            </svg>
            <span>앨범</span>
          </NavLink>

          <NavLink
            to="/slideshow"
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>슬라이드쇼</span>
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
            <span>설정</span>
          </NavLink>
        </nav>

        <div className={styles.bottom}>
          <button className={styles.logoutButton} onClick={onLogout}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
            </svg>
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
