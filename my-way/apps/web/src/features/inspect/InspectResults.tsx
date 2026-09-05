import { loadState } from '@/lib/storage'
import { inspectMeta } from '@/lib/inspectMeta'

/**
 * 공인 검사 묶음 — 검사별 상태와 진입점을 한곳에 모아요.
 *
 * ## 점수를 우리가 쓰지 않습니다
 *
 * `report` 응답은 `{ inspctSeq, url }` 뿐이라 점수가 오지 않아요. 원점수를 우리가
 * 계산할 수 있게 되더라도(= `relm` 복구) **판정은 하지 않습니다.**
 *
 * 결과표 샘플을 보면 이유가 분명해요. 같은 원점수 12가 영역에 따라 백분위 1과 6으로
 * 갈립니다. 영역마다 문항 수와 분포가 달라서인데, 규준표 없이 기준선을 세우면
 * 반드시 오분류가 납니다. **규준을 가진 쪽만 할 수 있는 일이에요.** (CLAUDE.md §1)
 *
 * 그래서 이 컴포넌트가 하는 일은 **어디서 보면 되는지 알려주는 것**까지입니다.
 *
 * ## 결과 URL은 화면에 렌더링하지 않아요
 *
 * `seq`가 `base64(inspctSeq)`라 숫자만 바꾸면 타인의 결과가 열립니다. 버튼 뒤에만
 * 두고 DOM·로그 어디에도 남기지 않아요. (CLAUDE.md §2.4)
 */

interface SavedResult {
  reportUrl: string | null
  lowestArea: string | null
}

export function InspectResults({
  tests,
  onStart,
}: {
  /** 이 트랙에서 안내할 검사번호들 */
  tests: number[]
  onStart: (q: number) => void
}) {
  const rows = tests
    .map((q) => ({
      q,
      meta: inspectMeta(q),
      saved: loadState<SavedResult>(`inspect:result:${q}`, {
        reportUrl: null,
        lowestArea: null,
      }),
    }))
    .filter((row) => row.meta !== undefined)

  if (rows.length === 0) return null

  const openReport = (url: string) => {
    // URL을 렌더링하지 않고 그대로 엽니다. (CLAUDE.md §2.4)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="card card--official">
      <p className="official-badge">공인 검사 결과</p>
      <h2 className="section-title">검사 결과 보기</h2>
      <p className="stage-message">
        점수와 등급은 커리어넷 결과표에 있어요. 우리 화면에서는 점수를 해석하지 않아요.
      </p>

      <ul className="inspect-list">
        {rows.map(({ q, meta, saved }) => (
          <li className="inspect-list__row" key={q}>
            <div className="inspect-list__text">
              <p className="inspect-list__title">{meta!.title}</p>
              <p className="note-meta">
                {saved.reportUrl
                  ? saved.lowestArea
                    ? `완료 · 가장 낮았던 영역: ${saved.lowestArea}`
                    : '완료'
                  : '아직 안 했어요'}
              </p>
            </div>

            {saved.reportUrl ? (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => openReport(saved.reportUrl!)}
              >
                자세히 보기
              </button>
            ) : (
              <button type="button" className="button button--ghost" onClick={() => onStart(q)}>
                해보기
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
