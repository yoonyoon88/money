import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../firebase/config';

/**
 * 이메일/비밀번호 로그인 계정에 대해 현재 비밀번호를 재검증하는 유틸.
 *
 * - 항상 auth.currentUser.email을 사용 (입력값/Firestore 값 사용 금지)
 * - 비밀번호는 어떠한 가공도 하지 않고 그대로 사용
 * - provider mismatch, 네트워크 오류 등 Firebase 에러코드를 분기 처리
 * - 개발환경(import.meta.env.DEV)에서만 상세 로그 출력
 */
export async function reauthenticatePasswordUser(password: string): Promise<void> {
  const user = auth?.currentUser || null;

  if (import.meta.env.DEV) {
    console.log('[PIN RESET] reauth start', {
      uid: user?.uid,
      email: user?.email,
      providers: user?.providerData?.map((p) => p.providerId),
    });
  }

  if (!user) {
    throw new Error('로그인 정보가 없습니다. 다시 로그인 후 시도해주세요.');
  }

  if (!user.email) {
    throw new Error('계정 이메일 정보를 불러올 수 없습니다.');
  }

  const hasPasswordProvider = Array.isArray(user.providerData)
    && user.providerData.some((provider) => provider.providerId === 'password');

  if (!hasPasswordProvider) {
    throw new Error('이 계정은 이메일 비밀번호 로그인 계정이 아닙니다.');
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);

    if (import.meta.env.DEV) {
      console.log('[PIN RESET] reauth success', { uid: user.uid });
    }
  } catch (error: any) {
    if (import.meta.env.DEV) {
      console.error('[PIN RESET] reauth failed', {
        code: error?.code,
        message: error?.message,
      });
    }

    switch (error?.code) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        throw new Error('현재 비밀번호가 올바르지 않습니다.');
      case 'auth/too-many-requests':
        throw new Error('시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
      case 'auth/network-request-failed':
        throw new Error('네트워크 연결이 불안정합니다. 다시 시도해주세요.');
      case 'auth/user-mismatch':
        throw new Error(
          '현재 로그인 계정 정보가 일치하지 않습니다. 다시 로그인 후 시도해주세요.'
        );
      default:
        throw new Error('비밀번호 확인 중 오류가 발생했습니다.');
    }
  }
}


