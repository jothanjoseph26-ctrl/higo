export class EventEmitter {
  addListener() { return { remove: () => {} }; }
  removeAllListeners() {}
  emit() {}
}

export class LegacyEventEmitter extends EventEmitter {}

export class NativeModule extends EventEmitter {}

export class SharedObject {}

export class SharedRef {}

export class CodedError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'CodedError';
  }
}

export class UnavailabilityError extends Error {
  constructor(moduleName: string, propertyName: string) {
    super(`${moduleName}.${propertyName} is not available`);
    this.name = 'UnavailabilityError';
  }
}

export enum PermissionStatus {
  GRANTED = 'granted',
  DENIED = 'denied',
  UNDETERMINED = 'undetermined',
}

export type PermissionResponse = {
  status: PermissionStatus;
  expires: 'never' | number;
  granted: boolean;
  canAskAgain: boolean;
};

export type EventSubscription = { remove: () => void };

export const Platform = { OS: 'web', select: (obj: any) => obj.web ?? obj.default };

export const createPermissionHook = () => () =>
  [{ status: PermissionStatus.UNDETERMINED, expires: 'never' as const, granted: false, canAskAgain: true }, () => {}, () => {}];

export const registerWebModule = (cls: any) => cls;

export const requireNativeModule = (_name: string) => ({});

export const requireNativeViewManager = (_name: string) => () => null;

export const useReleasingSharedObject = <T>(value: T, _deps?: any[]): T => value;

export const requireOptionalNativeModule = (_name: string) => ({});
export const reloadAppAsync = async () => {};
export const installOnUIRuntime = (fn: any) => {};
export const isRunningInExpoGo = false;
