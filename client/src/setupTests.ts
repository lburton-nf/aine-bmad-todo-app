// Tells react-dom that act(...) is safe in this environment.
// Required for React 19 + jsdom; without it react-dom logs
// "The current testing environment is not configured to support act(...)".
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
export {};
