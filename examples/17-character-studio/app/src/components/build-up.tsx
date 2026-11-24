"use client"

import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { REVEAL } from "@/lib/reveal"

const HEIGHT = REVEAL.height
const LIME = new THREE.Color("#c6ff3d")
const CYAN = new THREE.Color("#39e6ff")

function printMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uWire: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uProgress;
      uniform float uTime;
      uniform float uWire;
      varying vec3 vWorld;
      void main() {
        float top = uProgress * ${HEIGHT.toFixed(2)};
        float edge = top + 0.04 * sin(vWorld.x * 22.0 + uTime * 6.0);
        if (vWorld.y > edge) discard;
        float scan = 1.0 - smoothstep(0.0, 0.07, abs(vWorld.y - edge));
        float fres = pow(1.0 - abs(normalize(vWorld).z), 2.0);
        vec3 lime = vec3(0.776, 1.0, 0.239);
        vec3 cyan = vec3(0.224, 0.902, 1.0);
        vec3 color = mix(lime, cyan, clamp(vWorld.y / ${HEIGHT.toFixed(2)}, 0.0, 1.0));
        float fill = uWire > 0.5 ? 0.22 : 0.38;
        gl_FragColor = vec4(color, fill + scan * 0.7 + fres * 0.15);
      }
    `,
  })
}

function Figure({ progress }: { progress: number }) {
  const group = useRef<THREE.Group>(null)
  const fill = useMemo(() => printMaterial(), [])
  const wire = useMemo(() => {
    const material = printMaterial()
    material.wireframe = true
    material.uniforms.uWire.value = 1
    return material
  }, [])
  const ring = useRef<THREE.Mesh>(null)
  const displayed = useRef(0)

  useEffect(() => {
    return () => {
      fill.dispose()
      wire.dispose()
    }
  }, [fill, wire])

  useFrame((state, delta) => {
    displayed.current +=
      (progress - displayed.current) * (1 - Math.exp(-delta * 5))
    const t = state.clock.elapsedTime
    fill.uniforms.uProgress.value = displayed.current
    fill.uniforms.uTime.value = t
    wire.uniforms.uProgress.value = displayed.current
    wire.uniforms.uTime.value = t
    if (group.current) group.current.rotation.y = t * 0.35
    if (ring.current) {
      ring.current.position.y = displayed.current * HEIGHT
      const pulse = 0.7 + Math.sin(t * 8) * 0.3
      const material = ring.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.35 + pulse * 0.4
      ring.current.scale.setScalar(0.85 + displayed.current * 0.25)
    }
  })

  return (
    <group ref={group}>
      <mesh material={fill} position={[0, 0.95, 0]}>
        <capsuleGeometry args={[0.18, 0.62, 6, 12]} />
      </mesh>
      <mesh material={fill} position={[0, 1.48, 0]}>
        <sphereGeometry args={[0.16, 16, 12]} />
      </mesh>
      <mesh material={fill} position={[-0.28, 1.05, 0]} rotation={[0, 0, 0.45]}>
        <capsuleGeometry args={[0.06, 0.42, 4, 8]} />
      </mesh>
      <mesh material={fill} position={[0.28, 1.05, 0]} rotation={[0, 0, -0.45]}>
        <capsuleGeometry args={[0.06, 0.42, 4, 8]} />
      </mesh>
      <mesh material={fill} position={[-0.1, 0.38, 0]}>
        <capsuleGeometry args={[0.07, 0.48, 4, 8]} />
      </mesh>
      <mesh material={fill} position={[0.1, 0.38, 0]}>
        <capsuleGeometry args={[0.07, 0.48, 4, 8]} />
      </mesh>
      <mesh material={wire} position={[0, 0.95, 0]}>
        <capsuleGeometry args={[0.18, 0.62, 6, 12]} />
      </mesh>
      <mesh material={wire} position={[0, 1.48, 0]}>
        <sphereGeometry args={[0.16, 16, 12]} />
      </mesh>
      <mesh ref={ring} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.42, 0.012, 8, 48]} />
        <meshBasicMaterial
          color={LIME}
          transparent
          opacity={0.8}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

function Sparks({ progress }: { progress: number }) {
  const points = useRef<THREE.Points>(null)
  const data = useMemo(() => {
    const count = 220
    const positions = new Float32Array(count * 3)
    const speeds = new Float32Array(count)
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2
      const r = 0.15 + Math.random() * 0.55
      positions[i * 3] = Math.cos(a) * r
      positions[i * 3 + 1] = Math.random() * HEIGHT
      positions[i * 3 + 2] = Math.sin(a) * r
      speeds[i] = 0.15 + Math.random() * 0.45
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    return { geometry, speeds, positions }
  }, [])

  useEffect(() => () => data.geometry.dispose(), [data])

  useFrame((_, delta) => {
    const { speeds, positions } = data
    const ceiling = Math.max(0.08, progress * HEIGHT)
    for (let i = 0; i < speeds.length; i += 1) {
      const y = i * 3 + 1
      positions[y] = (positions[y] ?? 0) + speeds[i] * delta
      if ((positions[y] ?? 0) > ceiling) positions[y] = 0
    }
    data.geometry.attributes.position.needsUpdate = true
    if (points.current) {
      const material = points.current.material as THREE.PointsMaterial
      material.opacity = 0.25 + progress * 0.45
    }
  })

  return (
    <points ref={points} geometry={data.geometry}>
      <pointsMaterial
        color={CYAN}
        size={0.018}
        transparent
        opacity={0.4}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  )
}

function BuildUp({ progress }: { progress: number }) {
  const amount = Math.max(0, Math.min(1, progress / 100))
  return (
    <group>
      <mesh position={[0, HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.62, 0.62, HEIGHT, 24, 1, true]} />
        <meshBasicMaterial
          color={CYAN}
          transparent
          opacity={0.05 + amount * 0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Figure progress={amount} />
      <Sparks progress={amount} />
      <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
        <ringGeometry args={[0.7, 0.72, 64]} />
        <meshBasicMaterial
          color={LIME}
          transparent
          opacity={0.25 + amount * 0.45}
        />
      </mesh>
    </group>
  )
}

export { BuildUp }
