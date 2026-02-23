import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * 안드로이드 하드웨어 뒤로가기 버튼 제어 훅
 * 
 * 사용 위치: App.tsx의 AppRoutes 컴포넌트에서 1회만 사용
 * 
 * 네비게이션 규칙:
 * - 종료 팝업이 나와야 하는 화면 (정확한 경로 매칭):
 *   - /login
 *   - /parent
 *   - /parent/home
 *   - /child
 *   - /child/home
 * - 그 외 모든 페이지: React Router navigate(-1)로 이전 화면 이동
 * - 웹 환경: 기존 브라우저 뒤로가기 유지 (동작하지 않음)
 * 
 * 주의사항:
 * - Capacitor App.addListener('backButton')는 앱 전체에서 1회만 등록
 * - removeAllListeners 사용 금지
 * - backButton 리스너는 useEffect cleanup에서 handler.remove()로 제거
 * - 종료 팝업 중복 호출 방지를 위해 useRef 사용
 * - Cancel을 눌렀을 때 동일 화면에서 다시 팝업이 반복되지 않도록 처리
 * - 홈 판단은 startsWith('/parent'), startsWith('/child') 같은 광범위 조건 금지
 * - 경로는 정확히 지정된 값만 종료 팝업 대상으로 판단
 */
export const useBackHandler = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const listenerHandleRef = useRef<any>(null);
  const isShowingDialogRef = useRef<boolean>(false); // 팝업이 열려있는지 상태 관리

  useEffect(() => {
    // 웹 환경에서는 동작하지 않음 (브라우저 기본 동작 유지)
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    // 기존 리스너가 있으면 먼저 제거 (중복 등록 방지)
    if (listenerHandleRef.current) {
      listenerHandleRef.current.remove();
      listenerHandleRef.current = null;
    }

    // 안드로이드 뒤로가기 버튼 리스너 등록 (앱 전체에서 1회만)
    App.addListener('backButton', () => {
      const pathname = location.pathname;
      
      // 종료 팝업이 나와야 하는 화면 (정확한 경로 매칭)
      const exitConfirmPaths = [
        '/login',
        '/parent',
        '/parent/home',
        '/child',
        '/child/home',
      ];
      
      const shouldShowExitConfirm = exitConfirmPaths.includes(pathname);
      
      if (shouldShowExitConfirm) {
        // 이미 팝업이 열려있으면 무시 (중복 방지)
        if (isShowingDialogRef.current) {
        return;
      }

        isShowingDialogRef.current = true;
        const shouldExit = window.confirm('앱을 종료하시겠습니까?');
        isShowingDialogRef.current = false; // 팝업 닫힘 (OK 또는 Cancel)
        
        if (shouldExit) {
          App.exitApp();
        }
        // Cancel을 눌렀을 때는 아무 동작도 하지 않고 같은 화면에 그대로 머물러야 함
        return;
      }

      // 종료 팝업 대상이 아닌 경우 이전 화면으로 이동
      navigate(-1);
    }).then((listener) => {
      listenerHandleRef.current = listener;
    }).catch((error) => {
    });

    // cleanup: 컴포넌트 언마운트 시 리스너 제거 (handler.remove() 사용)
    return () => {
      if (listenerHandleRef.current) {
        listenerHandleRef.current.remove();
        listenerHandleRef.current = null;
      }
      // 팝업 상태도 리셋
      isShowingDialogRef.current = false;
    };
  }, [location.pathname, navigate]);
};

