import { RangeField } from "@/components/range-field";
import { defaultEffects, effectPresets, type PhotoEffects } from "../photos/effects";
export function PhotoEffectsPanel({ effects, onChange }: { effects: PhotoEffects; onChange: (effects: PhotoEffects) => void }) {
  return <section className="photo-effects" aria-label="Photo effects">
    <div className="effects-heading"><h3>Photo effects</h3><button className="text-button" onClick={() => onChange(defaultEffects())}>Reset effects</button></div>
    <p className="muted small">A little mood, just for this photo.</p>
    <div className="effect-presets" role="group" aria-label="Photo effect presets">
      {effectPresets.map(preset => <button key={preset.id} className={`effect-preset ${effects.preset === preset.id ? "active" : ""}`} aria-pressed={effects.preset === preset.id} onClick={() => onChange({ ...effects, preset: preset.id })}>
        <span className={`effect-swatch ${preset.id}`} aria-hidden="true" /><span>{preset.name}</span>
      </button>)}
    </div>
    <RangeField label="Brightness" value={effects.brightness} min={0} max={200} suffix="%" onChange={brightness => onChange({ ...effects, brightness })} />
    <RangeField label="Contrast" value={effects.contrast} min={0} max={200} suffix="%" onChange={contrast => onChange({ ...effects, contrast })} />
    <RangeField label="Saturation" value={effects.saturation} min={0} max={200} suffix="%" onChange={saturation => onChange({ ...effects, saturation })} />
  </section>;
}
