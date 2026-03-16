// billingService.ts
// Google Play 인앱결제 (cordova-plugin-purchase) 래퍼

// cordova-plugin-purchase는 전역 `store` 객체를 제공한다.
// 타입 정의가 없을 수 있으므로 안전하게 any로 취급한다.

type Store = any;

const PRODUCT_IDS = {
  coffee: 'coffee',
  burger: 'burger_3000',
  pizza: 'pizza_5000',
} as const;

let isInitialized = false;

const isPurchaseStoreShape = (store: any): boolean => {
  return !!(
    store &&
    typeof store.register === 'function' &&
    typeof store.when === 'function' &&
    typeof store.ready === 'function' &&
    typeof store.refresh === 'function' &&
    typeof store.order === 'function'
  );
};

const describeObjectKeys = (obj: any): string => {
  try {
    if (!obj || typeof obj !== 'object') return String(obj);
    return Object.keys(obj).slice(0, 40).join(', ');
  } catch {
    return '키를 읽을 수 없음';
  }
};

/**
 * cordova-plugin-purchase store 객체를 안전하게 가져온다.
 * - 우선순위: window.CdvPurchase.store -> window.store(구버전/환경)
 * - window.store는 앱 내부 상태 store와 충돌할 수 있어 shape 검사 필수
 */
const getStore = (): Store | null => {
  if (typeof window === 'undefined') return null;
  const anyWindow = window as any;

  const candidate1 = anyWindow?.CdvPurchase?.store;
  if (isPurchaseStoreShape(candidate1)) return candidate1 as Store;

  const candidate2 = anyWindow?.store;
  if (isPurchaseStoreShape(candidate2)) return candidate2 as Store;

  // store가 "있긴 한데" 결제 store가 아닌 경우(충돌)까지도 감지해 두기 위해 null 반환
  return null;
};

/**
 * 디버그: 결제 store가 안 잡힐 때, 현재 window에 어떤 객체가 있는지 안내
 */
const alertStoreDiagnostics = (): void => {
  if (typeof window === 'undefined') return;
  // 디버그용 진단 함수는 현재 콘솔/alert 모두 사용하지 않음
};

/**
 * 인앱 결제 플러그인이 실행 가능한 환경인지 확인
 */
const isStoreAvailable = (): boolean => {
  return !!getStore();
};

/**
 * Billing 준비 상태 여부 (store 존재 + 초기화 완료 여부 기반)
 * UI 단에서 결제 가능 여부를 사전 점검할 때 사용
 */
export const isBillingReady = (): boolean => {
  return isInitialized && isStoreAvailable();
};

/**
 * cordova-plugin-purchase 초기화 및 상품 등록
 * - consumable 상품 등록
 * - 승인 / 오류 핸들러 등록
 * - store.refresh() 호출
 */
export const initBilling = async (): Promise<void> => {
  if (isInitialized) return;

  // 플러그인이 늦게 로드되는 경우를 대비해 store를 잠깐 기다린다 (최대 8초)
  let store: Store | null = null;
  for (let i = 0; i < 80; i++) {
    store = getStore();
    if (store) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  // 웹 환경 등에서 플러그인이 없을 수 있으므로, 조용히 종료
  if (!store) {
    console.warn('[billingService] store 가 없습니다. (웹 환경 또는 플러그인 미설치)');
    if (typeof alert === 'function') {
      alertStoreDiagnostics();
    }
    return;
  }

  // 디버그 로그 (필요시 주석 해제)
  // store.verbosity = store.DEBUG;

  // 1) 상품 등록 (모두 consumable)
  const productIds = [
    PRODUCT_IDS.coffee,
    PRODUCT_IDS.burger,
    PRODUCT_IDS.pizza,
  ];

  productIds.forEach((id) => {
    store.register({
      id,
      type: store.CONSUMABLE,
    });
  });

  // 2) 공통 승인 처리: 결제 성공 시 product.finish() 및 알림
  productIds.forEach((id) => {
    const when = store.when(id);

    // approved
    when.approved?.((product: any) => {
      try {
        if (product && typeof product.finish === 'function') {
          product.finish();
        }
      } catch (e) {
        console.error('[billingService] product.finish() 에러', e);
      }

      // 결제 성공 메시지는 현재 비활성화
      // if (typeof alert === 'function') {
      //   alert('후원 감사합니다! ☕');
      // }
    });

    // 선택: 취소/거절/에러 로깅
    const onCancelled = () => {
      console.log(`[billingService] 결제 취소: ${id}`);
      // if (typeof alert === 'function') alert('결제가 취소되었습니다.');
    };

    // 플러그인/버전에 따라 cancelled vs canceled 가 다를 수 있음
    if (typeof when.cancelled === 'function') {
      when.cancelled(onCancelled);
    } else if (typeof when.canceled === 'function') {
      when.canceled(onCancelled);
    } else {
      console.warn('[billingService] cancelled/canceled 핸들러를 지원하지 않는 store.when() 형태입니다.', {
        id,
        whenKeys: describeObjectKeys(when),
      });
    }

    // error
    when.error?.((err: any) => {
      const errorDetails = err ? (typeof err === 'string' ? err : JSON.stringify(err)) : '알 수 없는 오류';
      console.error(`[billingService] 결제 에러 (${id})`, err);
      // 에러 상세 alert 는 현재 비활성화
      // if (typeof alert === 'function') {
      //   alert(
      //     `결제 중 오류가 발생했습니다.\n\n` +
      //     `상품: ${id}\n` +
      //     `에러: ${errorDetails}\n\n` +
      //     `확인 사항:\n` +
      //     `1. Play Console에서 상품이 활성화되어 있는지\n` +
      //     `2. 테스트 계정으로 로그인되어 있는지\n` +
      //     `3. 네트워크 연결을 확인해주세요`
      //   );
      // }
    });
  });

  // 3) 전역 에러 핸들러 (내부 로깅만 유지하고 콘솔 출력은 최소화 가능)
  store.error((err: any) => {
    // console.error('[billingService] store 전역 에러', err);
  });

  // 4) 준비 완료 콜백
  await new Promise<void>((resolve) => {
    store.ready(() => {
      console.log('[billingService] store.ready');
      isInitialized = true;
      // if (typeof alert === 'function') {
      //   alert('Play Billing 초기화가 완료되었습니다.\n\n이제 인앱결제 테스트를 진행해보세요.');
      // }
      resolve();
    });

    // 혹시 ready 콜백이 오래 걸리더라도, 일정 시간 후에는 초기화된 것으로 간주
    setTimeout(() => {
      if (!isInitialized) {
        console.warn('[billingService] store.ready 타임아웃, 초기화를 계속 진행합니다.');
        isInitialized = true;
        // if (typeof alert === 'function') {
        //   alert('Play Billing 초기화 신호를 받지 못했지만,\n테스트를 위해 초기화 완료로 간주합니다.\n\n결제창이 뜨는지 확인해 주세요.');
        // }
        resolve();
      }
    }, 10000);
  });

  // 5) store.refresh() 로 제품 정보 / 영수증 동기화
  try {
    store.refresh();
    console.log('[billingService] store.refresh() 호출 완료');
  } catch (e) {
    console.error('[billingService] store.refresh() 에러', e);
  }
};

/**
 * 내부 공통 구매 함수
 */
const orderProduct = async (productId: string): Promise<void> => {
  // Billing 초기화
  await initBilling();

  const store = getStore();
  if (!store) {
    // console.warn('[billingService] store 가 없습니다. 결제를 진행할 수 없습니다.');
    // if (typeof alert === 'function') {
    //   alert('결제 기능을 사용할 수 없습니다. 앱을 다시 시작한 후 시도해 주세요.');
    // }
    throw new Error('Store not available');
  }

  // 초기화가 완료될 때까지 최대 5초 대기
  let initWaitCount = 0;
  const maxInitWait = 50; // 5초 (100ms * 50)
  while (!isBillingReady() && initWaitCount < maxInitWait) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    initWaitCount++;
  }

  // 초기화가 완료되지 않았으면 에러
  if (!isBillingReady()) {
    const errorMsg = 'Play Billing 초기화가 완료되지 않았습니다.\n\n잠시 후 다시 시도해주세요.';
    // console.error('[billingService]', errorMsg);
    // if (typeof alert === 'function') {
    //   alert(errorMsg);
    // }
    throw new Error('Billing not ready');
  }

  // store.refresh() 호출하여 상품 정보 갱신
  try {
    store.refresh();
    // console.log('[billingService] store.refresh() 호출 (상품 정보 갱신 중...)');
  } catch (e) {
    console.error('[billingService] store.refresh() 에러', e);
  }

  // 상품이 valid 상태가 될 때까지 대기 (최대 10초)
  let product: any = null;
  let productWaitCount = 0;
  const maxProductWait = 100; // 10초 (100ms * 100)
  
  while (productWaitCount < maxProductWait) {
    product = store.get(productId);
    
    if (product) {
      const state = product.state || 'unknown';
      const valid = product.valid;
      const canPurchase = product.canPurchase;
      
      // 상품이 valid이고 구매 가능한 상태면 break
      if (valid === true && canPurchase === true) {
        console.log(`[billingService] 상품(${productId})이 준비되었습니다.`, { state, valid, canPurchase });
        break;
      }
      
      // 상품이 invalid 상태로 확정되면 즉시 에러
      if (state === 'invalid' || (valid === false && state !== 'registered' && state !== 'loading')) {
        const errorMsg = 
          `상품(${productId})이 유효하지 않습니다.\n\n` +
          `상품 상태:\n` +
          `- state: ${state}\n` +
          `- valid: ${valid}\n` +
          `- canPurchase: ${canPurchase}\n\n` +
          `확인 사항:\n` +
          `1. Play Console에서 상품이 활성화되어 있는지\n` +
          `2. 상품 ID가 정확한지 (${productId})\n` +
          `3. 테스트 계정이 설정되어 있는지`;
        // console.error('[billingService]', errorMsg);
        // if (typeof alert === 'function') {
        //   alert(errorMsg);
        // }
        throw new Error(`Product invalid: ${productId} (state: ${state}, valid: ${valid}, canPurchase: ${canPurchase})`);
      }
    }
    
    await new Promise((resolve) => setTimeout(resolve, 100));
    productWaitCount++;
  }

  // 최종 상품 확인
  product = store.get(productId);
  if (!product) {
    const allProducts = store.products || [];
    const errorMsg = 
      `상품(${productId})을 찾을 수 없습니다.\n\n` +
      `등록된 상품 목록:\n${allProducts.map((p: any) => `- ${p.id} (state: ${p.state || 'unknown'}, valid: ${p.valid})`).join('\n') || '없음'}\n\n` +
      `확인 사항:\n` +
      `1. Play Console에서 상품 ID가 정확한지\n` +
      `2. 앱을 완전히 종료 후 다시 시작\n` +
      `3. store.refresh()가 완료되었는지`;
    // console.error('[billingService]', errorMsg);
    // if (typeof alert === 'function') {
    //   alert(errorMsg);
    // }
    throw new Error(`Product not found: ${productId}`);
  }

  // 최종 상품 상태 확인
  const productState = product.state || 'unknown';
  const productValid = product.valid;
  const productCanPurchase = product.canPurchase;

  const productInfo = {
    id: product.id,
    state: productState,
    valid: productValid,
    canPurchase: productCanPurchase,
    title: product.title || 'N/A',
    price: product.price || 'N/A',
    description: product.description || 'N/A'
  };

  console.log(`[billingService] 최종 상품 상태 확인`, productInfo);

  // 최종 검증: 상품이 valid이고 구매 가능해야 함
  if (productValid !== true || productCanPurchase !== true) {
    const errorMsg = 
      `상품(${productId})을 구매할 수 없습니다.\n\n` +
      `상품 상태:\n` +
      `- state: ${productState}\n` +
      `- valid: ${productValid}\n` +
      `- canPurchase: ${productCanPurchase}\n` +
      `- title: ${productInfo.title}\n` +
      `- price: ${productInfo.price}\n\n` +
      `확인 사항:\n` +
      `1. Play Console에서 상품이 활성화되어 있는지\n` +
      `2. 테스트 계정으로 로그인되어 있는지\n` +
      `3. 상품 ID가 정확한지 (${productId})\n` +
      `4. 앱을 다시 시작해보세요`;
    console.error('[billingService]', errorMsg);
    if (typeof alert === 'function') {
      alert(errorMsg);
    }
    throw new Error(`Product not purchasable: ${productId} (state: ${productState}, valid: ${productValid}, canPurchase: ${productCanPurchase})`);
  }

  // store.order() 호출 전 최종 확인
  // 상품 정보를 화면에 표시하여 확인 가능하도록
  const orderConfirmMsg = 
    `✅ 결제 준비 완료\n\n` +
    `상품: ${productInfo.title}\n` +
    `가격: ${productInfo.price}\n` +
    `상태: ${productState}\n` +
    `유효성: ${productValid ? '✅' : '❌'}\n` +
    `구매가능: ${productCanPurchase ? '✅' : '❌'}\n\n` +
    `이제 결제창이 표시됩니다...`;
  // console.log('[billingService]', orderConfirmMsg);
  
  // 테스트용 주문 확인 alert 는 현재 숨김 처리
  // if (typeof alert === 'function') {
  //   alert(orderConfirmMsg);
  // }

  // 에러 발생 여부를 추적하기 위한 플래그
  let orderErrorOccurred = false;
  let orderErrorDetails: any = null;
  
  // 에러 핸들러: order 호출 후 에러가 발생하면 플래그 설정
  const orderErrorHandler = (err: any) => {
    orderErrorOccurred = true;
    orderErrorDetails = err;
    const errorStr = err ? (typeof err === 'string' ? err : JSON.stringify(err)) : '알 수 없는 오류';
    // console.error(`[billingService] store.order(${productId}) 에러 발생`, err);
    
    // 에러 핸들러에서 즉시 알림
    // (기존 에러 핸들러도 있지만, 여기서도 표시하여 즉시 확인 가능)
    // if (typeof alert === 'function') {
    //   alert(
    //     `❌ 결제 요청 실패\n\n` +
    //     `상품: ${productInfo.title}\n` +
    //     `상품 ID: ${productId}\n` +
    //     `에러 내용: ${errorStr}\n\n` +
    //     `🔍 확인 사항:\n` +
    //     `1. Play Console에서 상품이 활성화되어 있는지\n` +
    //     `2. 테스트 계정으로 로그인되어 있는지\n` +
    //     `3. 네트워크 연결 확인\n` +
    //     `4. 앱을 다시 시작해보세요`
    //   );
    // }
  };
  
  // 에러 핸들러 등록 (기존 핸들러와 함께 동작)
  store.when(productId).error(orderErrorHandler);

  try {
    // console.log(`[billingService] store.order(${productId}) 호출 시작`);
    
    // store.order() 호출
    // 주의: 이 함수는 동기적으로 실행되지만, 실제 결제창은 비동기적으로 표시됨
    // 에러가 발생하면 orderErrorHandler가 호출됨
    store.order(productId);
    
    // console.log(`[billingService] store.order(${productId}) 호출 완료, 에러 확인 대기 중...`);
    
    // order 호출 후 3초 대기하여 에러가 발생하는지 확인
    // (일부 에러는 비동기적으로 발생할 수 있음)
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    // 에러가 발생했는지 확인
    if (orderErrorOccurred) {
      const errorDetails = orderErrorDetails 
        ? (typeof orderErrorDetails === 'string' ? orderErrorDetails : JSON.stringify(orderErrorDetails))
        : '알 수 없는 오류';
      const errorMsg = 
        `결제 요청이 실패했습니다.\n\n` +
        `상품: ${productInfo.title} (${productId})\n` +
        `에러: ${errorDetails}\n\n` +
        `확인 사항:\n` +
        `1. Play Console에서 상품이 활성화되어 있는지\n` +
        `2. 테스트 계정으로 로그인되어 있는지\n` +
        `3. 상품 ID가 정확한지 (${productId})\n` +
        `4. 앱을 다시 시작해보세요`;
      console.error('[billingService]', errorMsg);
      // orderErrorHandler에서 이미 alert를 표시했으므로, 여기서는 throw만
      throw new Error(`Order failed: ${errorDetails}`);
    }
    
    // 에러가 발생하지 않았다면, 결제창이 표시되었을 것으로 가정
    // console.log(`[billingService] store.order(${productId}) 호출 성공, 결제창 대기 중...`);
    
    // 결제창 표시 안내 alert 는 현재 비활성화
    // if (typeof alert === 'function') {
    //   alert(
    //     `✅ 결제 요청 전송 완료\n\n` +
    //     `상품: ${productInfo.title}\n` +
    //     `가격: ${productInfo.price}\n\n` +
    //     `결제창이 곧 표시됩니다.\n` +
    //     `(만약 결제창이 나타나지 않으면, Play Console 설정을 확인해주세요)`
    //   );
    // }
    
  } catch (e) {
    // 동기 에러 (store.order() 호출 자체가 실패한 경우)
    // console.error(`[billingService] store.order(${productId}) 동기 에러`, e);
    const errorMsg = 
      `결제 요청 중 오류가 발생했습니다.\n\n` +
      `${e instanceof Error ? e.message : '알 수 없는 오류'}\n\n` +
      `상품 ID: ${productId}\n` +
      `상품 상태: ${productState}\n\n` +
      `Play Console 설정을 확인해주세요.`;
    // if (typeof alert === 'function') {
    //   alert(errorMsg);
    // }
    throw e;
  }
};

/**
 * 커피 후원 결제
 */
export const purchaseCoffee = (): Promise<void> => {
  return orderProduct(PRODUCT_IDS.coffee);
};

/**
 * 버거 후원 결제
 */
export const purchaseBurger = (): Promise<void> => {
  return orderProduct(PRODUCT_IDS.burger);
};

/**
 * 피자 후원 결제
 */
export const purchasePizza = (): Promise<void> => {
  return orderProduct(PRODUCT_IDS.pizza);
};

/**
 * React 컴포넌트에서 사용 예시
 *
 * import { initBilling, purchaseCoffee } from '../services/billingService';
 *
 * useEffect(() => {
 *   initBilling();
 * }, []);
 *
 * <button onClick={() => purchaseCoffee()}>커피 후원하기</button>
 */


