import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Header from './Header';

interface RoleSelectionProps {
  onRoleSelected?: () => void; // 역할 선택 완료 콜백 (선택사항, 설정 화면에서 사용)
  showBackButton?: boolean; // 뒤로가기 버튼 표시 여부 (설정 화면에서 사용)
  onBack?: () => void; // 뒤로가기 핸들러 (설정 화면에서 사용)
}

/**
 * 역할 선택 화면
 * - 앱 최초 실행 시 또는 설정 화면에서 역할 변경 시 사용
 * - 기기 역할을 선택하고 localStorage에 저장
 */
const RoleSelection: React.FC<RoleSelectionProps> = ({ 
  onRoleSelected, 
  showBackButton = false,
  onBack 
}) => {
  const { user, setDeviceRole } = useApp();
  const navigate = useNavigate();

  // 로그인되지 않았으면 로그인 화면으로 이동
  if (!user) {
    return null; // App.tsx에서 이미 ProtectedRoute로 보호됨
  }

  // 역할 선택 핸들러
  const handleRoleSelect = (role: 'PARENT' | 'CHILD') => {
    setDeviceRole(role);
    
    // 토스트 메시지와 함께 역할에 따라 적절한 화면으로 이동
    if (role === 'PARENT') {
      // 보호자 기기: 보호자 홈으로 이동
      navigate('/parent', { 
        replace: true,
        state: { toastMessage: '이 기기의 역할이 보호자로 변경됐어요' }
      });
    } else {
      // 아이 기기: 기본 자녀 선택 또는 첫 번째 자녀로 이동
      const defaultChildId = localStorage.getItem('defaultChildId');
      let targetPath = '/parent';
      
      // 부모 → 아이 역할 전환 시에만 Toast 메시지 표시
      const isRoleSwitch = user.role === 'PARENT';
      const toastMessage = isRoleSwitch ? '아이 화면으로 전환했어요 👧' : undefined;
      
      if (user.role === 'PARENT' && user.childrenIds && user.childrenIds.length > 0) {
        // 부모 계정이지만 아이 기기로 설정한 경우: 첫 번째 자녀로 이동
        const firstChildId = defaultChildId || user.childrenIds[0];
        targetPath = `/child/${firstChildId}`;
      } else if (user.role === 'CHILD') {
        // 아이 계정인 경우: 자신의 화면으로 이동
        targetPath = `/child/${user.id}`;
      }
      
      navigate(targetPath, { 
        replace: true,
        state: toastMessage ? { toastMessage, isRoleSwitch: true } : undefined
      });
    }
    
    // 콜백이 있으면 콜백 호출 (설정 화면에서 사용)
    if (onRoleSelected) {
      onRoleSelected();
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFEF9]">
      {/* 뒤로가기 버튼 (설정 화면에서 사용) */}
      {showBackButton && (
        <Header 
          showBackButton={true}
          onBack={onBack}
        />
      )}
      
      <div className="flex items-center justify-center px-5 py-12" style={{ minHeight: showBackButton ? 'calc(100vh - 60px)' : '100vh' }}>
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            {/* 헤더 */}
            <div className="flex flex-col items-center mb-8">
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                이 기기를 누가 주로 사용하나요?
              </h1>
              <p className="text-gray-500 text-sm text-center">
                이 설정은 이 기기에만 적용돼요
              </p>
            </div>

            {/* 역할 선택 버튼 */}
            <div className="space-y-4">
              {/* 보호자 버튼 */}
              <button
                onClick={() => handleRoleSelect('PARENT')}
                className="w-full py-5 bg-blue-500 text-white rounded-2xl font-bold text-xl shadow-lg hover:bg-blue-600 transition-colors active:scale-98 flex items-center justify-center gap-3"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>보호자</span>
              </button>

              {/* 아이 버튼 */}
              <button
                onClick={() => handleRoleSelect('CHILD')}
                className="w-full py-5 bg-yellow-500 text-white rounded-2xl font-bold text-xl shadow-lg hover:bg-yellow-600 transition-colors active:scale-98 flex items-center justify-center gap-3"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>아이</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoleSelection;
