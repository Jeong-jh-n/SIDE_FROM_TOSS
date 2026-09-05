import { TOPIC_LABEL } from '../types'
import type { ReflectionNote } from '../types'

/**
 * 주제별 이야기 분포를 순서로만 보여줘요.
 *
 * 점수·등급·막대 길이를 쓰지 않아요. 수치를 보여주면 규준 없는 진단이 되기 때문이에요.
 * 대신 "많이 이야기한 순서"라는 관찰 가능한 사실만 나열해요. (README §1, §5)
 */
export function TopicOrder({ note }: { note: ReflectionNote }) {
  if (note.ordering.length === 0) {
    return <p className="result-desc">아직 정리할 이야기가 없어요.</p>
  }

  return (
    <ol className="topic-order">
      {note.ordering.map((topic) => {
        const isEmphasis = note.emphases.includes(topic)
        const isLighter = note.lighter.includes(topic)

        return (
          <li key={topic} className={isEmphasis ? 'topic-row topic-row--emphasis' : 'topic-row'}>
            <span className="topic-name">{TOPIC_LABEL[topic]}</span>
            {isEmphasis && <span className="topic-mark topic-mark--more">말이 많았던 쪽</span>}
            {isLighter && <span className="topic-mark topic-mark--less">말수가 적었던 쪽</span>}
          </li>
        )
      })}
    </ol>
  )
}
