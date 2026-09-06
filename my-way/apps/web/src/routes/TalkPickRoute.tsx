import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { TopBar } from '@/features/shared/TopBar'
import { RestartButton } from '@/features/shared/RestartButton'
import { loadState, saveState } from '@/lib/storage'
import { EMPTY_TALK, TALK_KEY, spokenTurns, type TalkState } from '@/lib/talk'
import { fetchCharacters, type Character } from '@/lib/talkApi'
import { checkAge, type AgeCheck } from '@/lib/ageGate'
import { AgeBlocked } from '@/features/shared/AgeBlocked'

/**
 * `/talk` — 캐릭터 고르기.
 *
 * 셋의 차이는 **무엇을 궁금해하는지**예요. 조언 방식이 아니라 질문의 각도가 다릅니다.
 * 어느 쪽도 진로를 정해주지 않아요. (CLAUDE.md §1, §7)
 *
 * 목록은 서버에서 받아옵니다. 프롬프트를 화면에 두면 두 벌이 되고, 고치는 곳이
 * 갈라져요. 서버는 **이름·소개·첫 마디만** 내려주고 시스템 프롬프트는 안 내보냅니다.
 *
 * ## 여기가 연령 확인 지점이에요
 *
 * 앱인토스는 **"AI 채팅·상담"** 에 별도 청소년 보호 기준을 둡니다. 저장을 하느냐가
 * 아니라 **무엇을 제공하느냐**가 기준이라, 서버에 아무것도 남기지 않아도 걸려요.
 * 그래서 대화 입구에서 한 번 봅니다. 앞 단계(서술형·명함)는 채팅이 아니라 그대로 둬요.
 */
export function TalkPickRoute() {
  const navigate = useNavigate()
  const [characters, setCharacters] = useState<Character[] | null>(null)
  const [age, setAge] = useState<AgeCheck | null>(null)
  const saved = loadState<TalkState>(TALK_KEY, EMPTY_TALK)
  const inProgress = saved.characterId !== '' && spokenTurns(saved.turns) > 0

  useEffect(() => {
    const controller = new AbortController()
    void checkAge().then(setAge)
    void fetchCharacters(controller.signal).then((list) => setCharacters(list.characters))
    return () => controller.abort()
  }, [])

  /** 새로 시작. 하던 대화가 있으면 지워요 — 캐릭터마다 맥락이 다릅니다. */
  const start = (id: string) => {
    saveState(TALK_KEY, { characterId: id, turns: [] })
    navigate(`/talk/${id}`)
  }

  // 확인이 끝나기 전에는 목록을 안 보여줘요. 눌렀다가 막히면 더 나쁩니다.
  if (age === null) {
    return (
      <div className="page page--result">
        <TopBar title="" />
        <div className="tab-panel">
          <section className="card card--muted">
            <p className="hint">불러오는 중이에요…</p>
          </section>
        </div>
      </div>
    )
  }

  if (age === 'blocked') return <AgeBlocked />

  return (
    <div className="page page--result">
      <TopBar title="누구와 이야기할까요" />

      <div className="tab-panel">
        <section className="card">
          <p className="stage-message">
            성격이 다른 셋 중 하나를 고르면 이야기를 시작해요. 나눈 내용은 이 기기에만
            저장돼요.
          </p>
        </section>

        {/* 하던 게 있으면 맨 위에. 고르는 것보다 이어가는 게 먼저예요. */}
        {inProgress && (
          <section className="card card--ai">
            <h2 className="section-title">하던 이야기가 있어요</h2>
            <p className="stage-message">{spokenTurns(saved.turns)}번 이야기했어요.</p>
            <button
              type="button"
              className="button button--primary button--block"
              onClick={() => navigate(`/talk/${saved.characterId}`)}
            >
              이어서 하기
            </button>
          </section>
        )}

        {characters === null && (
          <section className="card card--muted">
            <p className="hint">불러오는 중이에요…</p>
          </section>
        )}

        {characters !== null && characters.length === 0 && (
          <section className="card card--muted">
            <p className="stage-message">
              지금은 이야기를 시작할 수 없어요. 잠시 뒤에 다시 들러주세요.
            </p>
          </section>
        )}

        {characters?.map((character) => (
          <section className="card" key={character.id}>
            <h2 className="section-title">{character.name}</h2>
            <p className="stage-message">{character.blurb}</p>

            {/*
              이미 다른 캐릭터와 이야기 중이면 **덮어쓰기라는 걸 먼저 알립니다.**
              되돌릴 수 없어요.
            */}
            {inProgress && saved.characterId !== character.id ? (
              <RestartButton
                label={`${character.name}와 새로 시작하기`}
                title="하던 이야기를 지울까요?"
                description="지금까지 나눈 이야기가 지워지고 처음부터 시작해요. 이미 이미지로 저장한 결과지는 기기에 남아요."
                confirmLabel="새로 시작"
                onConfirm={() => start(character.id)}
              />
            ) : (
              <button
                type="button"
                className="button button--ghost button--block"
                onClick={() => start(character.id)}
              >
                이 사람과 이야기하기
              </button>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
