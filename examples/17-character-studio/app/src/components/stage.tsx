"use client"

import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
} from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { toast } from "@ui-sdk/react/toast"
import {
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  type ComponentRef,
} from "react"
import * as THREE from "three"
import { useReveal } from "@/lib/reveal"
import {
  activeCharacter,
  useStudio,
  type Backdrop,
  type Camera,
} from "@/lib/store"
import { BuildUp } from "./build-up"
import { RevealRig } from "./character-model"
import { LoadBoundary } from "./load-boundary"

const SHOTS: Record<
  Camera,
  { position: THREE.Vector3; target: THREE.Vector3 }
> = {
  hero: shot([3.1, 1.5, 5.6], [0, 0.72, 0]),
  front: shot([0, 1.1, 6.6], [0, 0.72, 0]),
  side: shot([6.6, 1.1, 0], [0, 0.72, 0]),
  back: shot([0, 1.3, -6.6], [0, 0.72, 0]),
  face: shot([0.6, 1.5, 2.3], [0, 1.3, 0]),
}

const SETS: Record<
  Backdrop,
  { key: string; rim: string; fill: string; floor: string; ring: string }
> = {
  studio: {
    key: "#ffffff",
    rim: "#8fb4ff",
    fill: "#39405a",
    floor: "#15171d",
    ring: "#c6ff3d",
  },
  sunset: {
    key: "#ffd2a1",
    rim: "#ff5d8f",
    fill: "#5a3350",
    floor: "#1d1418",
    ring: "#ff9d5c",
  },
  night: {
    key: "#a9c4ff",
    rim: "#39e6ff",
    fill: "#1b2b55",
    floor: "#0b1020",
    ring: "#39e6ff",
  },
  void: {
    key: "#ffffff",
    rim: "#ffffff",
    fill: "#222222",
    floor: "#050505",
    ring: "#ffffff",
  },
}

function shot(position: number[], target: number[]) {
  return {
    position: new THREE.Vector3(...position),
    target: new THREE.Vector3(...target),
  }
}

function Floor({ backdrop }: { backdrop: Backdrop }) {
  const set = SETS[backdrop]
  const fade = useMemo(() => {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 256
    const context = canvas.getContext("2d")!
    const gradient = context.createRadialGradient(128, 128, 20, 128, 128, 128)
    gradient.addColorStop(0, "#fff")
    gradient.addColorStop(0.55, "#888")
    gradient.addColorStop(1, "#000")
    context.fillStyle = gradient
    context.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(canvas)
  }, [])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.002} receiveShadow>
        <circleGeometry args={[7, 64]} />
        <meshStandardMaterial
          color={set.floor}
          roughness={0.85}
          alphaMap={fade}
          transparent
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.004}>
        <ringGeometry args={[1.18, 1.2, 96]} />
        <meshBasicMaterial color={set.ring} transparent opacity={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.003}>
        <ringGeometry args={[1.5, 1.505, 96]} />
        <meshBasicMaterial color={set.ring} transparent opacity={0.25} />
      </mesh>
      <ContactShadows
        position={[0, 0.006, 0]}
        scale={5}
        blur={2.4}
        opacity={0.75}
        far={2.2}
        resolution={512}
      />
    </group>
  )
}

function CameraRig() {
  const shotName = useStudio((state) => state.camera)
  const autoRotate = useStudio((state) => state.autoRotate)
  const camera = useThree((state) => state.camera)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const moving = useRef(true)

  useEffect(() => {
    moving.current = true
  }, [shotName])

  useFrame((_, delta) => {
    const orbit = controls.current
    if (!orbit || !moving.current) return
    const goal = SHOTS[shotName]
    const ease = 1 - Math.exp(-delta * 4.5)
    camera.position.lerp(goal.position, ease)
    orbit.target.lerp(goal.target, ease)
    if (camera.position.distanceTo(goal.position) < 0.01) moving.current = false
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      minDistance={1.2}
      maxDistance={9}
      maxPolarAngle={Math.PI / 2 - 0.02}
      autoRotate={autoRotate}
      autoRotateSpeed={2.4}
      onStart={() => (moving.current = false)}
    />
  )
}

function Character() {
  const character = useStudio(activeCharacter)
  const clipId = useStudio((state) => state.clip)
  const clip = character?.clips.find((item) => item.id === clipId)
  const { phase, layers, advance } = useReveal(character)
  const clipUrl = useDeferredValue(clip?.url)
  const source = useMemo(
    () => (layers?.playClip && clipUrl ? { url: clipUrl } : null),
    [layers?.playClip, clipUrl],
  )

  if (!character || character.expired) return null
  if (character.stage === "failed" && !character.modelUrl) return null

  if (!layers || phase === "build" || (!layers.grayUrl && !layers.colorUrl)) {
    return <BuildUp progress={character.progress} />
  }

  return (
    <LoadBoundary
      key={character.id}
      fallback={<BuildUp progress={Math.max(character.progress, 88)} />}
      onError={() => {
        useStudio.getState().upsert(character.id, { expired: true })
        toast("This character's files expired", {
          description:
            "Meshy deletes models after three days. Generate it again or remove it from the library.",
        })
      }}
    >
      <Suspense
        fallback={<BuildUp progress={Math.max(character.progress, 88)} />}
      >
        <RevealRig
          grayUrl={layers.grayUrl}
          colorUrl={layers.colorUrl}
          clip={source}
          scan={layers.scan}
          wipe={layers.wipe}
          bones={layers.bones}
          onBeatDone={advance}
        />
      </Suspense>
    </LoadBoundary>
  )
}

function Stage() {
  const backdrop = useStudio((state) => state.backdrop)
  const set = SETS[backdrop]
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      camera={{ fov: 32, near: 0.1, far: 60, position: [4.4, 2.4, 8.5] }}
    >
      <hemisphereLight args={[set.key, set.fill, 0.55]} />
      <directionalLight
        position={[3.5, 5.5, 4]}
        intensity={2.4}
        color={set.key}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-4, 3, -4]} intensity={3} color={set.rim} />
      <Environment resolution={256} frames={1} key={backdrop}>
        <color attach="background" args={[set.fill]} />
        <Lightformer
          form="rect"
          intensity={6}
          position={[0, 6, 0]}
          rotation-x={Math.PI / 2}
          scale={[12, 12, 1]}
          color={set.key}
        />
        <Lightformer
          form="rect"
          intensity={5}
          position={[2, 2.5, 6]}
          scale={[7, 5, 1]}
          color={set.key}
        />
        <Lightformer
          form="rect"
          intensity={5}
          position={[-6, 2, -1]}
          rotation-y={Math.PI / 2}
          scale={[6, 5, 1]}
          color={set.rim}
        />
        <Lightformer
          form="rect"
          intensity={3}
          position={[6, 2, -1]}
          rotation-y={-Math.PI / 2}
          scale={[6, 5, 1]}
          color={set.key}
        />
        <Lightformer
          form="ring"
          intensity={3}
          position={[0, 2, -7]}
          scale={5}
          color={set.rim}
        />
      </Environment>
      <Floor backdrop={backdrop} />
      <Suspense fallback={null}>
        <Character />
      </Suspense>
      <CameraRig />
    </Canvas>
  )
}

export { Stage }
