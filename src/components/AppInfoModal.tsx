import React from 'react';

interface AppInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 앱 정보 보기 모달 컴포넌트
 * - 공유 후 사용자에게만 노출되는 간단한 설명 화면
 */
const AppInfoModal: React.FC<AppInfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-5"
        onClick={onClose}
      >
        {/* 모달 */}
        <div
          className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 제목 */}
          <h2 className="text-xl font-bold text-gray-800 mb-4 text-center">
            아이와 약속을 지키는 방법
          </h2>

          {/* 본문 */}
          <div className="text-base text-gray-700 mb-6 text-center leading-relaxed">
            <p className="mb-3">
              이 앱은
              <br />
              아이와 함께 약속을 정하고,
              <br />
              지키는 과정을 기록하는 도구예요.
            </p>
            <p>
              보상을 강요하지 않고
              <br />
              가족이 함께 기준을 정하도록 돕습니다.
            </p>
          </div>

          {/* 닫기 버튼 */}
          <button
            onClick={onClose}
            className="w-full py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </>
  );
};

export default AppInfoModal;

