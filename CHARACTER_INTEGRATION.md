# 캐릭터 통합 가이드

## 개요

앱의 메인 캐릭터를 전반에 걸쳐 브랜드 요소로 활용합니다.

## 이미지 파일 위치

```
public/
  └── character.png  (512x512px 이상, PNG 형식, 투명 배경 권장)
```

## 적용 위치

### 1. 앱 아이콘
- **위치**: `index.html`의 favicon
- **사양**: 512x512px, PNG
- **상태**: ✅ 완료

### 2. 로그인 화면
- **위치**: `src/pages/Login.tsx`
- **크기**: large (128x128px)
- **기능**: 말풍선 포함 ("용돈 주세요")
- **상태**: ✅ 완료

### 3. 자녀 홈 화면
- **위치**: `src/components/ChildHome.tsx`
- **크기**: medium (80x80px)
- **위치**: 헤더 인사 영역 (이름 옆)
- **상태**: ✅ 완료

### 4. 부모 화면
- **자녀 선택 카드**: `src/components/Home.tsx`
  - **크기**: small (48x48px)
  - **위치**: 각 자녀 카드 왼쪽
  - **상태**: ✅ 완료

- **빈 상태 일러스트**: `src/components/Home.tsx`
  - **크기**: large (128x128px)
  - **기능**: 말풍선 포함 ("미션을 만들어주세요")
  - **상태**: ✅ 완료

### 5. 승인 화면
- **위치**: `src/components/Approval.tsx`
- **크기**: large (128x128px)
- **기능**: 말풍선 포함 ("검토할 미션이 없어요")
- **상태**: ✅ 완료

### 6. 자녀 홈 빈 상태
- **위치**: `src/components/ChildHome.tsx`
- **크기**: large (128x128px)
- **기능**: 말풍선 포함 ("미션을 기다려요")
- **상태**: ✅ 완료

## Character 컴포넌트 사용법

```tsx
import Character from '../components/Character';

// 기본 사용 (중간 크기)
<Character />

// 크기 지정
<Character size="small" />   // 48x48px
<Character size="medium" />  // 80x80px
<Character size="large" />   // 128x128px
<Character size="icon" />    // 64x64px (아이콘용)

// 말풍선 포함
<Character 
  size="large" 
  showSpeechBubble 
  speechText="용돈 주세요" 
/>

// 커스텀 클래스
<Character size="medium" className="mb-4" />
```

## 이미지 파일 추가 방법

1. 캐릭터 이미지 파일을 준비합니다
   - 형식: PNG
   - 크기: 512x512px 이상 (고해상도)
   - 배경: 투명 또는 노란색 (#FFEB3B)
   - 모서리: 둥근 모서리 (앱에서 CSS로 처리)

2. `public/character.png`에 파일을 추가합니다

3. 개발 서버를 재시작합니다 (이미지 캐싱 방지)

## 디자인 가이드라인

### 크기 제한
- **small**: 48x48px - 자녀 카드 아바타
- **medium**: 80x80px - 헤더 인사 영역
- **large**: 128x128px - 빈 상태 일러스트
- **icon**: 64x64px - 앱 아이콘

### 톤 & 스타일
- 어린이 친화적
- 과하지 않게 배치
- UI 기능을 방해하지 않도록 크기 제한
- 안내/응원 역할

### 말풍선 사용
- 빈 상태에서만 사용
- 로그인 화면에서만 사용
- 간결한 메시지 (최대 10자 권장)

## 문제 해결

### 이미지가 표시되지 않는 경우
1. `public/character.png` 파일이 존재하는지 확인
2. 파일 이름이 정확한지 확인 (대소문자 구분)
3. 개발 서버 재시작
4. 브라우저 캐시 삭제

### 대체 UI
이미지 로드 실패 시 자동으로 이모지(👶)로 대체됩니다.

