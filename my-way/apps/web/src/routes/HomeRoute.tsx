import { useNavigate } from 'react-router'
import { TopBar } from '@/features/shared/TopBar'
import { RestartButton } from '@/features/shared/RestartButton'
import { questions } from '@/lib/content'
import { clearAllState, hasAnyState, loadState } from '@/lib/storage'
import { EMPTY_RESPONSES, RESPONSES_KEY, type ResponsesState } from '@/lib/responses'

/**
 * `/` — 첫 화면.
 *
 * 트랙 선택이 없어졌어요. **하나의 흐름만 있습니다.**
 *
 * ```
 * 1. 서술형 다섯 개      /ask
 * 2. 칭호 붙은 명함      /card
 * 3. 캐릭터와 대화       /talk
 * 4. 인상 결과지         /note
 * ```
 *
 * 여기서는 **무엇을 얻게 되는지**만 말하고 바로 시작하게 해요. 설명이 길면
 * 시작 전에 나갑니다.
 */
export function HomeRoute() {
  const navigate = useNavigate()

  const answered = loadState<ResponsesState>(RESPONSES_KEY, EMPTY_RESPONSES).answers.length
  const started = answered > 0
  const done = answered >= questions.length

  return (
    <div className="page page--result">
      <TopBar title="" />

      <div className="tab-panel">
        <section className="card">
          <h1 className="section-title">나를 한 줄로 말한다면</h1>
          <p className="stage-message">
            가벼운 질문 {questions.length}개에 답하면, 답한 내용을 재구성해서 명함에 넣을 칭호를
            만들어 드려요. 이미지로 저장할 수 있어요.
          </p>
          <p className="note-meta">
            정답이 없는 질문이에요. 점수를 매기거나 유형으로 나누지 않아요.
          </p>
        </section>

        <button
          type="button"
          className="button button--primary button--block"
          onClick={() => navigate('/ask')}
        >
          {started ? '이어서 답하기' : '시작하기'}
        </button>

        {/* 명함까지 만들어 둔 사람은 바로 갈 수 있게. */}
        {done && (
          <button
            type="button"
            className="button button--ghost button--block"
            onClick={() => navigate('/card')}
          >
            내 명함 보기
          </button>
        )}

        {/*
          "내 데이터 삭제" 경로는 앱 안에 반드시 노출합니다. (db-plan.md)
          지울 게 있을 때만 보여줘요 — 빈 상태에서 떠 있으면 눌러도 아무 일이 안 납니다.
        */}
        {hasAnyState() && (
          <RestartButton
            label="입력한 내용 전부 지우기"
            title="전부 지울까요?"
            description="답변과 명함이 모두 지워지고 처음으로 돌아가요. 되돌릴 수 없어요."
            confirmLabel="지우기"
            variant="text"
            onConfirm={() => {
              clearAllState()
              navigate('/', { replace: true })
            }}
          />
        )}
      </div>
    </div>
  )
}
