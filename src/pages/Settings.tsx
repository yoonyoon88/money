import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Header from '../components/Header';
import RoleSelection from '../components/RoleSelection';

/**
 * 설정 화면
 * - 역할 변경 기능 포함
 */
const Settings: React.FC = () => {
  const { user, deviceRole } = useApp();
  const navigate = useNavigate();
  const [showRoleSelection, setShowRoleSelection] = useState(false);

  // 역할 변경 버튼 클릭 핸들러 - 즉시 역할 선택 화면으로 이동
  const handleRoleChangeClick = () => {
    setShowRoleSelection(true);
  };

  // 역할 선택 화면 닫기 핸들러
  const handleCloseRoleSelection = () => {
    setShowRoleSelection(false);
  };

  // 역할 선택 화면 표시
  if (showRoleSelection) {
    return (
      <RoleSelection 
        onRoleSelected={handleCloseRoleSelection}
        showBackButton={true}
        onBack={handleCloseRoleSelection}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFEF9] pb-8">
      <Header />
      
      {/* 설정 메뉴 */}
      <div className="px-5 mt-6">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* 역할 변경 메뉴 */}
          <button
            onClick={handleRoleChangeClick}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <svg 
                  className="w-5 h-5 text-blue-600" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" 
                  />
                </svg>
              </div>
              <div className="text-left">
                <h3 className="text-base font-semibold text-gray-800">
                  이 기기의 기본 역할 변경
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  현재: {deviceRole === 'PARENT' ? '보호자' : deviceRole === 'CHILD' ? '아이' : '미설정'}
                </p>
              </div>
            </div>
            <svg 
              className="w-5 h-5 text-gray-400" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M9 5l7 7-7 7" 
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;

