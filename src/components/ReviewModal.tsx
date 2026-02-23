import React from 'react';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReview: () => void;
  onPostpone?: () => void; // 나중에 할게요 클릭 핸들러
}

/**
 * 리뷰 유도 모달 컴포넌트
 * - 부모 사용자에게 앱 평가를 요청하기 위한 UI
 * - 현재는 테스트 용도로 강제 노출
 */
const ReviewModal: React.FC<ReviewModalProps> = ({ isOpen, onClose, onReview, onPostpone }) => {
  if (!isOpen) return null;

  const handleReview = () => {
    onReview();
    // onReview에서 이미 모달을 닫으므로 onClose 호출 불필요
  };

  const handleLater = () => {
    if (onPostpone) {
      onPostpone();
    } else {
      onClose();
    }
  };

  const handleBackgroundClick = () => {
    // 배경 클릭 시 "나중에 할게요"와 동일하게 처리
    handleLater();
  };

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-5"
        onClick={handleBackgroundClick}
      >
        {/* 모달 */}
        <div
          className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 제목 */}
          <h2 className="text-xl font-bold text-gray-800 mb-3 text-center">
            아이랑 약속 관리에 도움이 되었나요?
          </h2>

          {/* 본문 */}
          <p className="text-base text-gray-600 mb-6 text-center">
            짧은 평가가 서비스 개선에 큰 도움이 돼요 🙂
          </p>

          {/* 버튼 영역 */}
          <div className="flex gap-3">
            <button
              onClick={handleLater}
              className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              나중에 할게요
            </button>
            <button
              onClick={handleReview}
              className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors"
            >
              ⭐ 평가하기
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ReviewModal;

