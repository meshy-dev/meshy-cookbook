"use client"

import { Button } from "@ui-sdk/react/button"
import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaThumb,
  ColorPickerInput,
  ColorPickerSlider,
  ColorPickerSliderThumb,
  ColorPickerSwatches,
  ColorPickerSwatchItem,
} from "@ui-sdk/react/color-picker"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@ui-sdk/react/combobox"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/react/slider"
import { Switch, SwitchThumb } from "@ui-sdk/react/switch"
import { Toggle } from "@ui-sdk/react/toggle"
import { PauseIcon, PlayIcon, WandSparklesIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { generateMotion, playAnimation } from "@/lib/pipeline"
import {
  activeCharacter,
  useStudio,
  type Backdrop,
  type Camera,
  type Finish,
} from "@/lib/store"
import { Anchor } from "./anchor"

const CAMERAS: { value: Camera; label: string }[] = [
  { value: "hero", label: "Hero" },
  { value: "front", label: "Front" },
  { value: "side", label: "Side" },
  { value: "back", label: "Back" },
  { value: "face", label: "Face" },
]

const FINISHES: { value: Finish; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "matte", label: "Matte" },
  { value: "metal", label: "Metal" },
  { value: "wire", label: "Wire" },
]

const BACKDROPS: { value: Backdrop; label: string }[] = [
  { value: "studio", label: "Studio" },
  { value: "sunset", label: "Sunset" },
  { value: "night", label: "Night" },
  { value: "void", label: "Void" },
]

const SWATCHES = [
  { value: "#ffffff", label: "None" },
  { value: "#f5c542", label: "Gold" },
  { value: "#c6ff3d", label: "Lime" },
  { value: "#39e6ff", label: "Cyan" },
  { value: "#ff5d8f", label: "Rose" },
  { value: "#8b5cf6", label: "Violet" },
]

function Segments<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <Anchor label={label}>
      <Field>
        <FieldLabel>{label}</FieldLabel>
        <SegmentedControl
          value={value}
          onValueChange={(next) => next && onChange(next as T)}
        >
          <SegmentedControlIndicator />
          {options.map((option) => (
            <SegmentedControlItem key={option.value} value={option.value}>
              {option.label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </Field>
    </Anchor>
  )
}

function categoryLabel(category: string) {
  const words = category.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function AnimationPicker({ disabled }: { disabled: boolean }) {
  const library = useStudio((state) => state.library)
  const animation = useStudio((state) => state.animation)
  const loading = useStudio((state) => state.loadingAnimation)
  const character = useStudio(activeCharacter)

  const items = useMemo(() => {
    const extra = (character?.clips ?? [])
      .filter((clip) => !library.some((item) => item.id === clip.id))
      .map((clip) => ({ id: clip.id, name: clip.name, category: "Yours" }))
    return [...extra, ...library]
  }, [character?.clips, library])

  return (
    <Anchor label="Animation">
      <Combobox
        disabled={disabled}
        value={animation}
        onValueChange={(value) => {
          if (typeof value === "string") void playAnimation(value)
        }}
      >
        <ComboboxLabel>Animation</ComboboxLabel>
        <ComboboxInput placeholder="Search animations" />
        <ComboboxContent>
          <ComboboxEmpty>No animations match.</ComboboxEmpty>
          <ComboboxList>
            {items.map((item) => (
              <ComboboxItem
                key={item.id}
                value={item.id}
                label={item.name}
                data-category={categoryLabel(item.category)}
              >
                {item.name}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {loading ? (
        <p className="hint" role="status">
          Retargeting onto your character…
        </p>
      ) : null}
    </Anchor>
  )
}

function DirectorPanel() {
  const character = useStudio(activeCharacter)
  const playing = useStudio((state) => state.playing)
  const speed = useStudio((state) => state.speed)
  const camera = useStudio((state) => state.camera)
  const autoRotate = useStudio((state) => state.autoRotate)
  const finish = useStudio((state) => state.finish)
  const tint = useStudio((state) => state.tint)
  const backdrop = useStudio((state) => state.backdrop)
  const skeleton = useStudio((state) => state.skeleton)
  const loading = useStudio((state) => state.loadingAnimation)
  const set = useStudio((state) => state.set)
  const [motion, setMotion] = useState("")
  const ready = character?.stage === "ready" && !character.expired

  return (
    <aside className="panel" aria-label="Direct">
      <section className="panel-section">
        <h2>Motion</h2>
        <AnimationPicker disabled={!ready} />
        <div className="row">
          <Anchor label="Play">
            <Toggle
              aria-label="Play"
              className="icon-button"
              pressed={playing}
              onPressedChange={(pressed) => set({ playing: pressed })}
            >
              {playing ? (
                <PauseIcon aria-hidden="true" />
              ) : (
                <PlayIcon aria-hidden="true" />
              )}
            </Toggle>
          </Anchor>
          <Anchor label="Speed" className="grow">
            <Slider
              min={0.1}
              max={2}
              step={0.1}
              value={speed}
              onValueChange={(value) => set({ speed: value as number })}
              format={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
            >
              <div className="row spread">
                <span className="label">Speed</span>
                <SliderValue />
              </div>
              <SliderControl>
                <SliderTrack>
                  <SliderIndicator />
                  <SliderThumb aria-label="Speed" />
                </SliderTrack>
              </SliderControl>
            </Slider>
          </Anchor>
        </div>
        <Anchor label="Motion prompt">
          <Field>
            <FieldLabel>Motion prompt</FieldLabel>
            <Input
              value={motion}
              onValueChange={(value) => setMotion(value)}
              placeholder="A slow victory dance"
              disabled={!ready}
            />
          </Field>
        </Anchor>
        <Anchor label="Generate motion">
          <Button
            disabled={!ready || Boolean(loading) || motion.trim().length < 3}
            data-agent-confirm="Starts a Meshy job that costs about 13 credits"
            onClick={() => generateMotion(motion.trim())}
          >
            <WandSparklesIcon aria-hidden="true" />
            Generate motion
          </Button>
        </Anchor>
      </section>

      <section className="panel-section">
        <h2>Shot</h2>
        <Segments
          label="Camera"
          value={camera}
          options={CAMERAS}
          onChange={(value) => set({ camera: value })}
        />
        <Anchor label="Auto-rotate">
          <label className="row spread">
            <span className="label">Auto-rotate</span>
            <Switch
              checked={autoRotate}
              onCheckedChange={(checked) => set({ autoRotate: checked })}
            >
              <SwitchThumb />
            </Switch>
          </label>
        </Anchor>
      </section>

      <section className="panel-section">
        <h2>Look</h2>
        <Segments
          label="Finish"
          value={finish}
          options={FINISHES}
          onChange={(value) => set({ finish: value })}
        />
        <Anchor label="Tint">
          <Field>
            <FieldLabel>Tint</FieldLabel>
            <ColorPicker
              className="tint"
              value={tint}
              onValueChange={(value) => set({ tint: String(value) })}
            >
              <ColorPickerArea>
                <ColorPickerAreaThumb />
              </ColorPickerArea>
              <ColorPickerSlider channel="hue">
                <ColorPickerSliderThumb />
              </ColorPickerSlider>
              <div className="row">
                <ColorPickerSwatches aria-label="Tint presets">
                  {SWATCHES.map((swatch) => (
                    <ColorPickerSwatchItem
                      key={swatch.value}
                      value={swatch.value}
                      aria-label={swatch.label}
                    />
                  ))}
                </ColorPickerSwatches>
                <ColorPickerInput aria-label="Tint hex" />
              </div>
            </ColorPicker>
          </Field>
        </Anchor>
        <Segments
          label="Backdrop"
          value={backdrop}
          options={BACKDROPS}
          onChange={(value) => set({ backdrop: value })}
        />
        <Anchor label="Skeleton">
          <label className="row spread">
            <span className="label">Skeleton</span>
            <Switch
              checked={skeleton}
              onCheckedChange={(checked) => set({ skeleton: checked })}
            >
              <SwitchThumb />
            </Switch>
          </label>
        </Anchor>
      </section>
    </aside>
  )
}

export { DirectorPanel }
