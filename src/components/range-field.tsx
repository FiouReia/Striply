import { useId } from "react";
export function RangeField({ label, value, min, max, step = 1, onChange, suffix = "" }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; suffix?: string }) {
 const id = useId();
 return <div className="range-field"><span><label htmlFor={id}>{label}</label><span className="range-value" aria-hidden="true">{Number(value.toFixed(2))}{suffix}</span></span><input id={id} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} /></div>;
}
