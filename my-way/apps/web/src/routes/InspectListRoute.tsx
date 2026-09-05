import { useNavigate } from 'react-router'
import { TopBar } from '@/features/shared/TopBar'
import { InspectResults } from '@/features/inspect/InspectResults'
import { TRACK_TESTS } from '@/lib/inspectMeta'
import { detectTrack } from '@/lib/track'
import { loadState } from '@/lib/storage'
import { behavior, teen, narrative } from '@/lib/content'
import type { FlowAnswer } from '@/features/shared/QuestionFlow'
import { TEEN_STORAGE_KEY } from '@/features/teen/TeenFlow'
import { NARRATIVE_STORAGE_KEY } from '@/features/jobseekerNarrative/NarrativeFlow'

/**
 * 검사 입구 — 자체 체크리스트와 커리어넷 공인 검사를 한 화면에 모아요.
 *
 * 화면마다 검사 버튼을 하나씩 늘어놓으면 길어지고 곁다리처럼 보입니다.
 * **입구를 하나로 모으고** 여기서 고르게 했어요.
 *
 * ## 두 출처를 섞지 않습니다
 *
 * 체크리스트는 **자체 문항**(행동 확인)이고 커리어넷은 **공인 검사**(측정)예요.
 * `CLAUDE.md §1` 이 갈라 둔 구분이라 한 화면에 놓되 **카드를 나누고 배지로 구분**합니다.
 * 사용자가 어느 쪽이 공인 점수인지 알 수 있어야 해요. (§7)
 *
 * 트랙은 저장된 답변으로 되짚습니다(`detectTrack`). 중·고등학생은 고등학생
 * 기준(25·36), 대학생·취준생은 6·8이에요.
 */
export function InspectListRoute() {
  const navigate = useNavigate()
  const track = detectTrack()
  const tests = track === 'jobseeker' ? TRACK_TESTS.jobseeker_narrative : TRACK_TESTS.teen

  const checklist = loadState<{ checked: string[]; submitted?: boolean }>(
    'track:jobseeker_behavior',
    { checked: [] },
  )
  const checklistDone = checklist.checked.length > 0

  /*
   * 워밍업만 하고 명함으로 빠지면 **남은 서술 문항으로 돌아올 길이 없었어요.**
   * 여기서도 이어서 할 수 있게 남은 개수를 세어 둡니다.
   */
  const storyKey = track === 'jobseeker' ? NARRATIVE_STORAGE_KEY : TEEN_STORAGE_KEY
  const storyIds =
    track === 'jobseeker'
      ? narrative.items.map((item) => item.id)
      : teen.items.map((item) => String(item.id))
  const storyPath = track === 'jobseeker' ? '/chat/jobseeker_narrative' : '/chat/teen'

  /*
   * **답한 키를 대조해서** 남은 개수를 셉니다.
   *
   * `총계 - answers.length` 로 세면 예전 세션에 답해둔 게 섞였을 때 0 이 되어
   * 카드가 통째로 숨었어요. 실제로 "6~12번으로 갈 버튼이 없다"는 문제가 이거였습니다.
   */
  const answered = new Set(
    loadState<{ answers: FlowAnswer[] }>(storyKey, { answers: [] }).answers.map((a) => a.key),
  )
  const storyTotal = storyIds.length
  const storyDone = storyIds.filter((id) => answered.has(id)).length
  const storyLeft = storyTotal - storyDone

  return (
    <div className="page page--result">
      <TopBar title="진로 검사" />

      <div className="tab-panel">
        <section className="card">
          <p className="stage-message">
            지금까지 답한 것과 별개로, 진로를 더 들여다보는 방법이 있어요. 문항이 많으니 중간에
            나가도 이어서 할 수 있어요.
          </p>
        </section>

        {/*
          서술 문답 입구. **남은 게 있으면 무조건 보여줍니다.**
          워밍업만 하고 명함으로 빠지면 6번부터를 볼 길이 없었어요. 조건을 좁게 걸면
          또 숨을 수 있어서, "남았는가" 하나만 봅니다.
        */}
        <section className="card">
          <h2 className="section-title">
            {storyLeft === 0
              ? '이야기 다시 보기'
              : storyDone > 0
                ? '하던 이야기 마저 하기'
                : '이야기 정리하기'}
          </h2>
          <p className="stage-message">
            {storyLeft === 0
              ? `${storyTotal}개를 다 답했어요. 앞뒤로 오가며 고쳐 쓸 수 있어요.`
              : storyDone > 0
                ? `${storyTotal}개 중 ${storyDone}개까지 답했어요. ${storyLeft}개가 남았어요.`
                : `${storyTotal}개 문항으로 생각을 정리해요. 답할수록 명함 칭호 재료가 쌓여요.`}
          </p>
          <button
            type="button"
            className="button button--ghost button--block"
            onClick={() => navigate(storyPath)}
          >
            {storyLeft === 0 ? '다시 보기' : storyDone > 0 ? '이어서 답하기' : '시작하기'}
          </button>
        </section>

        {/* 자체 문항 — 대학생·취준생 트랙에만 있어요. 배지를 붙이지 않습니다. */}
        {track === 'jobseeker' && (
          <section className="card">
            <h2 className="section-title">취업 준비 체크리스트</h2>
            <p className="stage-message">
              지금까지 어떤 준비를 해왔는지 짚어보면 뭐가 막혀 있는지 보여요.{' '}
              {behavior.items.length}개를 체크만 하면 돼요.
            </p>
            <p className="note-meta">
              점수를 매기지 않아요. 해본 것과 안 해본 것을 정리해서 되돌려줘요.
            </p>
            <button
              type="button"
              className="button button--ghost button--block"
              onClick={() =>
                navigate(checklistDone ? '/result/jobseeker_behavior' : '/chat/jobseeker_behavior')
              }
            >
              {checklistDone ? '결과 다시 보기' : '체크리스트 해보기'}
            </button>
          </section>
        )}

        {/* 공인 검사 — 배지가 붙어 있어요. */}
        <InspectResults tests={tests} onStart={(q) => navigate(`/inspect/${q}`)} />
      </div>
    </div>
  )
}
