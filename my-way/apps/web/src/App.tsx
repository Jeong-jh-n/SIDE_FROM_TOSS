import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { HomeRoute } from '@/routes/HomeRoute'
import { WarmupRoute } from '@/routes/WarmupRoute'
import { CardRoute } from '@/routes/CardRoute'
import { TalkPickRoute } from '@/routes/TalkPickRoute'
import { TalkRoute } from '@/routes/TalkRoute'
import { NoteRoute } from '@/routes/NoteRoute'
import './App.css'

/**
 * 화면 구성 — **하나의 흐름**입니다. (FEED "경험절차의 단순화(원패턴)")
 *
 * ```
 * /       소개 · 시작
 * /ask    1. 서술형 다섯 개
 * /card   2. 칭호 붙은 명함 (이미지 저장)
 * /talk   3. 캐릭터 고르기
 * /talk/:id  캐릭터와 대화 (5~10턴)
 * /note   4. 인상 결과지 (메모지, 양식 5종 랜덤)
 * ```
 *
 * 트랙 선택과 커리어넷 검사는 제거했어요. 커리어넷 쪽에서 실험으로 알아낸 것들은
 * `CAREERNET.md` 에 남겨 뒀습니다 — 되살릴 일이 생기면 거기부터 보세요.
 */
function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/ask" element={<WarmupRoute />} />
          <Route path="/card" element={<CardRoute />} />
          <Route path="/talk" element={<TalkPickRoute />} />
          <Route path="/talk/:id" element={<TalkRoute />} />
          <Route path="/note" element={<NoteRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
