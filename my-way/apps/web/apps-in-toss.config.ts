import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'my-way',

  brand: {
    // 앱 전반의 강조색. 화면 CSS 의 --primary 와 같은 값이에요.
    primaryColor: '#3182F6',
  },

  /**
   * 명함을 PNG 로 기기에 저장해요. (`File.saveBase64`)
   * 쓰기만 하고 사진첩을 읽지는 않습니다.
   */
  permissions: [{ name: 'photos', access: 'write' }],

  /**
   * 토스 네비게이션 바를 씁니다.
   *
   * 체크리스트가 요구해요 — "앱인토스 네비게이션 바를 사용하고 있어요",
   * 그리고 "토스 네비게이션 바의 뒤로가기 버튼과 미니앱에서 자체 구현한
   * 뒤로가기 버튼이 동시에 보이지 않아요."
   */
  navigationBar: {
    withBackButton: true,
    withHomeButton: true,
    withTitle: true,
    theme: 'light',
  },

  /**
   * 웹뷰 동작.
   *
   * 당겨서 새로고침과 바운스를 끕니다. 문답 중에 실수로 당기면 입력이 날아간 것처럼
   * 보여요. 저장은 되지만 사용자는 놀랍니다.
   */
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
  },

  webBundleDir: 'dist',
});
