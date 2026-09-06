import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { TopBar } from '@/features/shared/TopBar'
import { RestartButton } from '@/features/shared/RestartButton'
import { loadState, saveState } from '@/lib/storage'
import { saveImage } from '@/lib/toss'
import { drawNote, toPngDataUrl } from '@/lib/noteCanvas'
import { pickForm } from '@/features/note/forms'
import { fetchNote } from '@/lib/noteApi'
import {
  EMPTY_NOTE,
  EMPTY_TALK,
  NOTE_KEY,
  TALK_KEY,
  spokenTurns,
  type NoteState,
  type TalkState,
} from '@/lib/talk'

/**
 * `/note` — 대화가 끝난 뒤 받는 메모지.
 *
 * ## 판정이 아니라 인상이에요
 *
 * "이렇게 보였어요" 에서 멈춥니다. 인상은 주관적 진술이라 §7 의 유형 규정을 피해
 * 가지만, **칭찬이 능력 단정으로 새면 그대로 걸려요.** 서버의 `sanitizeNoteLines`
 * 가 줄 단위로 거릅니다 — 걸린 줄만 빠지고 나머지는 남아요.
 *
 * ## 양식은 한 번만 뽑아요
 *
 * 무작위로 고르고 **저장합니다.** 다시 열 때마다 바뀌면 이미지로 저장해둔 것과
 * 화면이 달라져요. (`features/note/forms.ts`)
 */
export function NoteRoute() {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [note, setNote] = useState<NoteState | null>(null)
  const [busy, setBusy] = useState(false)
  const [saveNote, setSaveNote] = useState('')

  const talk = loadState<TalkState>(TALK_KEY, EMPTY_TALK)

  useEffect(() => {
    const saved = loadState<NoteState>(NOTE_KEY, EMPTY_NOTE)

    // 이미 만들어둔 게 있으면 그대로 보여줘요. 다시 부르면 내용이 달라집니다.
    if (saved.characterId === talk.characterId && saved.lines.length > 0) {
      setNote(saved)
      return
    }

    if (talk.characterId === '' || spokenTurns(talk.turns) === 0) {
      setNote(EMPTY_NOTE)
      return
    }

    const controller = new AbortController()
    setBusy(true)

    void fetchNote(talk.characterId, talk.turns, controller.signal).then((result) => {
      setBusy(false)
      if (!result.available || result.lines.length === 0) {
        setNote(EMPTY_NOTE)
        return
      }

      // 양식은 여기서 한 번만 뽑고 저장해요.
      const next: NoteState = {
        characterId: talk.characterId,
        formId: pickForm().id,
        lines: result.lines,
        from: result.from ?? '',
      }
      setNote(next)
      saveState(NOTE_KEY, next)
    })

    return () => controller.abort()
    // 대화가 바뀌었을 때만 다시 만들어요.
  }, [talk.characterId, talk.turns])

  useEffect(() => {
    if (canvasRef.current === null || note === null || note.lines.length === 0) return
    drawNote(canvasRef.current, note)
  }, [note])

  const save = useCallback(async () => {
    if (canvasRef.current === null) return
    const where = await saveImage(toPngDataUrl(canvasRef.current), 'my-way-note.png')
    setSaveNote(where === 'native' ? '사진첩에 저장했어요.' : '이미지를 내려받았어요.')
  }, [])

  if (note === null || busy) {
    return (
      <div className="page page--result">
        <TopBar title="정리하는 중" />
        <div className="tab-panel">
          <section className="card card--ai">
            <p className="stage-message">나눈 이야기를 메모로 옮기는 중이에요…</p>
          </section>
        </div>
      </div>
    )
  }

  // 대화가 없거나 쓸 만한 줄이 안 나온 경우.
  if (note.lines.length === 0) {
    return (
      <div className="page page--result">
        <TopBar title="결과지" />
        <div className="tab-panel">
          <section className="card">
            <p className="stage-message">
              아직 메모로 옮길 이야기가 모이지 않았어요. 조금 더 이야기해볼까요?
            </p>
          </section>
          <button
            type="button"
            className="button button--primary button--block"
            onClick={() => navigate('/talk')}
          >
            이야기하러 가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page page--result">
      <TopBar title="결과지" />

      <div className="tab-panel">
        <section className="card">
          <canvas ref={canvasRef} className="note-canvas" />
        </section>

        <button type="button" className="button button--primary button--block" onClick={() => void save()}>
          이미지로 저장하기
        </button>
        {saveNote !== '' && <p className="note-meta">{saveNote}</p>}

        {/*
          다시 하면 대화와 메모가 함께 지워져요. 되돌릴 수 없으니 확인을 받습니다.
          이미 저장한 이미지는 기기에 남아요.
        */}
        <RestartButton
          label="다른 사람과 다시 이야기하기"
          title="새로 시작할까요?"
          description="지금 대화와 메모가 지워지고 캐릭터를 다시 고를 수 있어요. 저장해둔 이미지는 기기에 남아요."
          confirmLabel="새로 시작"
          variant="text"
          onConfirm={() => {
            saveState(TALK_KEY, EMPTY_TALK)
            saveState(NOTE_KEY, EMPTY_NOTE)
            navigate('/talk')
          }}
        />
      </div>
    </div>
  )
}
