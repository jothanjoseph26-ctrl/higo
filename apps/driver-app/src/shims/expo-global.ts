/**
 * Installs the `globalThis.expo` runtime object on web. Expo module web
 * builds (e.g. expo-audio) reference `globalThis.expo.SharedObject` at
 * module-init time; on native the expo runtime provides it, so the web
 * bundle must too. Import this first in the web entry point.
 */
import {
  EventEmitter,
  NativeModule,
  SharedObject,
  SharedRef,
  uuid,
} from './expo-shim';

const g = globalThis as any;
g.expo = g.expo ?? {};
g.expo.EventEmitter = g.expo.EventEmitter ?? EventEmitter;
g.expo.NativeModule = g.expo.NativeModule ?? NativeModule;
g.expo.SharedObject = g.expo.SharedObject ?? SharedObject;
g.expo.SharedRef = g.expo.SharedRef ?? SharedRef;
g.expo.uuidv4 = g.expo.uuidv4 ?? uuid.v4;
g.expo.uuidv5 = g.expo.uuidv5 ?? uuid.v5;
g.expo.modules = g.expo.modules ?? {};
