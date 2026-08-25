import type { ResolvedConfig } from "./config";

interface SdkState {
  initialized: boolean;
  /** Identifies this SDK instance; later phases attach it to captured events. */
  instanceId: string | null;
  config: ResolvedConfig | null;
}

const state: SdkState = {
  initialized: false,
  instanceId: null,
  config: null,
};

export function getState(): Readonly<SdkState> {
  return state;
}

export function setInitialized(instanceId: string, config: ResolvedConfig): void {
  state.initialized = true;
  state.instanceId = instanceId;
  state.config = config;
}
