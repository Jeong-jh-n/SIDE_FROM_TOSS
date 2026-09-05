/**
 * 상담 자원 안내.
 *
 * 어려움을 시사하는 응답이 나온 지점에 붙여요. 결과를 단정적으로 제시하지 않고,
 * 해당 응답을 근거로 부정적 판단 문구를 만들지 않아요. (CLAUDE.md §8)
 */
export function SupportNotice() {
  return (
    <section className="card card--muted">
      <p className="hint hint--care">
        혼자 감당하기 버거우면 도움을 받아도 괜찮아요.
        <br />
        청소년상담 <strong>1388</strong> · 정신건강 상담 <strong>1577-0199</strong> · 학교나 학과의
        상담실
      </p>
    </section>
  )
}
