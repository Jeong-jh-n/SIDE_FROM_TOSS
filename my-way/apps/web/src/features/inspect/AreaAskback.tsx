import { useState } from 'react'
import { areasFor } from '@/lib/inspectMeta'

/**
 * 영역 되묻기 — `relm`이 응답에 없어서 만든 연결 장치.
 *
 * 점수 데이터가 안 들어오므로 **사용자에게 직접 묻습니다.** 결과표를 웹뷰로 보고 돌아오면
 * 6지선다로 가장 낮았던 영역을 고르게 하고, 그 영역으로 후속 서술을 라우팅해요.
 * (CLAUDE.md §6)
 */

interface Props {
  q: number
  reportUrl: string
  onPick: (area: string) => void
}

export function AreaAskback({ q, reportUrl, onPick }: Props) {
  const [opened, setOpened] = useState(false)
  const areas = areasFor(q)

  const openReport = () => {
    setOpened(true)
    // URL을 화면에 렌더링하지 않고 그대로 엽니다. (CLAUDE.md §2.4)
    window.open(reportUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="tab-panel">
      <section className="card card--official">
        <p className="official-badge">공인 검사 결과</p>
        <h2 className="section-title">정식 결과표</h2>
        <p className="stage-message">
          점수와 등급은 커리어넷 결과표에서 확인해요. 우리 화면에서는 점수를 해석하지 않아요.
        </p>
        <button type="button" className="button button--primary button--block" onClick={openReport}>
          정식 결과표 보기
        </button>
      </section>

      {areas === null ? (
        // 영역 목록이 확인되지 않은 검사는 되묻기를 건너뜁니다.
        <section className="card">
          <p className="stage-message">
            이 검사는 영역 목록이 아직 확인되지 않아서, 결과표만 보여드리고 있어요.
          </p>
        </section>
      ) : (
        <section className="card">
          <h2 className="section-title">여섯 개 중에 제일 낮게 나온 게 뭐야?</h2>
          <p className="stage-message">
            결과표에서 확인한 대로 골라줘. 그 영역으로 이야기를 이어갈게.
          </p>

          {!opened && <p className="hint">결과표를 먼저 보고 오면 고르기 쉬워.</p>}

          <div className="area-choices">
            {areas.map((area) => (
              <button
                key={area}
                type="button"
                className="choice"
                onClick={() => onPick(area)}
              >
                {area}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
