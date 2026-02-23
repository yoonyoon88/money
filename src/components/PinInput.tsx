import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import Character from './Character';
import PinResetModal from './PinResetModal';

interface PinInputProps {
  onSuccess: () => void;
  onCancel?: () => void;
  title?: string;
  description?: string;
  isModal?: boolean; // 모달 모드 여부
}

const PinInput: React.FC<PinInputProps> = ({ 
  onSuccess, 
  onCancel,
  title = 'PIN 입력',
  description = '부모 기능에 접근하려면 PIN을 입력해주세요',
  isModal = false
}) => {
  const { user } = useApp();
  const [pin, setPin] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [failureCount, setFailureCount] = useState(0); // 실패 횟수 추적
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

  // PIN 자동 초기화 함수 (실패 시 자동 호출)
  const resetPinInput = () => {
    setPin(['', '', '', '']);
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
        // PIN이 맞으면 실패 횟수 초기화하고 성공 처리
        setFailureCount(0);
        onSuccess();
      } else {
        // PIN이 틀리면 실패 횟수 증가
        const newFailureCount = failureCount + 1;
        setFailureCount(newFailureCount);
        
        // 5회 실패 시 재설정 유도
        if (newFailureCount >= 5) {
          setError('PIN을 5회 잘못 입력하셨어요.\n보안을 위해 PIN 재설정이 필요해요');
        } else {
          // 5회 미만 실패 시 남은 횟수 안내
          const remainingAttempts = 5 - newFailureCount;
          setError(`PIN 번호가 맞지 않아요\n(남은 시도 횟수: ${remainingAttempts}회)`);
        }
        
        // PIN 자동 초기화
        resetPinInput();
      }
    }
  };

  // 백스페이스 처리
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // 첫 번째 입력 필드에 포커스
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // 뒤로가기 처리: 취소 버튼과 동일하게 역할선택 화면으로 이동
  useEffect(() => {
    if (!onCancel) {
      return;
    }

    // 히스토리에 현재 상태 추가 (뒤로가기 감지용)
    // 이렇게 하면 뒤로가기 시 popstate 이벤트가 발생하고, 
    // 이 컴포넌트가 마운트되어 있는 동안 뒤로가기를 감지할 수 있음
    window.history.pushState({ pinInput: true, from: 'pin-input' }, '');

    const handlePopState = () => {
      // 뒤로가기 발생 시 onCancel 호출하여 역할선택 화면으로 복귀
      onCancel();
    };

    // 브라우저 뒤로가기 이벤트 처리
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // cleanup: 컴포넌트 언마운트 시 히스토리 상태 복원 (필요한 경우)
      // 하지만 onCancel이 호출되면 RoleSelection에서 showPinInput을 false로 설정하므로
      // 자동으로 정리됨
    };
  }, [onCancel]);

  const content = (
    <>
      <div className="flex flex-col items-center mb-6">
        <Character size="large" />
        <h1 className="text-2xl font-bold text-gray-800 mt-4 mb-2">
          {title}
        </h1>
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
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handlePinChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              disabled={failureCount >= 5}
              className={`w-16 h-16 text-center text-2xl font-bold border-2 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors ${
                failureCount >= 5
                  ? 'border-gray-200 bg-gray-100 cursor-not-allowed'
                  : error 
                    ? 'border-red-300 bg-red-50' 
                    : 'border-gray-300'
              }`}
              autoComplete="off"
            />
          ))}
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-red-600 text-sm text-center font-medium whitespace-pre-line">{error}</p>
          </div>
        )}

        {/* PIN 재설정 버튼 (5회 실패 시 강조) */}
        <button
          onClick={() => setShowResetModal(true)}
          className={`w-full py-3 rounded-xl font-medium transition-colors ${
            failureCount >= 5
              ? 'bg-red-500 text-white hover:bg-red-600 shadow-md'
              : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          }`}
        >
          {failureCount >= 5 ? 'PIN 재설정하기' : 'PIN 재설정'}
        </button>

        {/* 취소 버튼 */}
        {onCancel && (
          <button
            onClick={onCancel}
            className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
          >
            취소
          </button>
        )}
      </div>

      {/* PIN 재설정 모달 */}
      <PinResetModal
        isOpen={showResetModal}
        onSuccess={() => {
          setShowResetModal(false);
          // 재설정 완료 후 실패 횟수 초기화하고 부모 화면으로 바로 진입
          setFailureCount(0);
          // onSuccess 호출하여 부모 화면으로 이동 (RoleSelection의 handlePinSuccess가 처리)
          onSuccess();
        }}
        onCancel={() => setShowResetModal(false)}
      />
    </>
  );

  // 모달 모드일 때는 내용만 반환 (외부 래퍼는 ParentDashboard에서 처리)
  if (isModal) {
    return <>{content}</>;
  }

  // 전체 화면 모드 (기존 동작)
  return (
    <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center px-5">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {content}
        </div>
      </div>
    </div>
  );
};

export default PinInput;
