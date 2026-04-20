/**
 * Test preload: registers happy-dom globals so `bun test` can run React
 * component tests with `@testing-library/react`.
 *
 * Referenced from root `bunfig.toml` under `[test] preload`. Safe to load in
 * every test process — the registrar is idempotent via its own guards.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

const g = globalThis as unknown as { __HAPPY_DOM_REGISTERED__?: boolean };
if (!g.__HAPPY_DOM_REGISTERED__) {
  GlobalRegistrator.register();
  g.__HAPPY_DOM_REGISTERED__ = true;
}
