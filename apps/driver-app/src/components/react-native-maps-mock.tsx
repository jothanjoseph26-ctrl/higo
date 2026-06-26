import React from 'react';
import { View } from 'react-native';

export const MapView = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
export const Marker = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
export const Polyline = () => null;

export default MapView;