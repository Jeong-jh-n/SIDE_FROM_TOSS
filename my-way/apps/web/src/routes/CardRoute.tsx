import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TopBar } from '@/features/shared/TopBar'
import { drawCard, toPngDataUrl } from '@/lib/cardCanvas'
import { saveImage } from '@/lib/toss'
import { clearState, loadState, saveState } from '@/lib/storage'
import { RestartButton } from '@/features/shared/RestartButton'
import { CARD_THEMES } from '@/features/card/themes'
import { CARD_INFO_META, type CardData, type CardInfo, type CardInfoKey } from '@/features/card/types'
import { fetchTaglines, type AiTrack, type FeedbackEntry } from '@/lib/aiApi'
import { useNavigate } from 'react-router'
import aiMarkSrc from '@/assets/aiMark.png'
import { promptsByKey, supportFlagged } from '@/lib/content'
import { containsRiskSignal } from '@/lib/safety'
import { EMPTY_RESPONSES, RESPONSES_KEY, type ResponsesState } from '@/lib/responses'

const STORAGE_KEY = 'card'
const INFO_KEYS = Object.keys(CARD_INFO_META) as CardInfoKey[]

interface Saved {
  info: CardInfo
  themeId: string
  name: string
  /** 직접 적은 칭호. 자유롭게 고칠 수 있어요. */
  tagline: string
  /**
   * AI가 만든 칭호. **직접 고칠 수 없어요.**
   *
   * 뽑아서 얻는 것이지 편집하는 게 아니에요. 마음에 안 들면 다시 뽑으면 됩니다.
   * 명함에는 앞에 마크가 붙어서 직접 쓴 칭호와 구분됩니다.
   */
  aiTagline: string
  /** 명함에 어느 쪽을 쓸지. */
  taglineSource: 'self' | 'ai'
}

const EMPTY: Saved = {
  info: { desiredCareer: '', strengths: '', hobby: '' },
  themeId: CARD_THEMES[0].id,
  name: '',
  tagline: '',
  aiTagline: '',
  taglineSource: 'self',
}

/** 아무것도 안 적었을 때 명함에 실제로 찍히는 문구. */
const DEFAULT_TAGLINE = '나만의 길을 찾는 중'

/** 입력란 안내. 다른 항목들과 같은 `예:` 형식을 씁니다. */
const TAGLINE_PLACEHOLDER = `예: ${DEFAULT_TAGLINE}`

/**
 * 저장된 값을 지금 구조에 맞춰 채워요.
 *
 * `loadState` 는 **얕은 병합**이라(`{...fallback, ...parsed}`) 중첩된 `info` 는
 * 저장된 것이 통째로 fallback 을 덮습니다. 필드 이름을 바꾼 뒤에는 예전 값이
 * 그대로 들어와 `saved.info.hobby` 가 `undefined` 가 되고, `.trim()` 에서 터져요.
 *
 * 실제로 `hobbies` → `hobby` 로 바꾼 뒤 명함 화면이 흰 화면이 됐습니다.
 * 구조를 또 바꿀 수 있으니 방어적으로 채워 둡니다.
 */
export function normalize(saved: Partial<Saved> | null | undefined): Saved {
  const info = (saved?.info ?? {}) as Partial<CardInfo> & {
    /** 옛 이름들. 필드를 `hobbies` → `hobby1`/`hobby2` → `hobby` 로 바꿔 왔어요. */
    hobbies?: string
    hobby1?: string
    hobby2?: string
  }

  /*
   * 옛 이름으로 저장된 취미를 **이월합니다.**
   *
   * 그냥 버리면 사용자가 적어둔 값이 조용히 사라지고 태그가 안 뜹니다.
   * 실제로 그렇게 보였어요. 새 이름이 비어 있을 때만 옛 값을 씁니다.
   */
  const hobby = info.hobby || info.hobby1 || info.hobbies?.split(/[,/]/)[0]?.trim() || ''

  return {
    info: {
      desiredCareer: info.desiredCareer ?? '',
      strengths: info.strengths ?? '',
      hobby,
    },
    themeId: saved?.themeId ?? EMPTY.themeId,
    name: saved?.name ?? '',
    tagline: saved?.tagline ?? '',
    aiTagline: saved?.aiTagline ?? '',
    taglineSource: saved?.taglineSource ?? 'self',
  }
}

/**
 * 문답 응답을 칭호 재료로 모아요.
 *
 * 정서 신호가 걸린 문항(`supportFlag`)과 위험 신호가 있는 응답은 **재료에서 뺍니다.**
 * 그 말을 근거로 칭호를 지어내면 안 돼요. (CLAUDE.md §8)
 *
 * 실제로 "우울증" 이라고 답한 사례에서 **"우울증 탐구자" 라는 칭호가 만들어진 적이
 * 있습니다.** 그래서 두 겹으로 겁니다 — 문항 단위(`supportFlagged`)와 내용 단위
 * (`containsRiskSignal`).
 */
function collectMaterial(): { entries: FeedbackEntry[]; track: AiTrack; wrote: boolean } {
  const { answers } = loadState<ResponsesState>(RESPONSES_KEY, EMPTY_RESPONSES)

  // 한 글자라도 썼는지. 재료가 없는 이유를 가리는 데 씁니다(아래 handleTagline).
  const wrote = answers.some((a) => !a.skipped && a.text.trim() !== '')

  const entries = answers
    .filter(
      (a) =>
        !a.skipped &&
        a.text.trim() !== '' &&
        !supportFlagged.has(a.key) &&
        !containsRiskSignal(a.text),
    )
    .map((a) => ({ question: promptsByKey.get(a.key) ?? '', answer: a.text }))
    .filter((entry) => entry.question !== '')

  // 원패턴이라 어투는 하나예요. 해요체를 씁니다. (WarmupRoute 의 TONE 과 같은 이유)
  return { entries, track: 'jobseeker', wrote }
}

/**
 * `/card` — 가상 명함 생성.
 *
 * 자체 완결형이에요. 필요한 값을 이 화면에서 직접 받고, canvas로 그려 PNG로 저장해요.
 * 검사·문답 결과에 의존하지 않으므로 단발성으로도 만들 수 있어요.
 *
 * 이름·나이 등은 토스 로그인에서 가져올 수 있지만, 서버가 authorizationCode를
 * 교환해야 해서 지금은 직접 입력받아요. (lib/toss.ts 참조)
 */
export function CardRoute() {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [saved, setSaved] = useState<Saved>(() => normalize(loadState(STORAGE_KEY, EMPTY)))
  const [notice, setNotice] = useState('')
  const [taglineBusy, setTaglineBusy] = useState(false)
  const [taglineNote, setTaglineNote] = useState('')

  /** 문답 응답이 있어야 칭호를 뽑을 수 있어요. */
  const material = useMemo(() => collectMaterial(), [])

  /**
   * 칭호를 새로 뽑아요.
   *
   * **결과를 확정하지 않습니다.** 입력란에 채워 넣을 뿐이라 사용자가 고치거나
   * 지울 수 있어요. 판정은 못 고치지만 제안은 고칠 수 있습니다. (CLAUDE.md §7)
   */
  const handleTagline = useCallback(async () => {
    /*
     * 쓰긴 썼는데 **전부 위험·정서 신호라** 재료가 없는 경우.
     *
     * 빈 목록을 보내면 서버가 '침묵자' 를 돌려주는데, 힘든 말을 적은 사람에게
     * 농담을 주는 꼴이 됩니다. 아무 말도 안 한 것과는 달라요. (WarmupRoute 와 같은 판단)
     */
    if (material.wrote && material.entries.length === 0) {
      setTaglineNote('지금은 문구를 만들지 못했어요. 직접 적어도 돼요.')
      return
    }

    setTaglineBusy(true)
    setTaglineNote('')
    const candidates = await fetchTaglines(material.entries, material.track)
    setTaglineBusy(false)
    const text = candidates[0] ?? null

    if (text === null) {
      setTaglineNote('지금은 문구를 만들지 못했어요. 직접 적어도 돼요.')
      return
    }
    setSaved((prev) => ({ ...prev, aiTagline: text, taglineSource: 'ai' }))
  }, [material])

  useEffect(() => {
    saveState(STORAGE_KEY, saved)
  }, [saved])

  const useAi = saved.taglineSource === 'ai' && saved.aiTagline.trim() !== ''

  // 입력값에서 순수하게 파생돼요. 비동기가 없으니 상태로 둘 이유가 없습니다.
  const card: CardData = useMemo(() => {
    // 시안의 태그 자리는 두 개예요 — 특기 하나, 취미 하나. (카드.png)
    const tags = [saved.info.strengths, saved.info.hobby]
      .map((value) => value.trim())
      .filter(Boolean)

    return {
      name: saved.name.trim() || '이름 없음',
      title: saved.info.desiredCareer.trim() || '진로 탐색 중',
      tags,
      tagline: useAi ? saved.aiTagline : saved.tagline.trim() || DEFAULT_TAGLINE,
      taglineFromAi: useAi,
      themeId: saved.themeId,
    }
  }, [saved, useAi])

  /** AI 마크. 이미지 로딩이 비동기라 한 번 받아두고 씁니다. */
  const [aiMark, setAiMark] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    const image = new Image()
    image.src = aiMarkSrc
    image.onload = () => setAiMark(image)
  }, [])

  useEffect(() => {
    if (canvasRef.current) drawCard(canvasRef.current, card, aiMark)
  }, [card, aiMark])

  const handleSave = useCallback(async () => {
    if (!canvasRef.current) return
    setNotice('')
    try {
      const where = await saveImage(toPngDataUrl(canvasRef.current), 'my-way-card.png')
      setNotice(where === 'native' ? '사진첩에 저장했어요.' : 'PNG 파일을 내려받았어요.')
    } catch {
      setNotice('저장에 실패했어요. 다시 시도해주세요.')
    }
  }, [])

  const setInfo = (key: CardInfoKey, value: string) => {
    setSaved((prev) => ({ ...prev, info: { ...prev.info, [key]: value } }))
  }

  return (
    <div className="page page--card">
      <TopBar title="가상 명함" />

      <section className="card-preview">
        <canvas ref={canvasRef} className="card-canvas" />
        
      </section>

      <section className="card">
        <h2 className="section-title">테마</h2>
        <div className="theme-row">
          {CARD_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={theme.id === saved.themeId ? 'theme-dot theme-dot--active' : 'theme-dot'}
              style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
              onClick={() => setSaved((prev) => ({ ...prev, themeId: theme.id }))}
              aria-label={theme.label}
            />
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">명함에 들어가는 정보</h2>
        <p className="hint">비어 있는 항목은 아직 명확하지 않은 것으로 봐요. 나중에 채워도 괜찮아요.</p>

        <label className="field">
          <span>이름</span>
          <input
            value={saved.name}
            placeholder="예: 김토스"
            onChange={(event) => setSaved((prev) => ({ ...prev, name: event.target.value }))}
          />
        </label>

        {INFO_KEYS.map((key) => (
          <label className="field" key={key}>
            <span>{CARD_INFO_META[key].label}</span>
            <input
              value={saved.info[key]}
              placeholder={CARD_INFO_META[key].placeholder}
              onChange={(event) => setInfo(key, event.target.value)}
            />
          </label>
        ))}

        {/* 직접 쓰는 칭호 — 자유롭게 고칠 수 있어요. */}
        <label className="field">
          <span>직접 쓰는 칭호</span>
          <input
            value={saved.tagline}
            placeholder={TAGLINE_PLACEHOLDER}
            onChange={(event) =>
              setSaved((prev) => ({ ...prev, tagline: event.target.value, taglineSource: 'self' }))
            }
          />
        </label>

        {/*
          AI 칭호 — **고칠 수 없어요.** 뽑아서 얻는 것이지 편집하는 게 아닙니다.
          마음에 안 들면 다시 뽑으면 돼요. 앞의 마크가 직접 쓴 것과 구분해 줍니다.
        */}
        <div className="field">
          <span>AI 칭호</span>
          {saved.aiTagline ? (
            <button
              type="button"
              className={`ai-tagline${saved.taglineSource === 'ai' ? ' ai-tagline--on' : ''}`}
              onClick={() => setSaved((prev) => ({ ...prev, taglineSource: 'ai' }))}
            >
              <img src={aiMarkSrc} alt="" className="ai-tagline__mark" />
              <span>{saved.aiTagline}</span>
            </button>
          ) : (
            <p className="note-meta">아직 없어요. 문답을 하면 뽑을 수 있어요.</p>
          )}
        </div>

        {material.entries.length >= 1 && (
          <div className="tagline-actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={() => void handleTagline()}
              disabled={taglineBusy}
            >
              {taglineBusy ? '뽑는 중…' : saved.aiTagline ? '다시 뽑기' : '뽑아보기'}
            </button>
            <span className="note-meta">답한 내용을 바탕으로 AI가 만들어요. 고칠 수는 없어요.</span>
          </div>
        )}

        {taglineNote !== '' && <p className="note-meta">{taglineNote}</p>}
      </section>

      {notice !== '' && <p className="notice">{notice}</p>}

      <button
        type="button"
        className="button button--primary button--block"
        onClick={() => void handleSave()}
        
      >
        PNG로 저장하기
      </button>

      {/*
        명함까지 오면 가벼운 구간이 끝나요. 여기서 멈추지 않게 다음 걸음을 열어둡니다.
        캐릭터는 이 화면에서 고르지 않고 /talk 에서 골라요 — 여기에 셋을 늘어놓으면
        명함이 곁다리로 보입니다.
      */}
      <section className="card">
        <h2 className="section-title">이야기 나눠보기</h2>
        <p className="stage-message">
          성격이 다른 셋 중 하나를 골라 이야기를 나눠볼 수 있어요. 나눈 내용을 메모로
          정리해 드려요.
        </p>
        <button
          type="button"
          className="button button--ghost button--block"
          onClick={() => navigate('/talk')}
        >
          이야기하러 가기
        </button>
      </section>

      <RestartButton
        label="입력한 내용 지우기"
        title="명함 정보를 지울까요?"
        description="이름·희망 진로·특기·취미가 모두 지워지고 빈 명함으로 돌아가요. 이미 저장한 PNG 파일은 그대로 남아요."
        confirmLabel="지우기"
        onConfirm={() => {
          clearState('card')
          setSaved(EMPTY)
          setNotice('')
        }}
      />
    </div>
  )
}
