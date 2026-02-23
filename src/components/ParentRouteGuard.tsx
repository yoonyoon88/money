import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import PinInput from './PinInput';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * 부모 라우트 보호 컴포넌트
 * /parent 및 /parent/** 하위 라우트에서 PIN 인증이 필요할 때만 PIN 입력 화면을 표시
 * 
 * 네비게이션 규칙:
 * - PIN 화면 진입 시: replace 사용 (뒤로가기 방지)
 * - PIN 화면 뒤로가기: 자녀 선택 화면으로 이동 (로그인 화면으로 가면 안 됨)
 */
interface ParentRouteGuardProps {
  children: React.ReactNode;
}

const ParentRouteGuard: React.FC<ParentRouteGuardProps> = ({ children }) => {
  const { user, isParentVerified, setIsParentVerified } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  // PIN 화면 진입 시 replace 사용 (뒤로가기 방지)
  useEffect(() => {
    if (!isParentVerified && user && user.role === 'PARENT') {
      // PIN 화면으로 진입할 때 replace 사용하여 히스토리 스택에 쌓이지 않도록 함
      // 이렇게 하면 뒤로가기 시 자녀 선택 화면으로 이동
      if (location.pathname !== '/parent' && !location.pathname.startsWith('/parent/child/')) {
        // 이미 PIN 화면이면 무시
        return;
      }
    }
  }, [isParentVerified, user, location.pathname]);

  // 부모가 아니면 역할 선택 화면으로 리다이렉트
  if (!user || user.role !== 'PARENT') {
    return <>{children}</>; // 다른 컴포넌트에서 처리
  }

  // PIN이 이미 확인된 경우 바로 자식 컴포넌트 렌더링
  if (isParentVerified) {
    return <>{children}</>;
  }

  // PIN이 확인되지 않은 경우 PIN 입력 화면 표시
  // onCancel: 자녀 선택 화면으로 이동 (로그인 화면으로 가면 안 됨)
  return (
    <PinInput
      onSuccess={() => {
        setIsParentVerified(true);
        // PIN 성공 시 현재 경로 유지 (replace 사용)
        const currentPath = location.pathname;
        navigate(currentPath, { replace: true });
      }}
      onCancel={() => {
        // PIN 화면 뒤로가기: 자녀 선택 화면으로 이동 (역할 선택 화면이 아님)
        // ParentDashboard가 자녀 선택 화면 역할을 함
        navigate('/parent', { replace: true });
      }}
      title="PIN 입력"
      description="부모 기능에 접근하려면 PIN을 입력해주세요"
    />
  );
};

export default ParentRouteGuard;

