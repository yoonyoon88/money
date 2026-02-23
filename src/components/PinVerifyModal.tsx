import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';

interface PinVerifyModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

/**
 * PIN 검증 모달 컴포넌트
 * 
 * 사용 예시:
 * ```tsx
 * <PinVerifyModal
 *   isOpen={showModal}
 *   onSuccess={() => {
 *     // PIN 검증 성공 시 실행할 로직
 *     handleDeleteChild();
 *     setShowModal(false);
 *   }}
 *   onCancel={() => setShowModal(false)}
 *   title="PIN 입력"
 *   description="자녀를 삭제하려면 PIN을 입력해주세요"
 * />
 * ```
 */
const PinVerifyModal: React.FC<PinVerifyModalProps> = ({
  isOpen,
  onSuccess,
  onCancel,
  title = 'PIN 입력',
  description = 'PIN을 입력해주세요',
}) => {
  const { user } = useApp();
  const [pin, setPin] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Firestore에서 PIN 가져오기
  const getStoredPin = (): string | null => {
    if (user && user.role === 'PARENT' && user.parentPin) {
      return user.parentPin;
    }
    return null;
  };

  // PIN 검증
  const validatePin = (enteredPin: string): boolean => {
    const storedPin = getStoredPin();
    if (!storedPin) {
      setError('PIN이 설정되지 않았습니다.');
      return false;
    }
    return enteredPin === storedPin;
  };

  // PIN 초기화 함수
  const handleResetPin = () => {
    setPin(['', '', '', '']);
    setError(null);
    // 첫 번째 입력 필드에 포커스
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 0);
  };

  // PIN 입력 핸들러
  const handlePinChange = (index: number, value: string) => {
    // 숫자만 허용
    if (value && !/^\d$/.test(value)) {
      return;
    }

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    setError(null);

    // 다음 입력 필드로 포커스 이동
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // 4자리 모두 입력되면 자동 검증
    if (newPin.every(digit => digit !== '') && newPin.join('').length === 4) {
      const enteredPin = newPin.join('');
      if (validatePin(enteredPin)) {
        // PIN이 맞으면 성공 콜백 호출
        onSuccess();
        // 상태 초기화
        setPin(['', '', '', '']);
        setError(null);
      } else {
        // PIN이 틀리면 에러 메시지 표시 및 PIN 초기화
        setError('PIN 번호를 확인해주세요');
        setPin(['', '', '', '']);
        // 첫 번째 입력 필드에 포커스
        setTimeout(() => {
          inputRefs.current[0]?.focus();
        }, 0);
      }
    }
  };

  // 백스페이스 처리
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // ESC 키로 모달 닫기
  const handleKeyDownModal = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  // 모달이 열릴 때 첫 번째 입력 필드에 포커스 및 상태 초기화
  useEffect(() => {
    if (isOpen) {
      setPin(['', '', '', '']);
      setError(null);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [isOpen]);

  // 모달이 열려있지 않으면 렌더링하지 않음
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-black bg-opacity-50"
      onClick={onCancel}
      onKeyDown={handleKeyDownModal}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="닫기"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* 헤더 */}
        <div className="flex flex-col items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {title}
          </h2>
          <p className="text-gray-600 text-sm text-center">
            {description}
          </p>
        </div>

        <div className="space-y-4">
          {/* PIN 입력 필드 */}
          <div className="flex justify-center gap-3">
            {pin.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handlePinChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className={`w-16 h-16 text-center text-2xl font-bold border-2 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors ${
                  error
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-300'
                }`}
              />
            ))}
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-red-600 text-sm text-center font-medium">{error}</p>
            </div>
          )}

          {/* PIN 초기화 버튼 */}
          <button
            onClick={handleResetPin}
            className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
          >
            PIN 초기화
          </button>

          {/* 취소 버튼 */}
          <button
            onClick={onCancel}
            className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
};

export default PinVerifyModal;

