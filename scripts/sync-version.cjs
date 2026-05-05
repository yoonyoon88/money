#!/usr/bin/env node
/**
 * 버전 동기화 스크립트
 *
 * 사용법:
 *   npm run version:sync              - version.ts 값을 build.gradle·package.json에 반영
 *   npm run version:bump 31 1.1.0     - version.ts·build.gradle·package.json 동시 업데이트
 *   node scripts/sync-version.js bump 31 1.1.0
 *
 * 버전 올리는 순서:
 *   1. npm run version:bump <versionCode> <versionName>
 *   2. npm run build
 *   3. npx cap sync android
 *   4. Android Studio에서 APK/AAB 빌드
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION_TS  = path.join(ROOT, 'src', 'constants', 'version.ts');
const BUILD_GRADLE = path.join(ROOT, 'android', 'app', 'build.gradle');
const PACKAGE_JSON = path.join(ROOT, 'package.json');

// ─── 파싱 헬퍼 ────────────────────────────────────────────────────────────────

function parseVersionTs() {
  const src = fs.readFileSync(VERSION_TS, 'utf-8');

  const codeMatch = src.match(/CURRENT_VERSION_CODE\s*=\s*(\d+)/);
  const nameMatch = src.match(/CURRENT_VERSION_NAME\s*=\s*['"]([^'"]+)['"]/);

  if (!codeMatch || !nameMatch) {
    console.error('❌ version.ts에서 버전 정보를 파싱할 수 없습니다.');
    console.error('   CURRENT_VERSION_CODE와 CURRENT_VERSION_NAME 상수가 있는지 확인하세요.');
    process.exit(1);
  }

  return { code: parseInt(codeMatch[1], 10), name: nameMatch[1] };
}

// ─── 업데이트 헬퍼 ────────────────────────────────────────────────────────────

function updateVersionTs(code, name) {
  let src = fs.readFileSync(VERSION_TS, 'utf-8');
  src = src.replace(
    /CURRENT_VERSION_CODE\s*=\s*\d+/,
    `CURRENT_VERSION_CODE = ${code}`
  );
  src = src.replace(
    /CURRENT_VERSION_NAME\s*=\s*['"][^'"]+['"]/,
    `CURRENT_VERSION_NAME = '${name}'`
  );
  fs.writeFileSync(VERSION_TS, src, 'utf-8');
  console.log(`  ✅ src/constants/version.ts  →  code=${code}, name="${name}"`);
}

function updateBuildGradle(code, name) {
  let src = fs.readFileSync(BUILD_GRADLE, 'utf-8');
  src = src.replace(/versionCode\s+\d+/, `versionCode ${code}`);
  src = src.replace(/versionName\s+"[^"]*"/, `versionName "${name}"`);
  fs.writeFileSync(BUILD_GRADLE, src, 'utf-8');
  console.log(`  ✅ android/app/build.gradle  →  versionCode=${code}, versionName="${name}"`);
}

function updatePackageJson(name) {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf-8'));
  pkg.version = name;
  fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  console.log(`  ✅ package.json              →  version="${name}"`);
}

// ─── 명령 처리 ────────────────────────────────────────────────────────────────

const [,, command, arg1, arg2] = process.argv;

if (command === 'bump') {
  // npm run version:bump <versionCode> <versionName>
  const code = parseInt(arg1, 10);
  const name = arg2;

  if (!code || !name) {
    console.error('❌ 사용법: npm run version:bump <versionCode> <versionName>');
    console.error('   예시:  npm run version:bump 31 1.1.0');
    process.exit(1);
  }

  console.log(`\n🚀 버전 업데이트: ${name} (${code})\n`);
  updateVersionTs(code, name);
  updateBuildGradle(code, name);
  updatePackageJson(name);
  console.log('\n🎉 완료! 다음 단계: npm run build → npx cap sync android\n');

} else {
  // 기본 동작 (sync): version.ts → build.gradle + package.json
  const { code, name } = parseVersionTs();

  console.log(`\n🔄 version.ts 기준으로 동기화 중: ${name} (${code})\n`);
  updateBuildGradle(code, name);
  updatePackageJson(name);
  console.log('\n🎉 동기화 완료!\n');
}
