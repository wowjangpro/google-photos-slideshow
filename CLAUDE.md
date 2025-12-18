# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**PhotoSlide**는 구글 포토 앨범을 디지털 액자처럼 자동 재생하는 macOS용 슬라이드쇼 앱입니다.

- **플랫폼**: macOS (Electron)
- **언어**: TypeScript 권장
- **주요 목적**: Google Photos API를 활용한 자동 슬라이드쇼

## 기술 스택

### 핵심
- Electron
- React
- TypeScript

### 주요 라이브러리
- `electron` - 데스크톱 앱 프레임워크
- `react` / `react-dom` - UI 프레임워크 (**19.0.2+, 19.1.3+, 또는 19.2.2+ 사용** - CVE-2025-55183 패치)
- `electron-store` - 로컬 데이터 저장
- `googleapis` - Google API 클라이언트
- `node-cache` - 이미지 캐싱

### 보안 주의사항
- **CVE-2025-55183**: React 19.0.2, 19.1.3, 19.2.2 미만 버전 사용 금지 (정보 유출 취약점)

### 빌드 도구
- `electron-builder` - 앱 패키징 및 배포
- `vite` 또는 `webpack` - 번들링

## 아키텍처

### 화면 구조
1. **스플래시 화면** - 앱 시작 화면
2. **로그인 화면** - Google OAuth 인증
3. **앨범 목록 화면** - 그리드 형식의 앨범 선택
4. **슬라이드쇼 화면** - 전체 화면 이미지 재생
5. **설정 화면** - 슬라이드 간격, 스케줄, 창 크기, 사진 순서, 전환 효과 등

### 데이터 저장 구조 (electron-store)
```typescript
{
  userToken: string,
  refreshToken: string,
  selectedAlbums: Array<{
    id: string,
    title: string,
    coverPhotoUrl: string,
    photosCount: number
  }>,
  settings: {
    slideInterval: number,
    schedule: {
      enabled: boolean,
      timeGrid: boolean[][] // [7요일][24시간]
    },
    windowMode: 'windowed' | 'fullscreen',
    photoOrder: 'latest' | 'oldest' | 'random',
    shuffleAlbums: boolean,
    transitionEffect: 'none' | 'fade' | 'slide' | 'zoom',
    launchAtLogin: boolean
  }
}
```

### Google Photos API 통합
- **OAuth Scope**: `https://www.googleapis.com/auth/photoslibrary.readonly`
- **주요 엔드포인트**:
  - `albums.list` - 앨범 목록 조회
  - `mediaItems.search` - 앨범 내 사진 검색
  - `mediaItems.get` - 개별 사진 정보

## 핵심 기능 구현 가이드

### 1. 스케줄 격자 UI
- 7행(요일) × 24열(시간) = 168개 셀
- 클릭/드래그로 시간대 선택
- 요일/시간 라벨 클릭으로 일괄 선택
- 프리셋 제공: "전체 선택", "평일만", "주말만"
- 스케줄 활성화 시 현재 요일/시간을 체크하여 슬라이드쇼 자동 시작

### 2. 슬라이드쇼 동작
- 전체 화면 모드에서 설정된 간격으로 자동 전환
- 다음 이미지 미리 로드로 부드러운 전환
- 무한 루프 재생
- 키보드/마우스 제스처: ESC(종료), 방향키(수동 전환), 스페이스(일시정지)

### 3. 이미지 로딩 최적화
- 고해상도 이미지 메모리 관리
- 디스크 캐시 활용 (앱 데이터 폴더)
- 사용하지 않는 이미지 즉시 해제

### 4. 백그라운드 동작
- 메뉴바/트레이 아이콘으로 백그라운드 실행
- node-cron 또는 setInterval로 스케줄 체크
- 시스템 시작 시 자동 실행 옵션

## Electron 프로세스 구조

### Main Process (메인 프로세스)
- Google OAuth 인증 처리
- 시스템 트레이 관리
- 전역 단축키 등록
- 화면 깨우기 방지 (powerSaveBlocker)
- 파일 시스템 접근 (이미지 캐시)

### Renderer Process (렌더러 프로세스)
- React UI 렌더링
- 슬라이드쇼 애니메이션
- 사용자 인터랙션 처리

### IPC 통신
```typescript
// 주요 IPC 채널
'auth:google-login'      // Google 로그인 요청
'auth:logout'            // 로그아웃
'photos:get-albums'      // 앨범 목록 요청
'photos:get-media'       // 미디어 아이템 요청
'slideshow:start'        // 슬라이드쇼 시작
'slideshow:stop'         // 슬라이드쇼 중지
'settings:get'           // 설정 불러오기
'settings:save'          // 설정 저장
'window:fullscreen'      // 전체화면 전환
```

## 개발 시 주의사항

### 성능
- 고해상도 이미지 처리 시 메모리 오버플로우 방지
- Google Photos API 호출 제한 고려 (적절한 캐싱 필수)
- 네트워크 에러 핸들링 구현

### macOS 통합
- 네이티브 메뉴바 활용
- Dock 아이콘 및 뱃지
- 알림 센터 연동
- 시스템 다크 모드 지원

### UI/UX
- 격자 UI 셀 크기는 최소 30x30px (클릭 영역 확보)
- 부드러운 전환 효과와 애니메이션
- 명확한 시각적 피드백과 에러 메시지

## 빌드 및 실행

### 개발 모드
```bash
npm run dev
```

### 릴리즈 빌드 (macOS 26 Tahoe)

macOS 26에서는 ad-hoc 서명으로 빌드해야 정상 실행됩니다.

```bash
# ad-hoc 서명으로 빌드 (Apple 개발자 인증서 사용 안함)
CSC_IDENTITY_AUTO_DISCOVERY=false npm run electron:build
```

빌드 결과물:
- `release/mac-arm64/PhotoSlide.app`
- `release/PhotoSlide-1.0.0-arm64.dmg`
- `release/PhotoSlide-1.0.0-arm64-mac.zip`

### macOS 26에서 실행 방법

1. Finder에서 `release/mac-arm64/PhotoSlide.app` 찾기
2. **Control + 클릭** (또는 우클릭) → **열기** 선택
3. 경고창에서 **열기** 클릭
4. 맥북 비밀번호 입력

**주의**: `open` 명령어로 실행하면 앱이 자동 삭제될 수 있음. 반드시 Finder에서 Control + 클릭으로 실행할 것.

## 개발 단계 (참고)
1. **Phase 1**: Electron 프로젝트 생성, React 설정, Google OAuth
2. **Phase 2**: Google Photos API 연동, 앨범 목록, 기본 슬라이드쇼
3. **Phase 3**: 설정 기능 (간격, 스케줄 격자 UI, 창 모드, 전환 효과)
4. **Phase 4**: 여러 앨범 선택, 컨트롤 UI, 백그라운드 스케줄
5. **Phase 5**: 성능 최적화, 메모리 관리, 테스트, 앱 서명 및 배포
