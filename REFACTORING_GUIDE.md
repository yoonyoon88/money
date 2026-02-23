# 미션 승인 로직 리팩토링 가이드

## 개요

현재 Firestore 직접 업데이트 방식에서 Cloud Functions로 확장하기 쉽도록 코드 구조를 리팩토링했습니다.

---

## 리팩토링 전 구조

### 문제점

1. **단일 함수에 모든 로직이 집중**
   - 비즈니스 로직과 트랜잭션 실행이 하나의 함수에 혼재
   - 추후 서버로 이동 시 코드 분리가 어려움

2. **재사용성 부족**
   - 검증 로직, 포인트 계산 로직이 하드코딩
   - 다른 곳에서 같은 로직을 사용하기 어려움

3. **테스트 어려움**
   - 비즈니스 로직을 독립적으로 테스트하기 어려움

### 이전 코드 구조

```typescript
export const approveMission = async (missionId: string, approvedBy: string) => {
  await runTransaction(db, async (transaction) => {
    // 1. 미션 문서 읽기
    const missionDoc = await transaction.get(missionRef);
    const mission = missionDoc.data();
    
    // 2. 검증 로직 (하드코딩)
    if (mission.status !== 'SUBMITTED') {
      throw new Error('제출된 미션이 아닙니다.');
    }
    
    // 3. 사용자 문서 읽기
    const userDoc = await transaction.get(userRef);
    const userData = userDoc.data();
    
    // 4. 검증 로직 (하드코딩)
    if (userData.role !== 'CHILD') {
      throw new Error('아이에게만 포인트를 지급할 수 있습니다.');
    }
    
    // 5. 포인트 계산 (하드코딩)
    const pointIncrement = mission.rewardPoint;
    
    // 6. 업데이트 실행
    transaction.update(missionRef, {
      status: 'APPROVED',
      approvedAt: serverTimestamp(),
      approvedBy: approvedBy,
    });
    
    transaction.update(userRef, {
      totalPoint: increment(pointIncrement),
      updatedAt: serverTimestamp(),
    });
  });
};
```

---

## 리팩토링 후 구조

### 개선 사항

1. **비즈니스 로직 분리**
   - 검증, 계산, 데이터 준비 로직을 별도 함수로 분리
   - 각 함수가 단일 책임을 가짐

2. **Cloud Functions 이전 가능 표시**
   - 🔄 이모지로 서버로 이동 가능한 부분 명시
   - 주석으로 이전 계획 문서화

3. **재사용성 향상**
   - 각 함수가 독립적으로 테스트 가능
   - 다른 컨텍스트에서도 재사용 가능

### 현재 코드 구조

```typescript
// ============================================================================
// 미션 승인 비즈니스 로직 (추후 Cloud Functions로 이동 가능)
// ============================================================================

/**
 * 미션 승인 검증
 * 🔄 Cloud Functions 이전 가능
 */
const validateMissionApproval = (mission: any, userData: any): void => {
  if (mission.status !== 'SUBMITTED') {
    throw new Error('제출된 미션이 아닙니다.');
  }
  if (userData.role !== 'CHILD') {
    throw new Error('아이에게만 포인트를 지급할 수 있습니다.');
  }
};

/**
 * 포인트 증가량 계산
 * 🔄 Cloud Functions 이전 가능
 */
const calculatePointIncrement = (mission: any): number => {
  return mission.rewardPoint || 0;
};

/**
 * 미션 승인 업데이트 데이터 준비
 * 🔄 Cloud Functions 이전 가능
 */
const prepareMissionApprovalUpdates = (approvedBy: string) => {
  return {
    status: 'APPROVED',
    approvedAt: serverTimestamp(),
    approvedBy: approvedBy,
  };
};

/**
 * 사용자 포인트 업데이트 데이터 준비
 * 🔄 Cloud Functions 이전 가능
 */
const prepareUserPointUpdates = (pointIncrement: number) => {
  return {
    totalPoint: increment(pointIncrement),
    updatedAt: serverTimestamp(),
  };
};

// ============================================================================
// Firestore 트랜잭션 실행 (클라이언트/서버 공통)
// ============================================================================

/**
 * 미션 승인 트랜잭션 실행
 * 🔄 Cloud Functions 이전 가능
 */
const executeApprovalTransaction = async (
  missionRef: any,
  userRef: any,
  approvedBy: string,
  transaction: any
): Promise<void> => {
  // 1. 문서 읽기
  const missionDoc = await transaction.get(missionRef);
  const userDoc = await transaction.get(userRef);
  
  const mission = missionDoc.data();
  const userData = userDoc.data();

  // 2. 비즈니스 로직 실행 (분리된 함수 사용)
  validateMissionApproval(mission, userData);
  const pointIncrement = calculatePointIncrement(mission);
  const missionUpdates = prepareMissionApprovalUpdates(approvedBy);
  const userUpdates = prepareUserPointUpdates(pointIncrement);

  // 3. 트랜잭션 업데이트
  transaction.update(missionRef, missionUpdates);
  transaction.update(userRef, userUpdates);
};

// ============================================================================
// 공개 API (현재: 클라이언트, 추후: Cloud Functions 호출로 변경 가능)
// ============================================================================

/**
 * 미션 승인
 * 🔄 Cloud Functions 이전 계획 문서화
 */
export const approveMission = async (missionId: string, approvedBy: string) => {
  const missionRef = doc(db, 'missions', missionId);
  
  await runTransaction(db, async (transaction) => {
    const missionDoc = await transaction.get(missionRef);
    const childId = missionDoc.data().childId;
    const userRef = doc(db, 'users', childId);
    
    await executeApprovalTransaction(missionRef, userRef, approvedBy, transaction);
  });
};
```

---

## 함수별 역할 분담

| 함수 | 역할 | Cloud Functions 이동 가능 여부 |
|------|------|-------------------------------|
| `validateMissionApproval` | 미션 승인 검증 (상태, 역할 확인) | ✅ 가능 |
| `calculatePointIncrement` | 포인트 증가량 계산 | ✅ 가능 |
| `prepareMissionApprovalUpdates` | 미션 업데이트 데이터 준비 | ✅ 가능 |
| `prepareUserPointUpdates` | 사용자 포인트 업데이트 데이터 준비 | ✅ 가능 |
| `executeApprovalTransaction` | 트랜잭션 실행 (검증 + 업데이트) | ✅ 가능 |
| `approveMission` | 공개 API (트랜잭션 래퍼) | ⚠️ 클라이언트에서 CF 호출로 변경 |

---

## Cloud Functions 이전 계획

### 단계 1: 비즈니스 로직 함수 이동

```typescript
// functions/src/missions/approval.ts

export const validateMissionApproval = (mission: any, userData: any): void => {
  // 기존 로직 그대로 이동
};

export const calculatePointIncrement = (mission: any): number => {
  // 기존 로직 그대로 이동
};

export const prepareMissionApprovalUpdates = (approvedBy: string) => {
  // 기존 로직 그대로 이동 (serverTimestamp는 admin SDK 사용)
};
```

### 단계 2: 트랜잭션 실행 함수 이동

```typescript
// functions/src/missions/approval.ts

import * as admin from 'firebase-admin';

export const executeApprovalTransaction = async (
  missionId: string,
  approvedBy: string
): Promise<void> => {
  const db = admin.firestore();
  
  await db.runTransaction(async (transaction) => {
    const missionRef = db.collection('missions').doc(missionId);
    // ... 기존 로직 그대로 이동
  });
};
```

### 단계 3: Cloud Functions 엔드포인트 생성

```typescript
// functions/src/index.ts

import * as functions from 'firebase-functions';
import { executeApprovalTransaction } from './missions/approval';

export const approveMission = functions.https.onCall(async (data, context) => {
  // 인증 체크
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', '인증이 필요합니다.');
  }
  
  const { missionId } = data;
  const approvedBy = context.auth.uid;
  
  // 트랜잭션 실행
  await executeApprovalTransaction(missionId, approvedBy);
  
  return { success: true };
});
```

### 단계 4: 클라이언트 코드 변경

```typescript
// src/firebase/missions.ts

import { getFunctions, httpsCallable } from 'firebase/functions';

export const approveMission = async (missionId: string, approvedBy: string) => {
  const functions = getFunctions();
  const approveMissionCF = httpsCallable(functions, 'approveMission');
  
  await approveMissionCF({ missionId });
};
```

---

## 비교표

| 항목 | 리팩토링 전 | 리팩토링 후 |
|------|------------|------------|
| **함수 수** | 1개 (모든 로직 포함) | 6개 (역할별 분리) |
| **재사용성** | 낮음 (하드코딩) | 높음 (함수 분리) |
| **테스트 가능성** | 낮음 (트랜잭션 의존) | 높음 (독립 함수) |
| **Cloud Functions 이전** | 어려움 (코드 재작성 필요) | 쉬움 (함수 단위 이동) |
| **코드 가독성** | 중간 (로직 혼재) | 높음 (명확한 역할 분리) |
| **유지보수성** | 낮음 (변경 시 전체 수정) | 높음 (해당 함수만 수정) |

---

## 현재 동작 유지 확인

리팩토링 후에도 **현재 동작은 완전히 동일**합니다:

- ✅ 미션 승인 검증 로직 동일
- ✅ 포인트 계산 로직 동일
- ✅ Firestore 트랜잭션 실행 방식 동일
- ✅ 에러 처리 동일
- ✅ API 인터페이스 동일 (함수 시그니처 변경 없음)

---

## 다음 단계 (선택사항)

1. **타입 안정성 개선**
   - `any` 타입을 구체적인 타입으로 변경
   - Mission, User 인터페이스 활용

2. **에러 처리 개선**
   - 커스텀 에러 클래스 도입
   - 에러 코드 체계 구축

3. **로깅 추가**
   - 승인 과정 로깅
   - 디버깅 정보 추가

4. **단위 테스트 작성**
   - 각 비즈니스 로직 함수 테스트
   - Mock을 사용한 트랜잭션 테스트

