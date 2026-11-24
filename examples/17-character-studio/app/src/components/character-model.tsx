"use client"

import { useGLTF } from "@react-three/drei"
import { useFrame, useThree } from "@react-three/fiber"
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js"
import { keyHeaders } from "@/lib/keys"
import { REVEAL, type RevealPhase } from "@/lib/reveal"
import { useStudio, type Finish } from "@/lib/store"

const HEIGHT = REVEAL.height
const LIME = new THREE.Color("#c6ff3d")

function overrideMaterial(
  finish: Finish,
  tint: THREE.Color,
  textured: boolean,
) {
  if (!textured) {
    return new THREE.MeshStandardMaterial({ color: "#aeb3c2", roughness: 0.9 })
  }
  const neutral = tint.equals(new THREE.Color("#ffffff"))
  switch (finish) {
    case "matte":
      return new THREE.MeshStandardMaterial({
        color: neutral ? new THREE.Color("#d8d4cc") : tint,
        roughness: 0.95,
      })
    case "metal":
      return new THREE.MeshStandardMaterial({
        color: neutral ? new THREE.Color("#d9dde3") : tint,
        metalness: 1,
        roughness: 0.22,
        envMapIntensity: 1.4,
      })
    case "wire":
      return new THREE.MeshBasicMaterial({
        color: neutral ? new THREE.Color("#c6ff3d") : tint,
        wireframe: true,
      })
    case "original":
      return null
    default: {
      const exhaustive: never = finish
      return exhaustive
    }
  }
}

function withKeys(loader: {
  setRequestHeader: (headers: Record<string, string>) => unknown
}) {
  loader.setRequestHeader(keyHeaders())
}

function withRevealMask(
  material: THREE.Material,
  scanY: { value: number },
  mode: "reveal" | "cover",
) {
  const clipMode = mode === "reveal" ? 1 : 2
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uScanY = scanY
    shader.uniforms.uClipMode = { value: clipMode }
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vRevealPos;`,
      )
      .replace(
        "#include <project_vertex>",
        `vRevealPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform float uScanY;\nuniform float uClipMode;\nvarying vec3 vRevealPos;`,
      )
      .replace(
        "void main() {",
        `void main() {
          float n = fract(sin(dot(vRevealPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
          float edge = uScanY + n * 0.05;
          if (uClipMode > 1.5) {
            if (uScanY > 0.002 && vRevealPos.y < edge) discard;
          } else if (uClipMode > 0.5) {
            if (vRevealPos.y > edge) discard;
          }`,
      )
      .replace(
        "#include <opaque_fragment>",
        `#include <opaque_fragment>
         float band = 1.0 - smoothstep(0.0, 0.09, abs(vRevealPos.y - uScanY));
         gl_FragColor.rgb += vec3(0.776, 1.0, 0.239) * band;`,
      )
  }
  material.customProgramCacheKey = () => `reveal-mask-${mode}`
  material.needsUpdate = true
}

interface ClipSource {
  url: string
}

function MeshLayer({
  url,
  clip: clipSource,
  textured,
  beat,
  cover,
  scanY,
  onBeatDone,
}: {
  url: string
  clip: ClipSource | null
  textured: boolean
  beat: RevealPhase | null
  cover: boolean
  scanY: { value: number }
  onBeatDone: (phase: RevealPhase) => void
}) {
  const gltf = useGLTF(url, true, true, withKeys)
  // Meshy returns every animation as a full copy of the character on the same
  // skeleton, so only the clip is taken from that file and played here.
  const clipFile = useGLTF(clipSource?.url ?? url, true, true, withKeys)
  const clip = useMemo(
    () => (clipSource ? (clipFile.animations[0] ?? null) : null),
    [clipFile, clipSource],
  )

  useEffect(() => {
    if (clipFile === gltf) return
    clipFile.scene.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      for (const material of [mesh.material].flat()) {
        for (const value of Object.values(material)) {
          const texture = value as THREE.Texture | null
          if (!texture?.isTexture) continue
          texture.dispose()
          ;(texture.source.data as ImageBitmap | null)?.close?.()
        }
        material.dispose()
      }
    })
  }, [clipFile, gltf])

  const { gl, scene, camera } = useThree()
  const finish = useStudio((state) => state.finish)
  const tint = useStudio((state) => state.tint)
  const skeleton = useStudio((state) => state.skeleton)
  const mask: "reveal" | "cover" | null =
    beat === "scan" || beat === "dissolve" ? "reveal" : cover ? "cover" : null

  const { root, fit } = useMemo(() => {
    const root = cloneSkinned(gltf.scene)
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root, true)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const scale = HEIGHT / (size.y || 1)
    root.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.frustumCulled = false
      mesh.userData.original = mesh.material
    })
    return {
      root,
      fit: {
        scale,
        position: [-center.x * scale, -box.min.y * scale, -center.z * scale],
      } as const,
    }
  }, [gltf.scene])

  useLayoutEffect(() => {
    const color = new THREE.Color(tint)
    const shared = overrideMaterial(finish, color, textured)
    const made: THREE.Material[] = shared ? [shared] : []
    root.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const assigned: THREE.Material[] = []
      if (shared) {
        mesh.material = shared
        assigned.push(shared)
      } else {
        const tinted = (
          [mesh.userData.original].flat() as THREE.MeshStandardMaterial[]
        ).map((material) => {
          const copy = material.clone()
          if (copy.color) copy.color.multiply(color)
          made.push(copy)
          assigned.push(copy)
          return copy
        })
        mesh.material = Array.isArray(mesh.userData.original)
          ? tinted
          : tinted[0]
      }
      if (mask) {
        for (const material of assigned) withRevealMask(material, scanY, mask)
      }
    })
    gl.compile(scene, camera)
    return () => made.forEach((material) => material.dispose())
  }, [root, finish, tint, textured, mask, scanY, gl, scene, camera])

  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root])
  const current = useRef<THREE.AnimationAction | null>(null)

  useEffect(() => {
    const previous = current.current
    if (!clip) {
      previous?.fadeOut(0.3)
      current.current = null
      return
    }
    const unbound = clip.tracks.filter(
      (track) =>
        !THREE.PropertyBinding.findNode(
          root,
          THREE.PropertyBinding.parseTrackName(track.name).nodeName,
        ),
    )
    if (unbound.length > 0) {
      console.warn(
        `${clip.name}: ${unbound.length} of ${clip.tracks.length} tracks have no matching bone`,
      )
    }
    const next = mixer.clipAction(clip)
    if (next === previous) return
    next.reset().setEffectiveWeight(1).fadeIn(0.35).play()
    previous?.fadeOut(0.35)
    current.current = next
  }, [mixer, root, clip])

  useEffect(() => () => void mixer.stopAllAction(), [mixer])

  const helper = useMemo(() => {
    const helper = new THREE.SkeletonHelper(root)
    const material = helper.material as THREE.LineBasicMaterial
    material.depthTest = false
    material.transparent = true
    helper.renderOrder = 10
    return helper
  }, [root])

  const started = useRef<number | null>(null)
  const finished = useRef(false)
  const beatRef = useRef(beat)
  const boneOpacity = useRef(0)

  useFrame((_, delta) => {
    const { playing, speed } = useStudio.getState()
    if (playing) mixer.update(delta * speed)

    if (beatRef.current !== beat) {
      beatRef.current = beat
      started.current = null
      finished.current = false
    }

    const sweeping = beat === "scan" || beat === "dissolve"
    if (sweeping) {
      if (started.current === null) started.current = performance.now() + 120
      const ms = beat === "scan" ? REVEAL.scanMs : REVEAL.dissolveMs
      const t = Math.min(
        1,
        Math.max(0, performance.now() - started.current) / ms,
      )
      const ease = 1 - (1 - t) * (1 - t)
      scanY.value = ease * HEIGHT
      if (t >= 1 && !finished.current) {
        finished.current = true
        onBeatDone(beat)
      }
    } else if (beat === "bones") {
      if (started.current === null) started.current = performance.now()
      const t = Math.min(
        1,
        (performance.now() - started.current) / REVEAL.bonesMs,
      )
      if (t >= 1 && !finished.current) {
        finished.current = true
        onBeatDone("bones")
      }
    }

    const material = helper.material as THREE.LineBasicMaterial
    if (beat === "bones") {
      helper.visible = true
      material.color.copy(LIME)
      const t =
        started.current === null
          ? 0
          : Math.min(1, (performance.now() - started.current) / REVEAL.bonesMs)
      const hold = t < 0.18 ? t / 0.18 : t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1
      boneOpacity.current = Math.max(0, hold)
      material.opacity = boneOpacity.current
      return
    }
    boneOpacity.current +=
      (0 - boneOpacity.current) * (1 - Math.exp(-delta * 10))
    material.color.set("#ffffff")
    helper.visible = textured && (skeleton || boneOpacity.current > 0.02)
    material.opacity = skeleton ? 1 : boneOpacity.current
  })

  return (
    <>
      <group scale={fit.scale} position={fit.position}>
        <primitive object={root} />
      </group>
      {textured ? <primitive object={helper} /> : null}
    </>
  )
}

function ScanSweep({ scanY }: { scanY: { value: number } }) {
  const ring = useRef<THREE.Mesh>(null)
  const blade = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const y = scanY.value
    const pulse = 0.75 + Math.sin(state.clock.elapsedTime * 10) * 0.25
    if (ring.current) {
      ring.current.position.y = y
      ring.current.scale.setScalar(0.9 + pulse * 0.08)
    }
    if (blade.current) blade.current.position.y = y
    if (glow.current) {
      glow.current.position.y = y
      const material = glow.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.12 + pulse * 0.08
    }
  })

  return (
    <group>
      <mesh ref={ring} rotation-x={Math.PI / 2}>
        <ringGeometry args={[0.12, 0.72, 64]} />
        <meshBasicMaterial
          color={LIME}
          transparent
          opacity={0.9}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={blade} rotation-x={Math.PI / 2}>
        <circleGeometry args={[0.7, 48]} />
        <meshBasicMaterial
          color={LIME}
          transparent
          opacity={0.16}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={glow}>
        <cylinderGeometry args={[0.55, 0.55, 0.05, 32, 1, true]} />
        <meshBasicMaterial
          color="#39e6ff"
          transparent
          opacity={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

function RevealRig({
  grayUrl,
  colorUrl,
  clip,
  scan,
  wipe,
  bones,
  onBeatDone,
}: {
  grayUrl?: string
  colorUrl?: string
  clip: ClipSource | null
  scan: boolean
  wipe: boolean
  bones: boolean
  onBeatDone: (phase: RevealPhase) => void
}) {
  const scanY = useMemo(() => ({ value: 0 }), [])

  useLayoutEffect(() => {
    if (scan || wipe) scanY.value = 0
  }, [scan, wipe, scanY])

  return (
    <group>
      {grayUrl ? (
        <MeshLayer
          url={grayUrl}
          clip={null}
          textured={false}
          beat={scan ? "scan" : null}
          cover={wipe}
          scanY={scanY}
          onBeatDone={onBeatDone}
        />
      ) : null}
      {colorUrl ? (
        <Suspense fallback={null}>
          <MeshLayer
            url={colorUrl}
            clip={clip}
            textured
            beat={wipe ? "dissolve" : bones ? "bones" : null}
            cover={false}
            scanY={scanY}
            onBeatDone={onBeatDone}
          />
        </Suspense>
      ) : null}
      {scan || wipe ? <ScanSweep scanY={scanY} /> : null}
    </group>
  )
}

export { RevealRig }
export type { ClipSource }
