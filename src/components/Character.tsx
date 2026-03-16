import React from 'react';

interface CharacterProps {
  size?: 'small' | 'medium' | 'large' | 'icon' | 'card' | 'cardSmall';
  className?: string;
  showSpeechBubble?: boolean;
  speechText?: string;
  gender?: 'male' | 'female'; // 성별에 따른 아이콘 분기
}

/**
 * 앱 메인 캐릭터 컴포넌트
 * 
 * 이미지에 말풍선이 포함되어 있으므로 별도 말풍선은 표시하지 않습니다.
 * 
 * 사용 예시:
 * - <Character size="medium" /> // 기본 사용
 * - <Character size="small" /> // 작은 크기
 */
const Character: React.FC<CharacterProps> = ({ 
  size = 'medium', 
  className = '',
  showSpeechBubble = false, // 더 이상 사용하지 않음 (이미지에 포함됨)
  speechText = '용돈 주세요', // 더 이상 사용하지 않음
  gender // 성별에 따른 아이콘 분기
}) => {
  // 크기별 스타일 정의
  const sizeClasses = {
    small: 'w-12 h-12',
    medium: 'w-20 h-20',
    large: 'w-32 h-32',
    icon: 'w-16 h-16',
    card: 'w-[60px] h-[60px]',
    cardSmall: 'w-14 h-14',
  };

  // 성별에 따른 이미지 경로 결정
  // gender가 undefined이거나 'male'이 아니면 기본값으로 'female' (girl.png) 사용
  // 기존 데이터에 gender 필드가 없는 경우도 안전하게 처리
  const characterImage = gender === 'male' 
    ? '/boy.png' 
    : '/girl.png'; // gender === 'female' 또는 gender === undefined 또는 기타 값일 때 모두 girl.png 사용

  return (
    <div className={`relative ${className}`}>
      {/* 캐릭터 이미지 (말풍선 포함) */}
      <div className={`${sizeClasses[size]} rounded-2xl overflow-hidden flex items-center justify-center`}>
        <img 
          src={characterImage}
          alt="채이 캐릭터"
          className="w-full h-full object-cover rounded-2xl"
          onError={(e) => {
            // 이미지 로드 실패 시 대체 UI (개발 중)
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = `
                <div class="w-full h-full flex items-center justify-center bg-yellow-200 rounded-2xl">
                  <span class="text-2xl">👶</span>
                </div>
              `;
            }
          }}
        />
      </div>
    </div>
  );
};

export default Character;

