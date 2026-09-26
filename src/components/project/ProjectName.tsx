/** A project's ID above its title, for lists and cards. */
export default function ProjectName({ refId, title, className }: { refId?: string | null; title: string; className?: string }) {
  return (
    <span className={className}>
      {refId && <span className="block font-mono text-xs font-normal text-muted-foreground">{refId}</span>}
      <span className="break-words">{title}</span>
    </span>
  );
}
