/**
 * Firebase Cloud Functions
 * 
 * 설치 및 배포:
 * 1. npm install -g firebase-tools
 * 2. firebase login
 * 3. firebase init functions
 * 4. firebase deploy --only functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

admin.initializeApp();

/**
 * 미션 승인 시 포인트 적립 처리
 * 
 * 호출 예시:
 * POST https://[region]-[project-id].cloudfunctions.net/approveMission
 * Headers: {
 *   Authorization: Bearer [firebase-auth-token],
 *   Content-Type: application/json
 * }
 * Body: {
 *   missionId: "mission-123"
 * }
 */
exports.approveMission = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    // POST 요청만 허용
    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        error: 'Method Not Allowed. Only POST requests are allowed.',
      });
    }

    try {
      // 인증 체크
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: '인증이 필요합니다.',
        });
      }

      const idToken = authHeader.split('Bearer ')[1];
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: '유효하지 않은 인증 토큰입니다.',
        });
      }

      const { missionId } = req.body;

      if (!missionId) {
        return res.status(400).json({
          success: false,
          error: 'missionId가 필요합니다.',
        });
      }

      const db = admin.firestore();
      const missionRef = db.collection('missions').doc(missionId);
      const missionDoc = await missionRef.get();

      if (!missionDoc.exists) {
        return res.status(404).json({
          success: false,
          error: '미션을 찾을 수 없습니다.',
        });
      }

      const mission = missionDoc.data();

      // 미션 상태 체크
      if (mission.status !== 'SUBMITTED') {
        return res.status(400).json({
          success: false,
          error: '제출된 미션이 아닙니다.',
        });
      }

      // 권한 체크: 부모만 승인 가능
      if (mission.parentId !== decodedToken.uid) {
        return res.status(403).json({
          success: false,
          error: '이 미션을 승인할 권한이 없습니다.',
        });
      }

      // 트랜잭션으로 포인트 적립 및 미션 상태 업데이트
      await db.runTransaction(async (transaction) => {
        // 아이 포인트 업데이트
        const userRef = db.collection('users').doc(mission.childId);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists) {
          throw new Error('사용자를 찾을 수 없습니다.');
        }

        const userData = userDoc.data();
        
        // 아이인지 확인
        if (userData.role !== 'CHILD') {
          throw new Error('아이에게만 포인트를 지급할 수 있습니다.');
        }

        const currentPoints = userData.totalPoint || 0;
        transaction.update(userRef, {
          totalPoint: currentPoints + mission.rewardPoint,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 미션 상태는 클라이언트에서 업데이트하므로 여기서는 처리하지 않음
        // (AppContext의 approveMissionInFirebase에서 처리)
      });

      return res.status(200).json({
        success: true,
      });
    } catch (error) {
      console.error('포인트 적립 실패:', error);
      return res.status(500).json({
        success: false,
        error: '포인트 적립 중 오류가 발생했습니다.',
      });
    }
  });
});

