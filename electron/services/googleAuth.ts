import { BrowserWindow, safeStorage } from 'electron'
import Store from 'electron-store'

// 설정 저장소
const store = new Store({
  name: 'photoslide-auth',
  encryptionKey: 'photoslide-secure-key'
})

// Google OAuth 설정 - 함수로 변경하여 런타임에 환경 변수 읽기
const getClientId = () => process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID'
const getClientSecret = () => process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET'
const REDIRECT_URI = 'http://localhost:8080/oauth/callback'

const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
]

interface Tokens {
  access_token: string
  refresh_token: string
  expiry_date: number
}

export class GoogleAuthService {
  private tokens: Tokens | null = null

  constructor() {
    this.loadTokens()
  }

  private loadTokens(): void {
    try {
      const encryptedTokens = store.get('tokens') as string | undefined
      if (encryptedTokens && safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(Buffer.from(encryptedTokens, 'base64'))
        this.tokens = JSON.parse(decrypted) as Tokens
      } else if (encryptedTokens) {
        // 개발 환경에서는 평문으로 저장된 경우
        try {
          this.tokens = JSON.parse(encryptedTokens) as Tokens
        } catch {
          // 암호화된 데이터를 평문으로 파싱 시도 실패
        }
      }
    } catch (error) {
      console.error('Failed to load tokens:', error)
    }
  }

  private saveTokens(tokens: Tokens): void {
    try {
      this.tokens = tokens
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(JSON.stringify(tokens))
        store.set('tokens', encrypted.toString('base64'))
      } else {
        // 암호화가 불가능한 경우 평문으로 저장 (개발 환경)
        store.set('tokens', JSON.stringify(tokens))
      }
    } catch (error) {
      console.error('Failed to save tokens:', error)
    }
  }

  private clearTokens(): void {
    this.tokens = null
    store.delete('tokens')
  }

  private generateAuthUrl(): string {
    console.log('=== OAuth Debug ===')
    console.log('GOOGLE_CLIENT_ID:', getClientId())
    console.log('GOOGLE_CLIENT_SECRET:', getClientSecret() ? '설정됨' : '없음')
    console.log('===================')

    const params = new URLSearchParams({
      client_id: getClientId(),
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent'
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  async login(): Promise<Tokens> {
    return new Promise((resolve, reject) => {
      const authUrl = this.generateAuthUrl()

      const authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      authWindow.loadURL(authUrl)

      const handleNavigation = async (url: string) => {
        if (url.startsWith(REDIRECT_URI)) {
          const urlObj = new URL(url)
          const code = urlObj.searchParams.get('code')
          const error = urlObj.searchParams.get('error')

          if (error) {
            authWindow.close()
            reject(new Error(`OAuth error: ${error}`))
            return
          }

          if (code) {
            try {
              const tokens = await this.exchangeCodeForTokens(code)
              authWindow.close()
              resolve(tokens)
            } catch (err) {
              authWindow.close()
              reject(err)
            }
          }
        }
      }

      authWindow.webContents.on('will-navigate', (_, url) => {
        handleNavigation(url)
      })

      authWindow.webContents.on('will-redirect', (_, url) => {
        handleNavigation(url)
      })

      authWindow.on('closed', () => {
        reject(new Error('Authentication window was closed'))
      })
    })
  }

  private async exchangeCodeForTokens(code: string): Promise<Tokens> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code,
        client_id: getClientId(),
        client_secret: getClientSecret(),
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token exchange failed: ${error}`)
    }

    const data = await response.json()

    console.log('=== Token Exchange Response ===')
    console.log('scope:', data.scope)
    console.log('token_type:', data.token_type)
    console.log('expires_in:', data.expires_in)
    console.log('===============================')

    const tokens: Tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      expiry_date: Date.now() + (data.expires_in * 1000)
    }

    this.saveTokens(tokens)
    return tokens
  }

  private async refreshAccessToken(): Promise<Tokens> {
    if (!this.tokens?.refresh_token) {
      throw new Error('No refresh token available')
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        refresh_token: this.tokens.refresh_token,
        client_id: getClientId(),
        client_secret: getClientSecret(),
        grant_type: 'refresh_token'
      })
    })

    if (!response.ok) {
      throw new Error('Token refresh failed')
    }

    const data = await response.json()

    const tokens: Tokens = {
      access_token: data.access_token,
      refresh_token: this.tokens.refresh_token,
      expiry_date: Date.now() + (data.expires_in * 1000)
    }

    this.saveTokens(tokens)
    return tokens
  }

  async logout(): Promise<void> {
    if (this.tokens?.access_token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${this.tokens.access_token}`, {
          method: 'POST'
        })
      } catch (error) {
        console.error('Failed to revoke token:', error)
      }
    }
    this.clearTokens()
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.tokens?.access_token) {
      return false
    }

    // 토큰 만료 확인
    if (this.tokens.expiry_date && this.tokens.expiry_date < Date.now()) {
      if (this.tokens.refresh_token) {
        try {
          await this.refreshAccessToken()
          return true
        } catch {
          return false
        }
      }
      return false
    }

    return true
  }

  async getAccessToken(): Promise<string | null> {
    const isAuth = await this.isAuthenticated()
    if (!isAuth) {
      return null
    }
    return this.tokens?.access_token || null
  }
}
