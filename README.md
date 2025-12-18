# PhotoSlide

Google Photos 앨범을 디지털 액자처럼 자동 재생하는 macOS용 슬라이드쇼 앱입니다.

## 주요 기능

- **Google Photos 연동**: Google Photos Picker API를 통해 사진/동영상 선택
- **슬라이드쇼 재생**: 선택한 미디어를 자동으로 순환 재생
- **전환 효과**: Fade, Slide, Zoom 등 다양한 전환 효과 지원
- **스케줄 기능**: 요일/시간별 자동 시작/중지 설정
- **전체화면 모드**: 전체화면 슬라이드쇼 지원
- **시계 표시**: 슬라이드쇼 화면에 24시간 형식 시계 표시

## 기술 스택

- **Electron** - 데스크톱 앱 프레임워크
- **React 19** - UI 프레임워크
- **TypeScript** - 타입 안전성
- **Vite** - 빌드 도구
- **electron-store** - 로컬 데이터 저장

## 설치 및 실행

### 요구사항

- Node.js 18+
- macOS

### 개발 모드

```bash
npm install
npm run dev
```

### 빌드

```bash
npm run electron:build
```

빌드 결과물:
- `release/mac-arm64/PhotoSlide.app`
- `release/PhotoSlide-1.0.0-arm64.dmg`

### macOS에서 실행 (서명되지 않은 앱)

```bash
xattr -cr PhotoSlide.app
open PhotoSlide.app
```

## 환경 변수

`.env` 파일에 Google OAuth 클라이언트 정보를 설정하세요:

```
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

## 단축키

- `Space` - 재생/일시정지
- `←` / `→` - 이전/다음 슬라이드
- `F` - 전체화면 전환
- `ESC` - 창모드로 전환

## 라이선스

MIT
