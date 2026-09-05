import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAppStore } from '../store/appStoreContext'
import { generateCardData } from '../api/careerApi'
import { drawCard, toPngDataUrl } from '../lib/cardCanvas'
import { saveImage } from '../lib/toss'
import { CARD_THEMES } from '../data/questions'
import { COLLECTED_INFO_META } from '../types'
import type { CardData, CollectedInfoKey } from '../types'

const INFO_KEYS = Object.keys(COLLECTED_INFO_META) as CollectedInfoKey[]

/**
 * 4번 기능 화면: 정보수집 후 나오는 콘텐츠 — 가상 명함 디자인.
 * 완성본은 PNG로 저장돼요.
 */
export function CardPage() {
  const navigate = useNavigate()
  const { collectedInfo, unfilledInfoKeys, displayName, setCollectedInfo } = useAppStore()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [themeId, setThemeId] = useState<string>(CARD_THEMES[0].id)
  const [card, setCard] = useState<CardData | null>(null)
  const [notice, setNotice] = useState('')

  // 수집 정보나 테마가 바뀌면 명함 데이터를 다시 만들어요.
  useEffect(() => {
    let cancelled = false

    void generateCardData({ name: displayName, collectedInfo, themeId }).then((next) => {
      if (!cancelled) setCard(next)
    })

    return () => {
      cancelled = true
    }
  }, [collectedInfo, displayName, themeId])

  useEffect(() => {
    if (card && canvasRef.current) {
      drawCard(canvasRef.current, card)
    }
  }, [card])

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

  return (
    <div className="page page--card">
      <header className="sub-header">
        <button type="button" className="icon-button" onClick={() => navigate('/')} aria-label="뒤로">
          ‹
        </button>
        <strong>가상 명함</strong>
      </header>

      <section className="card-preview">
        <canvas ref={canvasRef} className="card-canvas" />
        {card === null && <div className="card-canvas-loading">만드는 중…</div>}
      </section>

      <section className="card">
        <h2 className="section-title">테마</h2>
        <div className="theme-row">
          {CARD_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={theme.id === themeId ? 'theme-dot theme-dot--active' : 'theme-dot'}
              style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
              onClick={() => setThemeId(theme.id)}
              aria-label={theme.label}
            />
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">명함에 들어가는 정보</h2>
        <p className="hint">
          비어 있는 항목은 아직 명확하지 않은 것으로 봐요. 여기서 채우거나, 대화에서 AI와 함께 채울 수
          있어요.
        </p>

        {INFO_KEYS.map((key) => (
          <label className="field" key={key}>
            <span>{COLLECTED_INFO_META[key].label}</span>
            <input
              value={collectedInfo[key]}
              placeholder={COLLECTED_INFO_META[key].placeholder}
              onChange={(event) => setCollectedInfo(key, event.target.value)}
            />
          </label>
        ))}

        {unfilledInfoKeys.length > 0 && (
          <button type="button" className="button button--ghost" onClick={() => navigate('/chat')}>
            AI와 대화하며 채우기
          </button>
        )}
      </section>

      {notice !== '' && <p className="notice">{notice}</p>}

      <button
        type="button"
        className="button button--primary button--block"
        onClick={() => void handleSave()}
        disabled={card === null}
      >
        PNG로 저장하기
      </button>
    </div>
  )
}
