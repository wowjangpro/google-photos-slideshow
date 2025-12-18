#!/usr/bin/env node

/**
 * 아이콘 생성 스크립트
 * 실행 전 필요: npm install sharp png2icons --save-dev
 * 실행: node scripts/generate-icons.js
 */

const fs = require('fs')
const path = require('path')

async function generateIcons() {
  try {
    // sharp가 설치되어 있는지 확인
    let sharp
    try {
      sharp = require('sharp')
    } catch {
      console.log('sharp가 설치되어 있지 않습니다.')
      console.log('npm install sharp --save-dev 를 실행하세요.')
      console.log('\n대신 기본 아이콘을 사용합니다.')
      return
    }

    const publicDir = path.join(__dirname, '../public')
    const buildDir = path.join(__dirname, '../build')

    // 앱 아이콘 생성 (512x512, 256x256, 128x128, 64x64, 32x32, 16x16)
    const iconSvg = path.join(publicDir, 'icon.svg')
    if (fs.existsSync(iconSvg)) {
      const sizes = [512, 256, 128, 64, 32, 16]

      for (const size of sizes) {
        await sharp(iconSvg)
          .resize(size, size)
          .png()
          .toFile(path.join(buildDir, `icon_${size}x${size}.png`))
        console.log(`생성됨: icon_${size}x${size}.png`)
      }

      // 기본 아이콘 (512x512)
      await sharp(iconSvg)
        .resize(512, 512)
        .png()
        .toFile(path.join(buildDir, 'icon.png'))
      console.log('생성됨: icon.png')
    }

    // 트레이 아이콘 생성 (22x22, 44x44 @2x)
    const traySvg = path.join(publicDir, 'tray-icon.svg')
    if (fs.existsSync(traySvg)) {
      await sharp(traySvg)
        .resize(22, 22)
        .png()
        .toFile(path.join(publicDir, 'tray-icon.png'))
      console.log('생성됨: tray-icon.png')

      await sharp(traySvg)
        .resize(44, 44)
        .png()
        .toFile(path.join(publicDir, 'tray-icon@2x.png'))
      console.log('생성됨: tray-icon@2x.png')
    }

    console.log('\n아이콘 생성 완료!')
    console.log('\nmacOS .icns 파일 생성:')
    console.log('1. https://cloudconvert.com/svg-to-icns 에서 icon.svg를 변환')
    console.log('2. 또는 macOS에서: iconutil -c icns build/icon.iconset')

  } catch (error) {
    console.error('아이콘 생성 실패:', error.message)
  }
}

generateIcons()
