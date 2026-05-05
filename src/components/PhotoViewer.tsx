import React from 'react';

interface PhotoViewerProps {
  url: string;
  onClose: () => void;
}

const PhotoViewer: React.FC<PhotoViewerProps> = ({ url, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
      onClick={onClose}
    >
      {/* 닫기 버튼 */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        aria-label="닫기"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* 이미지 */}
      <img
        src={url}
        alt="미션 인증 사진"
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
};

export default PhotoViewer;
