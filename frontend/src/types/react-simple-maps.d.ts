declare module 'react-simple-maps' {
  import { ComponentType } from 'react';

  interface GeographiesProps {
    geography?: string | object;
    children: (props: { geographies: any[] }) => React.ReactNode;
  }

  interface GeographyProps {
    geography: any;
    onClick?: (event: React.MouseEvent) => void;
    onMouseEnter?: (event: React.MouseEvent) => void;
    onMouseLeave?: (event: React.MouseEvent) => void;
    style?: {
      default?: object;
      hover?: object;
      pressed?: object;
    };
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  }

  interface MarkerProps {
    coordinates: [number, number];
    children?: React.ReactNode;
  }

  interface ZoomableGroupProps {
    zoom?: number;
    center?: [number, number];
    children?: React.ReactNode;
    onMoveEnd?: (args: { coordinates: [number, number]; zoom: number }) => void;
  }

  interface ComposableMapProps {
    projection?: string;
    projectionConfig?: {
      scale?: number;
      center?: [number, number];
      parallels?: [number, number];
      rotate?: [number, number, number];
    };
    width?: number;
    height?: number;
    children?: React.ReactNode;
    style?: object;
  }

  export const ComposableMap: ComponentType<ComposableMapProps>;
  export const Geographies: ComponentType<GeographiesProps>;
  export const Geography: ComponentType<GeographyProps>;
  export const Marker: ComponentType<MarkerProps>;
  export const ZoomableGroup: ComponentType<ZoomableGroupProps>;
}
