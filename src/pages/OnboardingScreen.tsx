import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const SLIDE_COUNT = 3;

const OnboardingScreen: React.FC = () => {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  const goNext = () => {
    if (index < SLIDE_COUNT - 1) {
      setIndex((i) => i + 1);
    } else {
      navigate('/signup');
    }
  };

  const handleSkip = () => {
    navigate('/signup');
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;
    if (diff > threshold && index < SLIDE_COUNT - 1) {
      setIndex((i) => i + 1);
    } else if (diff < -threshold && index > 0) {
      setIndex((i) => i - 1);
    }
  };

  return (
    <div className="min-h-screen overflow-y-auto max-w-[420px] mx-auto bg-white flex flex-col">
      {/* 상단 스킵 */}
      <div className="flex justify-end px-6 pt-4">
        <button
          type="button"
          onClick={handleSkip}
          className="text-xs text-gray-400 mr-1 active:scale-95 transition"
        >
          건너뛰기
        </button>
      </div>

      {/* 슬라이드 영역: 남는 공간 중앙 정렬, 가로 슬라이드 overflow 숨김 */}
      <div className="flex-1 overflow-hidden flex flex-col items-center justify-center px-6 text-center">
        <div
          className="flex w-full transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* 슬라이드 1 — 문제 공감 */}
          <div className="w-full flex-shrink-0 flex flex-col items-center justify-center px-4">
            <img
              src="/app-icon.png"
              alt=""
              className="w-24 h-24 mb-6 rounded-2xl object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  parent.innerHTML = '<span class="text-5xl">👶</span>';
                }
              }}
            />
            <h2 className="text-lg font-semibold mb-3 text-gray-900">
              아이에게 용돈을 그냥 주고 계신가요?
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto break-keep">
              돈의 가치를 배우지 못하면
              <br />
              용돈은 소비로 끝납니다.
              <br />
              지금부터 바꿔보세요.
            </p>
          </div>

          {/* 슬라이드 2 — 해결 방식 (사진 인증 강조) */}
          <div className="w-full flex-shrink-0 flex flex-col items-center justify-center px-4">
            <div className="w-24 h-24 mb-6 rounded-3xl bg-blue-50 flex items-center justify-center shadow-md">
              <span className="text-4xl" aria-hidden>📸</span>
            </div>
            <h2 className="text-lg font-semibold mb-3 text-gray-900">
              미션 + 사진 인증 + 부모 승인
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto break-keep">
              아이는 미션을 수행하고,
              <br />
              사진으로 인증한 뒤
              <br />
              부모 승인 후 포인트를 받아요.
            </p>
          </div>

          {/* 슬라이드 3 — 결과 + 행동 유도 */}
          <div className="w-full flex-shrink-0 flex flex-col items-center justify-center px-4">
            <div className="w-24 h-24 mb-6 rounded-3xl bg-purple-50 flex items-center justify-center shadow-md">
              <span className="text-4xl" aria-hidden>📊</span>
            </div>
            <h2 className="text-lg font-semibold mb-3 text-gray-900">
              자녀별 성장 리포트를 확인하세요
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto break-keep">
              월별 통계와 활동 기록으로
              <br />
              아이의 변화를 한눈에 확인할 수 있어요.
            </p>
          </div>
        </div>
      </div>

      {/* 하단 인디케이터 */}
      <div className="pb-2 px-6">
        <div className="flex justify-center gap-2 mb-2">
        {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-300 ${
              i === index
                ? 'w-6 h-2 bg-purple-500'
                : 'w-2 h-2 bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>

      {/* 하단 CTA */}
      <div className="pb-6 px-6">
        {index < SLIDE_COUNT - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="w-full mt-1 h-12 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium active:scale-95 transition"
          >
            다음
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="w-full mt-1 h-12 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-500 text-white text-sm font-semibold shadow-lg active:scale-95 transition"
          >
            무료로 시작하기
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingScreen;
