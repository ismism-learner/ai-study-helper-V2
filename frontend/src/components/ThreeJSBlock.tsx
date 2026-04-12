import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

// ── Types ──────────────────────────────────────────────────────────────

interface SceneObject {
  type: string;
  position?: [number, number, number];
  color?: string;
  radius?: number;
  size?: number;
  tube?: number;
}

interface SceneConfig {
  objects: SceneObject[];
  camera?: {
    position?: [number, number, number];
    fov?: number;
  };
  axes?: boolean;
  grid?: boolean;
}

interface ThreeJSBlockProps {
  config: string;
}

// ── Scene Object Renderer ──────────────────────────────────────────────

const SceneObjectMesh: React.FC<SceneObject> = ({ type, position = [0, 0, 0], color = '#8b5cf6', radius = 1, size = 1, tube = 0.4 }) => {
  switch (type) {
    case 'sphere':
      return (
        <mesh position={position}>
          <sphereGeometry args={[radius, 32, 32]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    case 'cube':
      return (
        <mesh position={position}>
          <boxGeometry args={[size, size, size]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    case 'torus':
      return (
        <mesh position={position}>
          <torusGeometry args={[radius, tube, 16, 32]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    default:
      return null;
  }
};

// ── Main Component ─────────────────────────────────────────────────────

const ThreeJSBlock: React.FC<ThreeJSBlockProps> = ({ config }) => {
  const { sceneConfig, error } = useMemo<{ sceneConfig: SceneConfig | null; error: string | null }>(() => {
    try {
      const parsed: SceneConfig = JSON.parse(config);
      return { sceneConfig: parsed, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { sceneConfig: null, error: `JSON 解析失败: ${message}` };
    }
  }, [config]);

  if (error) {
    return (
      <div style={{
        height: 400,
        width: '100%',
        background: '#1e1b2e',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f87171',
        fontSize: 14,
        padding: 16,
        boxSizing: 'border-box',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>⚠️</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  if (!sceneConfig) return null;

  const cameraPosition: [number, number, number] = sceneConfig.camera?.position ?? [5, 5, 5];
  const cameraFov = sceneConfig.camera?.fov ?? 60;

  return (
    <div style={{
      height: 400,
      width: '100%',
      border: '1px solid rgba(139, 92, 246, 0.2)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <Canvas
        camera={{ position: cameraPosition, fov: cameraFov }}
        style={{ background: '#1e1b2e' }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />

        {sceneConfig.objects.map((obj, index) => (
          <SceneObjectMesh key={index} {...obj} />
        ))}

        {sceneConfig.axes && <axesHelper args={[5]} />}
        {sceneConfig.grid && <gridHelper args={[10, 10, '#475569', '#334155']} />}

        <OrbitControls />
      </Canvas>
    </div>
  );
};

export default ThreeJSBlock;
