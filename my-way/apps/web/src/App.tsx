import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { TrackSelect } from '@/routes/TrackSelect'
import { ChatRoute } from '@/routes/ChatRoute'
import { ResultRoute } from '@/routes/ResultRoute'
import { InspectRoute } from '@/routes/InspectRoute'
import { CardRoute } from '@/routes/CardRoute'
import { SummaryRoute } from '@/routes/SummaryRoute'
import { WarmupRoute } from '@/routes/WarmupRoute'
import { InspectListRoute } from '@/routes/InspectListRoute'
import './App.css'

/** 화면 구성은 CLAUDE.md §10 을 따라요. */
function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          {/* 트랙 선택 */}
          <Route path="/" element={<TrackSelect />} />
          {/* 자체 문항 문답 */}
          {/* 짧게 답하고 명함 한 줄을 먼저 얻는 단계. 심화 문답 앞에 옵니다. */}
          <Route path="/warmup/:track" element={<WarmupRoute />} />
          <Route path="/chat/:track" element={<ChatRoute />} />
          {/* 결과 — 자체 정리 + 검사 링크 + 영역 되묻기 */}
          <Route path="/result/:track" element={<ResultRoute />} />
          {/* 커리어넷 검사 실시 → 결과표 → 영역 되묻기 */}
          {/* 검사 입구를 한곳으로 모아요. 개별 검사는 아래 :q 로 들어갑니다. */}
          <Route path="/inspect" element={<InspectListRoute />} />
          <Route path="/inspect/:q" element={<InspectRoute />} />
          {/* 가상 명함 — 단발성으로도 만들 수 있어요 */}
          {/* 대학생·취준생 통합 결과. 중간 결과 화면(/result/:track)은 그대로 둡니다. */}
          <Route path="/summary" element={<SummaryRoute />} />
          <Route path="/card" element={<CardRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
