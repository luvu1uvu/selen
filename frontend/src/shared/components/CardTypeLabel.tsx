/** Цветная метка типа карточки (на доске, в панели карточки, в справочнике). */
export function CardTypeLabel({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  )
}
