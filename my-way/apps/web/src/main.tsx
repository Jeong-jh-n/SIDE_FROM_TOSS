import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { hydrateStorage } from './lib/storage'

/**
 * 저장소를 먼저 맞춰두고 그립니다.
 *
 * `hydrateStorage` 는 토스 네이티브 저장소와 localStorage 를 동기화해요.
 * **그리기 전에 끝나야 합니다.** 먼저 그리면 빈 상태가 잠깐 보였다가 값이 튀어나오고,
 * 그 사이에 화면들의 저장 effect 가 돌면서 **빈 값으로 덮어써요.**
 *
 * 실패해도 그립니다. 네이티브를 못 쓰는 환경(브라우저 개발 등)에서는 localStorage
 * 만으로 예전처럼 동작해요. 그래서 `catch` 가 아니라 `finally` 입니다.
 */
hydrateStorage().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
