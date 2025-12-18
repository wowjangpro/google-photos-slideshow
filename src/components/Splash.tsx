import styles from '../styles/Splash.module.css'

function Splash() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.logo}>
          <svg
            width="80"
            height="80"
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
        <p className={styles.subtitle}>Google Photos Slideshow</p>
        <div className={styles.loader}>
          <div className={styles.spinner}></div>
        </div>
      </div>
    </div>
  )
}

export default Splash
